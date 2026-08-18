/* ---------------------------------------------------------
   Coletor de estatísticas — Cloudflare Worker + D1.

   POST /hit    grava um evento (visita, visualização, download)
   GET  /stats  devolve os números agregados (exige STATS_KEY)

   Sem cookies e sem identificar ninguém: só contadores por dia.
   Instruções de publicação em analytics/README.md.
   --------------------------------------------------------- */

const KINDS = ['page', 'gallery', 'view', 'download'];
const BOT = /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|slackbot|telegram|preview|headless|lighthouse|pingdom|curl|wget/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': env.SITE_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/hit' && request.method === 'POST') return await hit(request, env, cors);
      if (url.pathname === '/stats' && request.method === 'GET') return await stats(url, request, env, cors);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500, cors);
    }

    return json({ error: 'not found' }, 404, cors);
  }
};

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors }
  });
}

function clean(value, max) {
  return String(value == null ? '' : value).slice(0, max).replace(/[\u0000-\u001f]/g, '');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Gravação ----------

async function hit(request, env, cors) {
  // sendBeacon manda text/plain — ler como texto e converter
  const raw = await request.text();
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400, cors); }

  const agent = request.headers.get('user-agent') || '';
  if (BOT.test(agent)) return json({ ok: true, skipped: 'bot' }, 200, cors);

  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [body];
  const statements = [];

  for (const event of events) {
    const kind = clean(event.kind, 16);
    if (!KINDS.includes(kind)) continue;

    statements.push(
      env.DB.prepare(
        `INSERT INTO events (day, kind, gallery, photo, count) VALUES (?1, ?2, ?3, ?4, 1)
         ON CONFLICT (day, kind, gallery, photo) DO UPDATE SET count = count + 1`
      ).bind(today(), kind, clean(event.gallery, 80), clean(event.photo, 120))
    );
  }

  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true, saved: statements.length }, 200, cors);
}

// ---------- Leitura ----------

async function stats(url, request, env, cors) {
  const key = url.searchParams.get('key') ||
    (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

  if (!env.STATS_KEY || key !== env.STATS_KEY) {
    return json({ error: 'unauthorized' }, 401, cors);
  }

  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);

  const [daily, galleries, photos, totals] = await env.DB.batch([
    env.DB.prepare(
      `SELECT day, kind, SUM(count) AS count FROM events WHERE day >= ?1
       GROUP BY day, kind ORDER BY day`
    ).bind(since),

    env.DB.prepare(
      `SELECT gallery, kind, SUM(count) AS count FROM events
       WHERE day >= ?1 AND gallery <> '' GROUP BY gallery, kind`
    ).bind(since),

    env.DB.prepare(
      `SELECT gallery, photo, kind, SUM(count) AS count FROM events
       WHERE day >= ?1 AND photo <> '' GROUP BY gallery, photo, kind`
    ).bind(since),

    env.DB.prepare(`SELECT kind, SUM(count) AS count FROM events GROUP BY kind`)
  ]);

  return json({
    since,
    days,
    daily: daily.results,
    galleries: galleries.results,
    photos: photos.results,
    allTime: totals.results
  }, 200, cors);
}
