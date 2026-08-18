/* ---------------------------------------------------------
   Track — manda os eventos para o coletor (Cloudflare Worker).

   Sem cookies, sem identificador, sem dado pessoal: só "abriram
   a galeria X", "viram a foto Y", "baixaram a foto Y".

   Fica inerte enquanto site.statsEndpoint estiver vazio no
   galleries.json, então o site funciona igual sem o coletor.
   --------------------------------------------------------- */
window.Track = (function () {
  'use strict';

  var endpoint = '';
  var queue = [];
  var timer = null;

  function configure(site) {
    endpoint = (site && site.statsEndpoint) || '';
    if (endpoint) flush();
  }

  function send(kind, gallery, photo) {
    if (!endpoint) return;          // coletor não configurado: nada a fazer

    queue.push({
      kind: kind,
      gallery: gallery || '',
      photo: photo ? String(photo).split('/').pop() : ''
    });

    // Junta os eventos de um mesmo instante em uma requisição só
    clearTimeout(timer);
    timer = setTimeout(flush, 800);
  }

  function flush() {
    if (!endpoint || !queue.length) return;

    var body = JSON.stringify({ events: queue.splice(0, 50) });
    var url = endpoint.replace(/\/+$/, '') + '/hit';

    // text/plain evita o preflight do CORS
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
        return;
      }
    } catch (e) { /* cai no fetch abaixo */ }

    fetch(url, { method: 'POST', body: body, keepalive: true, mode: 'cors' })
      .catch(function () { /* estatística nunca atrapalha o site */ });
  }

  // Não perder o que estiver na fila ao sair da página
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  window.addEventListener('pagehide', flush);

  return {
    configure: configure,
    page: function () { send('page'); },
    gallery: function (id) { send('gallery', id); },
    view: function (id, file) { send('view', id, file); },
    download: function (id, file) { send('download', id, file); }
  };
})();
