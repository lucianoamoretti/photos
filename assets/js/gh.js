/* ---------------------------------------------------------
   GH — camada compartilhada entre /upload e /edit.
   Token, chamadas à API do GitHub e commit atômico.
   O token fica só no localStorage deste navegador.
   --------------------------------------------------------- */
window.GH = (function () {
  'use strict';

  var TOKEN_KEY = 'photos.gh_token';
  var API = 'https://api.github.com';

  var state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    repo: 'lucianoamoretti/photos',
    branch: 'main'
  };

  // ---------- Conversões ----------

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str), bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    var bin = atob((b64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = function () { reject(new Error('Falha ao ler o arquivo')); };
      fr.readAsDataURL(blob);
    });
  }

  // ---------- Texto ----------

  function slugify(s) {
    return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function prettyTitle(filename) {
    var stem = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : filename;
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* "@Fulano", "instagram.com/fulano" -> "fulano" ("" se não parecer um usuário) */
  function instagramHandle(raw) {
    var h = (raw || '').trim()
      .replace(/^(https?:\/\/)?(www\.)?instagram\.com\/?/i, '')
      .replace(/[/?#].*$/, '')
      .replace(/^@+/, '');
    return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : '';
  }

  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name);
    return m ? m[1].toLowerCase() : 'jpg';
  }

  // ---------- API ----------

  var RETRIES = 4;   // tentativas extras antes de desistir de uma requisição

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* Vale tentar de novo? Erro de rede, instabilidade do GitHub e limite de
     requisições passam; token errado ou caminho inexistente, não. */
  function transient(status, message) {
    if (status >= 500) return true;
    if (status === 429) return true;
    if (status === 403 && /rate limit|secondary|abuse|try again/i.test(message || '')) return true;
    return false;
  }

  /* Quanto esperar: o que o GitHub pedir, senão uma espera que cresce a cada
     tentativa (com um tempero aleatório, para várias abas não voltarem juntas). */
  function backoff(response, attempt) {
    if (response) {
      var after = response.headers.get('retry-after');
      if (after && !isNaN(+after)) return Math.min(+after * 1000, 60000);

      var left = response.headers.get('x-ratelimit-remaining');
      var reset = response.headers.get('x-ratelimit-reset');
      if (left === '0' && reset) {
        var until = (+reset * 1000) - Date.now();
        if (until > 0) return Math.min(until + 1000, 60000);
      }
    }
    return Math.min(1200 * Math.pow(2.2, attempt), 20000) + Math.floor(Math.random() * 600);
  }

  function api(path, opts) {
    opts = opts || {};
    var attempt = 0;

    function once() {
      return fetch(API + path, {
        method: opts.method || 'GET',
        headers: {
          'Authorization': 'Bearer ' + state.token,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (r) {
        return r.text().then(function (txt) {
          var json = {};
          try { json = txt ? JSON.parse(txt) : {}; } catch (e) { /* resposta sem JSON */ }
          if (r.ok) return json;

          var msg = json.message || ('HTTP ' + r.status);

          if (transient(r.status, msg) && attempt < RETRIES) {
            var wait = backoff(r, attempt++);
            if (opts.onRetry) opts.onRetry(attempt, Math.round(wait / 1000), msg);
            return sleep(wait).then(once);
          }

          if (r.status === 401) msg = 'Token inválido ou expirado.';
          else if (r.status === 403 && !transient(403, msg)) msg = 'Token sem permissão de escrita neste repositório.';
          else if (r.status === 403) msg = 'O GitHub pediu para desacelerar e continuou pedindo: ' + msg;
          else if (r.status === 404) msg = 'Não encontrado — confira se o token tem acesso ao repositório.';
          else if (r.status === 409 || r.status === 422) {
            msg = (json.message || 'Conflito') + ' — recarregue a página e tente de novo.';
          }
          throw new Error(msg);
        });
      }, function (netErr) {
        /* fetch rejeitou: rede caiu, celular trocou de Wi-Fi para 4G, aba dormiu */
        if (attempt < RETRIES) {
          var wait = backoff(null, attempt++);
          if (opts.onRetry) opts.onRetry(attempt, Math.round(wait / 1000), 'network');
          return sleep(wait).then(once);
        }
        throw new Error('Sem resposta da rede: ' + (netErr && netErr.message ? netErr.message : netErr));
      });
    }

    return once();
  }

  /* Roda várias tarefas ao mesmo tempo, mas só algumas por vez.
     tasks = [function -> Promise]; devolve os resultados na ordem de entrada. */
  function pool(tasks, limit) {
    var results = new Array(tasks.length);
    var next = 0;

    function worker() {
      if (next >= tasks.length) return Promise.resolve();
      var i = next++;
      return tasks[i]().then(function (value) {
        results[i] = value;
        return worker();
      });
    }

    var runners = [];
    for (var i = 0; i < Math.min(limit || 3, tasks.length); i++) runners.push(worker());
    return Promise.all(runners).then(function () { return results; });
  }

  /* Valida o token e descobre a branch padrão. */
  function connect(token, remember) {
    state.token = token;
    return api('/repos/' + state.repo).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error('Este token não tem permissão de escrita no repositório.');
      }
      state.branch = repo.default_branch || 'main';
      if (remember) localStorage.setItem(TOKEN_KEY, state.token);
      return repo;
    }).catch(function (err) {
      if (remember) localStorage.removeItem(TOKEN_KEY);
      throw err;
    });
  }

  function forgetToken() {
    localStorage.removeItem(TOKEN_KEY);
    state.token = '';
  }

  function loadManifest() {
    return api('/repos/' + state.repo + '/contents/galleries.json?ref=' + state.branch)
      .then(function (res) {
        var data = JSON.parse(base64ToUtf8(res.content));
        if (!data.galleries) data.galleries = [];
        if (!data.site) data.site = {};
        return data;
      })
      .catch(function () {
        return { site: {}, galleries: [] };   // manifesto ainda não existe
      });
  }

  function putBlob(blob, opts) {
    var toB64 = typeof blob === 'string'
      ? Promise.resolve(utf8ToBase64(blob))
      : blobToBase64(blob);

    return toB64.then(function (b64) {
      return api('/repos/' + state.repo + '/git/blobs', {
        method: 'POST',
        body: { content: b64, encoding: 'base64' },
        onRetry: opts && opts.onRetry
      });
    }).then(function (res) { return res.sha; });
  }

  /* Lista todos os caminhos versionados -> sha, para renomear sem reenviar bytes. */
  function loadTree() {
    return api('/repos/' + state.repo + '/git/ref/heads/' + state.branch)
      .then(function (ref) {
        return api('/repos/' + state.repo + '/git/commits/' + ref.object.sha);
      })
      .then(function (commit) {
        return api('/repos/' + state.repo + '/git/trees/' + commit.tree.sha + '?recursive=1');
      })
      .then(function (tree) {
        var map = {};
        (tree.tree || []).forEach(function (e) {
          if (e.type === 'blob') map[e.path] = e.sha;
        });
        return map;
      });
  }

  /* Quantos arquivos por chamada ao montar a árvore. Mandar as 272 entradas
     de um envio de 90 fotos de uma vez faz o GitHub responder "your request
     timed out... input was too large to process" — e a saída é a que a
     própria mensagem sugere: montar a árvore em levas. */
  var TREE_CHUNK = 30;

  function treeEntry(e) {
    return {
      path: e.path,
      mode: '100644',
      type: 'blob',
      sha: e.remove ? null : e.sha
    };
  }

  /* Cada leva parte da árvore que a anterior devolveu, então no fim existe
     uma árvore só com tudo dentro — e o commit continua sendo um só. */
  function buildTree(baseSha, entries, onProgress) {
    var current = baseSha;
    var at = 0;
    var chunk = TREE_CHUNK;

    function step() {
      if (at >= entries.length) return Promise.resolve(current);

      var slice = entries.slice(at, at + chunk);

      return api('/repos/' + state.repo + '/git/trees', {
        method: 'POST',
        body: { base_tree: current, tree: slice.map(treeEntry) }
      }).then(function (tree) {
        current = tree.sha;
        at += slice.length;
        if (onProgress) onProgress(at, entries.length);
        return step();
      }, function (err) {
        // Ainda grande demais para este repositório: parte a leva no meio
        if (/too large|timed out/i.test(err.message || '') && slice.length > 1) {
          chunk = Math.floor(slice.length / 2);
          return step();
        }
        throw err;
      });
    }

    return step();
  }

  /* Um commit só com tudo: entries = [{path, sha}] ou [{path, remove:true}] */
  function commit(message, entries, onProgress) {
    var headSha;

    return api('/repos/' + state.repo + '/git/ref/heads/' + state.branch)
      .then(function (ref) {
        headSha = ref.object.sha;
        return api('/repos/' + state.repo + '/git/commits/' + headSha);
      })
      .then(function (parent) {
        return buildTree(parent.tree.sha, entries, onProgress);
      })
      .then(function (treeSha) {
        return api('/repos/' + state.repo + '/git/commits', {
          method: 'POST',
          body: { message: message, tree: treeSha, parents: [headSha] }
        });
      })
      .then(function (newCommit) {
        return api('/repos/' + state.repo + '/git/refs/heads/' + state.branch, {
          method: 'PATCH',
          body: { sha: newCommit.sha }
        });
      });
  }

  return {
    state: state,
    api: api,
    pool: pool,
    connect: connect,
    forgetToken: forgetToken,
    loadManifest: loadManifest,
    loadTree: loadTree,
    putBlob: putBlob,
    commit: commit,
    utf8ToBase64: utf8ToBase64,
    base64ToUtf8: base64ToUtf8,
    blobToBase64: blobToBase64,
    slugify: slugify,
    prettyTitle: prettyTitle,
    pad: pad,
    today: today,
    humanSize: humanSize,
    extOf: extOf,
    instagramHandle: instagramHandle
  };
})();
