/* ---------------------------------------------------------
   Upload — envia fotos para o repositório via API do GitHub
   e atualiza galleries.json em um único commit.
   O token fica só no localStorage deste navegador.
   --------------------------------------------------------- */
(function () {
  'use strict';

  var TOKEN_KEY = 'photos.gh_token';
  var API = 'https://api.github.com';

  var state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    repo: 'lucianoamoretti/photos',
    branch: 'main',
    data: null,
    items: [],
    busy: false
  };

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    authPill: $('authPill'), authForm: $('authForm'), authDone: $('authDone'), authWho: $('authWho'),
    tokenInput: $('tokenInput'), btnConnect: $('btnConnect'), btnForget: $('btnForget'),
    repoName: $('repoName'),
    cardGallery: $('cardGallery'), cardCredits: $('cardCredits'), cardFiles: $('cardFiles'),
    cardPublish: $('cardPublish'),
    gallerySelect: $('gallerySelect'), newFields: $('newGalleryFields'),
    galleryName: $('galleryName'), galleryDesc: $('galleryDesc'), slugPreview: $('gallerySlugPreview'),
    defAuthor: $('defAuthor'), defYear: $('defYear'), defLicense: $('defLicense'), defLocation: $('defLocation'),
    dropzone: $('dropzone'), fileInput: $('fileInput'), fileList: $('fileList'), filesPill: $('filesPill'),
    resizeToggle: $('resizeToggle'), maxSize: $('maxSize'),
    btnPublish: $('btnPublish'), progressWrap: $('progressWrap'), progressBar: $('progressBar'),
    progressText: $('progressText'), log: $('log'),
    doneBox: $('doneBox'), doneText: $('doneText'), doneLink: $('doneLink'), btnAnother: $('btnAnother')
  };

  // ---------- Utilidades ----------

  function slugify(s) {
    return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function prettyTitle(filename) {
    var stem = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : filename;
  }

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

  function today() {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

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
          throw new Error(msg);
        }
        return json;
      });
    });
  }

  function log(msg) {
    el.log.hidden = false;
    el.log.textContent += msg + '\n';
    el.log.scrollTop = el.log.scrollHeight;
  }

  function progress(done, total, label) {
    el.progressWrap.hidden = false;
    el.progressBar.style.width = Math.round((done / total) * 100) + '%';
    el.progressText.textContent = label;
  }

  // ---------- Conexão ----------

  el.repoName.textContent = state.repo;

  el.btnConnect.addEventListener('click', function () {
    var token = el.tokenInput.value.trim();
    if (!token) { alertMsg('Cole o token primeiro.'); return; }
    state.token = token;
    connect(true);
  });

  el.tokenInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') el.btnConnect.click();
  });

  el.btnForget.addEventListener('click', function () {
    localStorage.removeItem(TOKEN_KEY);
    state.token = '';
    location.reload();
  });

  function alertMsg(msg) {
    el.authPill.textContent = msg;
    el.authPill.className = 'pill pill--error';
  }

  function connect(save) {
    el.btnConnect.disabled = true;
    el.authPill.textContent = 'Conectando…';
    el.authPill.className = 'pill';

    api('/repos/' + state.repo)
      .then(function (repo) {
        if (!repo.permissions || !repo.permissions.push) {
          throw new Error('Este token não tem permissão de escrita no repositório.');
        }
        state.branch = repo.default_branch || 'main';
        if (save) localStorage.setItem(TOKEN_KEY, state.token);
        return loadManifest();
      })
      .then(function () {
        el.authPill.textContent = 'Conectado';
        el.authPill.className = 'pill pill--ok';
        el.authForm.hidden = true;
        el.authDone.hidden = false;
        el.authWho.textContent = 'Escrevendo em ' + state.repo + ' (branch ' + state.branch + ').';
        showForm();
      })
      .catch(function (err) {
        el.btnConnect.disabled = false;
        alertMsg(err.message);
        if (save) localStorage.removeItem(TOKEN_KEY);
      });
  }

  function loadManifest() {
    return api('/repos/' + state.repo + '/contents/galleries.json?ref=' + state.branch)
      .then(function (res) {
        state.data = JSON.parse(base64ToUtf8(res.content));
        if (!state.data.galleries) state.data.galleries = [];
        if (!state.data.site) state.data.site = {};
      })
      .catch(function () {
        // Manifesto ainda não existe: começa do zero
        state.data = { site: {}, galleries: [] };
      });
  }

  function showForm() {
    el.cardGallery.hidden = false;
    el.cardCredits.hidden = false;
    el.cardFiles.hidden = false;
    el.cardPublish.hidden = false;

    var site = state.data.site || {};
    el.defAuthor.value = el.defAuthor.value || site.defaultAuthor || '';
    el.defYear.value = el.defYear.value || site.defaultYear || String(new Date().getFullYear());
    if (site.defaultLicense) {
      for (var i = 0; i < el.defLicense.options.length; i++) {
        if (el.defLicense.options[i].value === site.defaultLicense) el.defLicense.selectedIndex = i;
      }
    }

    fillGallerySelect();
    updateSlugPreview();
    refreshPublishState();
  }

  function fillGallerySelect() {
    var sel = el.gallerySelect;
    sel.innerHTML = '';

    var optNew = document.createElement('option');
    optNew.value = '__new__';
    optNew.textContent = '➕ Nova galeria';
    sel.appendChild(optNew);

    (state.data.galleries || []).forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.id;
      o.textContent = (g.name || g.id) + ' (' + ((g.photos || []).length) + ')';
      sel.appendChild(o);
    });
  }

  // ---------- Galeria ----------

  el.gallerySelect.addEventListener('change', function () {
    var isNew = el.gallerySelect.value === '__new__';
    el.newFields.hidden = !isNew;
    refreshPublishState();
  });

  el.galleryName.addEventListener('input', function () {
    updateSlugPreview();
    refreshPublishState();
  });

  function updateSlugPreview() {
    var s = slugify(el.galleryName.value);
    el.slugPreview.textContent = 'images/' + (s || '…') + '/';
  }

  // ---------- Arquivos ----------

  el.fileInput.addEventListener('change', function () {
    addFiles(el.fileInput.files);
    el.fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (evt) {
    el.dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      el.dropzone.classList.add('dropzone--over');
    });
  });

  ['dragleave', 'drop'].forEach(function (evt) {
    el.dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      el.dropzone.classList.remove('dropzone--over');
    });
  });

  el.dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  var nextId = 1;

  function addFiles(fileList) {
    Array.prototype.slice.call(fileList).forEach(function (file) {
      if (!/^image\//.test(file.type)) return;
      state.items.push({
        id: nextId++,
        file: file,
        title: prettyTitle(file.name),
        author: ''
      });
    });
    renderFiles();
    refreshPublishState();
  }

  function renderFiles() {
    el.fileList.innerHTML = '';
    el.filesPill.hidden = state.items.length === 0;
    el.filesPill.textContent = state.items.length + (state.items.length === 1 ? ' foto' : ' fotos');

    state.items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'fileitem';

      var thumb = document.createElement('img');
      thumb.className = 'fileitem-thumb';
      thumb.src = URL.createObjectURL(item.file);
      thumb.alt = '';
      thumb.onload = function () { URL.revokeObjectURL(thumb.src); };
      li.appendChild(thumb);

      var fields = document.createElement('div');
      fields.className = 'fileitem-fields';

      var title = document.createElement('input');
      title.type = 'text';
      title.className = 'input input--sm';
      title.value = item.title;
      title.placeholder = 'Título da foto';
      title.setAttribute('aria-label', 'Título da foto');
      title.addEventListener('input', function () { item.title = title.value; });
      fields.appendChild(title);

      var author = document.createElement('input');
      author.type = 'text';
      author.className = 'input input--sm';
      author.value = item.author;
      author.placeholder = 'Autor (deixe vazio para usar o padrão)';
      author.setAttribute('aria-label', 'Autor desta foto');
      author.addEventListener('input', function () { item.author = author.value; });
      fields.appendChild(author);

      var meta = document.createElement('p');
      meta.className = 'fileitem-meta';
      meta.textContent = item.file.name + ' · ' + humanSize(item.file.size);
      fields.appendChild(meta);

      li.appendChild(fields);

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'fileitem-rm';
      rm.innerHTML = '&times;';
      rm.title = 'Remover';
      rm.setAttribute('aria-label', 'Remover ' + item.file.name);
      rm.addEventListener('click', function () {
        state.items = state.items.filter(function (x) { return x.id !== item.id; });
        renderFiles();
        refreshPublishState();
      });
      li.appendChild(rm);

      el.fileList.appendChild(li);
    });
  }

  function refreshPublishState() {
    var hasGallery = el.gallerySelect.value !== '__new__' || slugify(el.galleryName.value).length > 0;
    el.btnPublish.disabled = state.busy || !hasGallery || state.items.length === 0;
  }

  // ---------- Redimensionamento ----------

  function loadBitmap(file) {
    if (!window.createImageBitmap) return Promise.reject(new Error('sem createImageBitmap'));
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(function () { return createImageBitmap(file); });
  }

  function processImage(file) {
    if (!el.resizeToggle.checked) {
      return Promise.resolve({ blob: file, ext: extOf(file.name) });
    }

    var max = Math.max(600, Math.min(6000, parseInt(el.maxSize.value, 10) || 2000));

    return loadBitmap(file).then(function (bmp) {
      var scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      var w = Math.max(1, Math.round(bmp.width * scale));
      var h = Math.max(1, Math.round(bmp.height * scale));

      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();

      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          resolve(blob ? { blob: blob, ext: 'jpg' } : { blob: file, ext: extOf(file.name) });
        }, 'image/jpeg', 0.85);
      });
    }).catch(function () {
      return { blob: file, ext: extOf(file.name) };
    });
  }

  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name);
    return m ? m[1].toLowerCase() : 'jpg';
  }

  // ---------- Publicação ----------

  el.btnPublish.addEventListener('click', publish);

  el.btnAnother.addEventListener('click', function () {
    state.items = [];
    renderFiles();
    el.doneBox.hidden = true;
    el.log.hidden = true;
    el.log.textContent = '';
    el.progressWrap.hidden = true;
    fillGallerySelect();
    refreshPublishState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function publish() {
    var isNew = el.gallerySelect.value === '__new__';
    var defAuthor = el.defAuthor.value.trim();

    var missingAuthor = state.items.some(function (it) { return !it.author.trim() && !defAuthor; });
    if (missingAuthor) {
      alert('Preencha o autor padrão (passo 3) ou o autor de cada foto — o crédito de direito autoral é obrigatório.');
      el.defAuthor.focus();
      return;
    }

    var gallery;
    if (isNew) {
      var name = el.galleryName.value.trim();
      var id = uniqueGalleryId(slugify(name));
      gallery = {
        id: id,
        name: name,
        description: el.galleryDesc.value.trim(),
        createdAt: today(),
        cover: '',
        photos: []
      };
    } else {
      gallery = state.data.galleries.filter(function (g) { return g.id === el.gallerySelect.value; })[0];
      if (!gallery) { alert('Galeria não encontrada. Recarregue a página.'); return; }
      if (!gallery.photos) gallery.photos = [];
    }

    state.busy = true;
    el.btnPublish.disabled = true;
    el.log.textContent = '';
    el.doneBox.hidden = true;

    var total = state.items.length + 4;
    var step = 0;
    var used = {};
    (gallery.photos || []).forEach(function (p) { used[p.file.split('/').pop().toLowerCase()] = true; });

    var newPhotos = [];
    var blobs = [];   // {path, sha}

    var chain = Promise.resolve();

    state.items.forEach(function (item, i) {
      chain = chain.then(function () {
        progress(step, total, 'Preparando ' + (i + 1) + '/' + state.items.length + ': ' + item.file.name);
        return processImage(item.file);
      }).then(function (out) {
        var base = slugify(item.title) || slugify(item.file.name.replace(/\.[^.]+$/, '')) || 'foto';
        var filename = base + '.' + out.ext;
        var n = 2;
        while (used[filename.toLowerCase()]) { filename = base + '-' + n + '.' + out.ext; n++; }
        used[filename.toLowerCase()] = true;

        var path = 'images/' + gallery.id + '/' + filename;
        log('↑ ' + path + ' (' + humanSize(out.blob.size) + ')');

        return blobToBase64(out.blob).then(function (b64) {
          return api('/repos/' + state.repo + '/git/blobs', {
            method: 'POST',
            body: { content: b64, encoding: 'base64' }
          });
        }).then(function (blob) {
          blobs.push({ path: path, sha: blob.sha });
          newPhotos.push({
            file: path,
            title: item.title.trim() || prettyTitle(item.file.name),
            author: item.author.trim() || defAuthor,
            year: el.defYear.value.trim(),
            license: el.defLicense.value,
            location: el.defLocation.value.trim(),
            alt: ''
          });
          step++;
          progress(step, total, 'Enviadas ' + step + '/' + state.items.length);
        });
      });
    });

    chain.then(function () {
      // Atualiza o manifesto
      gallery.photos = (gallery.photos || []).concat(newPhotos);
      if (!gallery.cover && gallery.photos.length) gallery.cover = gallery.photos[0].file;
      if (isNew) state.data.galleries.push(gallery);

      var manifest = JSON.stringify(state.data, null, 2) + '\n';

      progress(++step, total, 'Atualizando galleries.json…');
      return api('/repos/' + state.repo + '/git/blobs', {
        method: 'POST',
        body: { content: utf8ToBase64(manifest), encoding: 'base64' }
      });
    }).then(function (manifestBlob) {
      blobs.push({ path: 'galleries.json', sha: manifestBlob.sha });

      progress(++step, total, 'Criando commit…');
      return api('/repos/' + state.repo + '/git/ref/heads/' + state.branch);
    }).then(function (ref) {
      var headSha = ref.object.sha;
      return api('/repos/' + state.repo + '/git/commits/' + headSha).then(function (commit) {
        return api('/repos/' + state.repo + '/git/trees', {
          method: 'POST',
          body: {
            base_tree: commit.tree.sha,
            tree: blobs.map(function (b) {
              return { path: b.path, mode: '100644', type: 'blob', sha: b.sha };
            })
          }
        }).then(function (tree) {
          return api('/repos/' + state.repo + '/git/commits', {
            method: 'POST',
            body: {
              message: 'Adiciona ' + newPhotos.length + ' foto(s) em "' + gallery.name + '"',
              tree: tree.sha,
              parents: [headSha]
            }
          });
        });
      });
    }).then(function (commit) {
      progress(++step, total, 'Publicando…');
      return api('/repos/' + state.repo + '/git/refs/heads/' + state.branch, {
        method: 'PATCH',
        body: { sha: commit.sha }
      });
    }).then(function () {
      progress(total, total, 'Pronto!');
      log('✓ Commit publicado.');
      state.busy = false;
      state.items = [];
      renderFiles();
      el.doneBox.hidden = false;
      el.doneText.textContent = newPhotos.length + ' foto(s) enviada(s) para "' + gallery.name +
        '". O site atualiza em cerca de 1 minuto.';
      el.doneLink.href = '../gallery.html?g=' + encodeURIComponent(gallery.id);
      fillGallerySelect();
      el.gallerySelect.value = gallery.id;
      el.newFields.hidden = true;
    }).catch(function (err) {
      console.error(err);
      log('✗ Erro: ' + err.message);
      progress(0, 1, 'Falhou — nada foi publicado.');
      // Desfaz as alterações locais no manifesto para não duplicar numa nova tentativa
      state.busy = false;
      loadManifest().then(function () {
        fillGallerySelect();
        refreshPublishState();
      });
    });
  }

  function uniqueGalleryId(base) {
    var id = base || 'galeria';
    var taken = {};
    (state.data.galleries || []).forEach(function (g) { taken[g.id] = true; });
    if (!taken[id]) return id;
    var n = 2;
    while (taken[id + '-' + n]) n++;
    return id + '-' + n;
  }

  // ---------- Início ----------

  if (state.token) {
    el.tokenInput.value = state.token;
    connect(false);
  }
})();
