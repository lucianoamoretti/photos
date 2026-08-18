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

  function api(path, opts) {
    opts = opts || {};
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
        if (!r.ok) {
          var msg = json.message || ('HTTP ' + r.status);
          if (r.status === 401) msg = 'Token inválido ou expirado.';
          if (r.status === 403) msg = 'Token sem permissão de escrita neste repositório.';
          if (r.status === 404) msg = 'Não encontrado — confira se o token tem acesso ao repositório.';
          if (r.status === 409 || r.status === 422) {
            msg = (json.message || 'Conflito') + ' — recarregue a página e tente de novo.';
          }
          throw new Error(msg);
        }
        return json;
      });
    });
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

  function putBlob(blob) {
    var toB64 = typeof blob === 'string'
      ? Promise.resolve(utf8ToBase64(blob))
      : blobToBase64(blob);

    return toB64.then(function (b64) {
      return api('/repos/' + state.repo + '/git/blobs', {
        method: 'POST',
        body: { content: b64, encoding: 'base64' }
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

  /* Um commit só com tudo: entries = [{path, sha}] ou [{path, remove:true}] */
  function commit(message, entries) {
    var headSha;

    return api('/repos/' + state.repo + '/git/ref/heads/' + state.branch)
      .then(function (ref) {
        headSha = ref.object.sha;
        return api('/repos/' + state.repo + '/git/commits/' + headSha);
      })
      .then(function (parent) {
        return api('/repos/' + state.repo + '/git/trees', {
          method: 'POST',
          body: {
            base_tree: parent.tree.sha,
            tree: entries.map(function (e) {
              return {
                path: e.path,
                mode: '100644',
                type: 'blob',
                sha: e.remove ? null : e.sha
              };
            })
          }
        });
      })
      .then(function (tree) {
        return api('/repos/' + state.repo + '/git/commits', {
          method: 'POST',
          body: { message: message, tree: tree.sha, parents: [headSha] }
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
