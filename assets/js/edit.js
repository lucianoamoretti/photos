/* ---------------------------------------------------------
   Editor de galerias — renomeia, reordena, troca a capa e
   apaga fotos, tudo em um único commit no fim.
   --------------------------------------------------------- */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    authPill: $('authPill'), authForm: $('authForm'), authDone: $('authDone'), authWho: $('authWho'),
    tokenInput: $('tokenInput'), btnConnect: $('btnConnect'), btnForget: $('btnForget'),
    repoName: $('repoName'),
    cardGallery: $('cardGallery'), cardCredits: $('cardCredits'), cardBulk: $('cardBulk'),
    cardPhotos: $('cardPhotos'), cardSave: $('cardSave'),
    gallerySelect: $('gallerySelect'), galleryName: $('galleryName'), galleryDesc: $('galleryDesc'),
    galleryFolder: $('galleryFolder'),
    defAuthor: $('defAuthor'), defYear: $('defYear'), defLicense: $('defLicense'),
    defLocation: $('defLocation'), btnApplyCredits: $('btnApplyCredits'),
    bulkTitle: $('bulkTitle'), bulkStart: $('bulkStart'), btnBulk: $('btnBulk'),
    bulkPreview: $('bulkPreview'), renameFiles: $('renameFiles'),
    orderSelect: $('orderSelect'), btnOrder: $('btnOrder'),
    photoList: $('photoList'), photosPill: $('photosPill'),
    changes: $('changes'), btnSave: $('btnSave'), btnReset: $('btnReset'),
    progressWrap: $('progressWrap'), progressBar: $('progressBar'), progressText: $('progressText'),
    log: $('log')
  };

  var state = {
    data: null,        // manifesto inteiro, como está no GitHub
    work: null,        // cópia da galeria em edição
    busy: false
  };

  // ---------- Conexão ----------

  el.repoName.textContent = GH.state.repo;

  el.btnConnect.addEventListener('click', function () {
    var token = el.tokenInput.value.trim();
    if (!token) { setPill('Cole o token primeiro.', 'error'); return; }
    connect(token, true);
  });

  el.tokenInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') el.btnConnect.click();
  });

  el.btnForget.addEventListener('click', function () {
    GH.forgetToken();
    location.reload();
  });

  function setPill(text, kind) {
    el.authPill.textContent = text;
    el.authPill.className = 'pill' + (kind ? ' pill--' + kind : '');
  }

  function connect(token, remember) {
    el.btnConnect.disabled = true;
    setPill('Conectando…');

    GH.connect(token, remember)
      .then(function () { return GH.loadManifest(); })
      .then(function (data) {
        state.data = data;
        setPill('Conectado', 'ok');
        el.authForm.hidden = true;
        el.authDone.hidden = false;
        el.authWho.textContent = 'Editando ' + GH.state.repo + ' (branch ' + GH.state.branch + ').';
        showEditor();
      })
      .catch(function (err) {
        el.btnConnect.disabled = false;
        setPill(err.message, 'error');
      });
  }

  function showEditor() {
    if (!state.data.galleries.length) {
      setPill('Nenhuma galeria para editar', 'off');
      return;
    }

    el.cardGallery.hidden = false;
    el.cardCredits.hidden = false;
    el.cardBulk.hidden = false;
    el.cardPhotos.hidden = false;
    el.cardSave.hidden = false;

    el.gallerySelect.innerHTML = '';
    state.data.galleries.forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.id;
      o.textContent = (g.name || g.id) + ' (' + ((g.photos || []).length) + ')';
      el.gallerySelect.appendChild(o);
    });

    loadGallery(state.data.galleries[0].id);
  }

  el.gallerySelect.addEventListener('change', function () {
    if (isDirty() && !confirm('Você tem alterações não salvas nesta galeria. Trocar mesmo assim?')) {
      el.gallerySelect.value = state.work.id;
      return;
    }
    loadGallery(el.gallerySelect.value);
  });

  function loadGallery(id) {
    var source = state.data.galleries.filter(function (g) { return g.id === id; })[0];
    state.work = JSON.parse(JSON.stringify(source));
    state.work.photos = state.work.photos || [];
    state.work.photos.forEach(function (p) { p.deleted = false; });

    el.gallerySelect.value = id;
    el.galleryName.value = state.work.name || '';
    el.galleryDesc.value = state.work.description || '';
    el.galleryFolder.textContent = 'images/' + state.work.id + '/';

    var first = state.work.photos[0] || {};
    el.defAuthor.value = first.author || '';
    el.defYear.value = first.year || '';
    el.defLocation.value = first.location || '';
    selectByValue(el.defLicense, first.license);

    el.bulkTitle.value = '';
    el.bulkStart.value = 1;
    el.orderSelect.value = '';
    el.log.hidden = true;
    el.log.textContent = '';
    el.progressWrap.hidden = true;

    renderPhotos();
  }

  function selectByValue(select, value) {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) { select.selectedIndex = i; return; }
    }
    select.selectedIndex = 0;
  }

  // ---------- Campos da galeria ----------

  el.galleryName.addEventListener('input', function () {
    state.work.name = el.galleryName.value;
    refreshChanges();
  });

  el.galleryDesc.addEventListener('input', function () {
    state.work.description = el.galleryDesc.value;
    refreshChanges();
  });

  // ---------- Créditos ----------

  el.btnApplyCredits.addEventListener('click', function () {
    var author = el.defAuthor.value.trim();
    if (!author && !confirm('Sem autor as fotos ficam sem crédito de direito autoral. Continuar?')) {
      el.defAuthor.focus();
      return;
    }

    state.work.photos.forEach(function (p) {
      p.author = author;
      p.year = el.defYear.value.trim();
      p.license = el.defLicense.value;
      p.location = el.defLocation.value.trim();
    });

    renderPhotos();
  });

  // ---------- Nome em lote ----------

  el.btnBulk.addEventListener('click', applyBulk);
  el.bulkTitle.addEventListener('input', updateBulkPreview);
  el.bulkStart.addEventListener('input', updateBulkPreview);

  el.bulkTitle.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); applyBulk(); }
  });

  el.renameFiles.addEventListener('change', refreshChanges);

  function bulkStartValue() {
    return Math.max(1, Math.min(9999, parseInt(el.bulkStart.value, 10) || 1));
  }

  function applyBulk() {
    var base = el.bulkTitle.value.trim();
    if (!base) { el.bulkTitle.focus(); return; }

    var alive = livePhotos();
    var start = bulkStartValue();
    var width = String(start + Math.max(0, alive.length - 1)).length;

    alive.forEach(function (p, i) {
      p.title = base + ' ' + GH.pad(start + i, width);
    });

    renderPhotos();
  }

  function updateBulkPreview() {
    var base = el.bulkTitle.value.trim();
    if (!base) {
      el.bulkPreview.textContent = 'Numera na ordem da lista abaixo.';
      return;
    }

    var start = bulkStartValue();
    var alive = livePhotos();
    var width = String(start + Math.max(0, alive.length - 1)).length;
    var names = [];
    for (var i = 0; i < Math.min(3, Math.max(alive.length, 3)); i++) {
      names.push(base + ' ' + GH.pad(start + i, width));
    }

    el.bulkPreview.textContent = 'Fica: ' + names.join(', ') +
      (alive.length > 3 ? '…' : '') +
      (el.renameFiles.checked ? ' · arquivos ' + GH.slugify(names[0]) + '.jpg…' : '');
  }

  function livePhotos() {
    return state.work.photos.filter(function (p) { return !p.deleted; });
  }

  // ---------- Ordenação ----------

  el.btnOrder.addEventListener('click', function () {
    var mode = el.orderSelect.value;
    if (!mode) return;

    if (mode === 'reverse') {
      state.work.photos.reverse();
    } else {
      state.work.photos.sort(function (a, b) {
        if (mode === 'name-asc') return natural(a.file, b.file);
        var da = a.taken || '', db = b.taken || '';
        if (da === db) return natural(a.file, b.file);
        if (!da) return 1;
        if (!db) return -1;
        return mode === 'date-desc' ? (da < db ? 1 : -1) : (da < db ? -1 : 1);
      });
    }

    renderPhotos();
  });

  function natural(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  function move(index, delta) {
    var to = index + delta;
    if (to < 0 || to >= state.work.photos.length) return;
    var moved = state.work.photos.splice(index, 1)[0];
    state.work.photos.splice(to, 0, moved);
    renderPhotos();
  }

  // ---------- Lista de fotos ----------

  var dragFrom = -1;

  function renderPhotos() {
    var photos = state.work.photos;
    el.photoList.innerHTML = '';

    var alive = livePhotos().length;
    var gone = photos.length - alive;
    el.photosPill.textContent = alive + ' foto(s)' + (gone ? ' · ' + gone + ' a apagar' : '');

    photos.forEach(function (photo, index) {
      var li = document.createElement('li');
      li.className = 'fileitem' + (photo.deleted ? ' fileitem--deleted' : '');
      li.draggable = true;

      li.addEventListener('dragstart', function () { dragFrom = index; li.classList.add('dragging'); });
      li.addEventListener('dragend', function () { li.classList.remove('dragging'); });
      li.addEventListener('dragover', function (e) { e.preventDefault(); });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        if (dragFrom < 0 || dragFrom === index) return;
        var moved = state.work.photos.splice(dragFrom, 1)[0];
        state.work.photos.splice(index, 0, moved);
        dragFrom = -1;
        renderPhotos();
      });

      var thumb = document.createElement('img');
      thumb.className = 'fileitem-thumb';
      thumb.src = '../' + (photo.thumb || photo.file);
      thumb.alt = '';
      thumb.loading = 'lazy';
      li.appendChild(thumb);

      var fields = document.createElement('div');
      fields.className = 'fileitem-fields';

      var title = document.createElement('input');
      title.type = 'text';
      title.className = 'input input--sm';
      title.value = photo.title || '';
      title.placeholder = 'Título da foto';
      title.setAttribute('aria-label', 'Título da foto');
      title.disabled = photo.deleted;
      title.addEventListener('input', function () {
        photo.title = title.value;
        refreshChanges();
      });
      fields.appendChild(title);

      var author = document.createElement('input');
      author.type = 'text';
      author.className = 'input input--sm';
      author.value = photo.author || '';
      author.placeholder = 'Autor';
      author.setAttribute('aria-label', 'Autor desta foto');
      author.disabled = photo.deleted;
      author.addEventListener('input', function () {
        photo.author = author.value;
        refreshChanges();
      });
      fields.appendChild(author);

      var meta = document.createElement('p');
      meta.className = 'fileitem-meta';
      meta.textContent = photo.file.split('/').pop() +
        (photo.taken ? ' · ' + photo.taken.replace('T', ' ').slice(0, 16) : '');
      fields.appendChild(meta);

      li.appendChild(fields);

      var tools = document.createElement('div');
      tools.className = 'fileitem-tools';

      var isCover = state.work.cover === photo.file;
      tools.appendChild(iconBtn(isCover ? '★' : '☆', 'Usar como miniatura da galeria',
        'fileitem-star' + (isCover ? ' fileitem-star--on' : ''), function () {
          state.work.cover = photo.file;
          renderPhotos();
        }, photo.deleted));

      tools.appendChild(iconBtn('↑', 'Mover para cima', 'fileitem-move', function () {
        move(index, -1);
      }));

      tools.appendChild(iconBtn('↓', 'Mover para baixo', 'fileitem-move', function () {
        move(index, 1);
      }));

      tools.appendChild(iconBtn(photo.deleted ? '↺' : '✕',
        photo.deleted ? 'Cancelar exclusão' : 'Apagar esta foto', 'fileitem-rm', function () {
          photo.deleted = !photo.deleted;
          if (photo.deleted && state.work.cover === photo.file) state.work.cover = '';
          renderPhotos();
        }));

      li.appendChild(tools);
      el.photoList.appendChild(li);
    });

    updateBulkPreview();
    refreshChanges();
  }

  function iconBtn(text, title, className, onClick, disabled) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- Renomeações ----------

  /* Lista de arquivos a mover, a partir do título de cada foto. */
  function computeRenames() {
    if (!el.renameFiles.checked) return [];

    var used = {};
    var renames = [];

    livePhotos().forEach(function (photo) {
      var dir = photo.file.slice(0, photo.file.lastIndexOf('/') + 1);
      var ext = GH.extOf(photo.file);
      var base = GH.slugify(photo.title) || GH.slugify(photo.file.split('/').pop()) || 'foto';

      var filename = base + '.' + ext;
      var n = 2;
      while (used[filename.toLowerCase()]) { filename = base + '-' + n + '.' + ext; n++; }
      used[filename.toLowerCase()] = true;

      var to = dir + filename;
      if (to !== photo.file) {
        renames.push({ photo: photo, from: photo.file, to: to, stem: filename.replace(/\.[^.]+$/, '') });
      }
    });

    return renames;
  }

  // ---------- Mudanças pendentes ----------

  function pendingChanges() {
    var out = [];
    var source = state.data.galleries.filter(function (g) { return g.id === state.work.id; })[0] || {};
    var before = source.photos || [];

    if ((source.name || '') !== (state.work.name || '')) out.push('Nome da galeria');
    if ((source.description || '') !== (state.work.description || '')) out.push('Descrição da galeria');
    if ((source.cover || '') !== (state.work.cover || '')) out.push('Miniatura da galeria');

    var deleted = state.work.photos.filter(function (p) { return p.deleted; }).length;
    if (deleted) out.push(deleted + ' foto(s) serão apagadas — arquivo e versões leves');

    var edited = 0;
    livePhotos().forEach(function (p) {
      var was = before.filter(function (b) { return b.file === p.file; })[0];
      if (!was) return;
      if ((was.title || '') !== (p.title || '') || (was.author || '') !== (p.author || '') ||
          (was.year || '') !== (p.year || '') || (was.license || '') !== (p.license || '') ||
          (was.location || '') !== (p.location || '')) edited++;
    });
    if (edited) out.push(edited + ' foto(s) com título ou créditos alterados');

    var orderBefore = before.map(function (p) { return p.file; }).join('|');
    var orderNow = livePhotos().map(function (p) { return p.file; }).join('|');
    if (deleted === 0 && orderBefore !== orderNow) out.push('Ordem das fotos');

    var renames = computeRenames();
    if (renames.length) out.push(renames.length + ' arquivo(s) renomeados');

    return out;
  }

  function isDirty() {
    return state.work && pendingChanges().length > 0;
  }

  function refreshChanges() {
    var changes = pendingChanges();
    el.changes.innerHTML = '';

    if (!changes.length) {
      var li = document.createElement('li');
      li.className = 'changes-empty';
      li.textContent = 'Nada alterado ainda.';
      el.changes.appendChild(li);
    } else {
      changes.forEach(function (text) {
        var li = document.createElement('li');
        li.textContent = text;
        el.changes.appendChild(li);
      });
    }

    el.btnSave.disabled = state.busy || !changes.length;
  }

  el.btnReset.addEventListener('click', function () {
    if (!isDirty() || confirm('Descartar todas as alterações desta galeria?')) {
      loadGallery(state.work.id);
    }
  });

  // ---------- Salvar ----------

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

  el.btnSave.addEventListener('click', save);

  function save() {
    var deleted = state.work.photos.filter(function (p) { return p.deleted; });

    if (deleted.length && !confirm('Apagar ' + deleted.length +
        ' foto(s)? Os arquivos saem do repositório e o download deixa de funcionar.')) {
      return;
    }

    state.busy = true;
    el.btnSave.disabled = true;
    el.log.textContent = '';
    progress(0, 4, 'Lendo os arquivos do repositório…');

    var entries = [];
    var renames = computeRenames();

    GH.loadTree().then(function (tree) {
      // 1. Renomeações: reaproveitam o blob que já está no repositório
      progress(1, 4, 'Preparando alterações…');

      renames.forEach(function (r) {
        moveFile(tree, entries, r.from, r.to);
        r.photo.file = r.to;

        if (r.photo.thumb) {
          var t = dirOf(r.photo.thumb) + r.stem + '.jpg';
          moveFile(tree, entries, r.photo.thumb, t);
          r.photo.thumb = t;
        }
        if (r.photo.view) {
          var v = dirOf(r.photo.view) + r.stem + '.jpg';
          moveFile(tree, entries, r.photo.view, v);
          r.photo.view = v;
        }

        if (state.work.cover === r.from) state.work.cover = r.to;
        log('→ ' + r.from.split('/').pop() + '  ⇒  ' + r.to.split('/').pop());
      });

      // 2. Exclusões
      deleted.forEach(function (p) {
        [p.file, p.thumb, p.view].forEach(function (path) {
          if (path && tree[path]) entries.push({ path: path, remove: true });
        });
        log('✕ ' + p.file);
      });

      // 3. Manifesto
      var gallery = JSON.parse(JSON.stringify(state.work));
      gallery.photos = gallery.photos.filter(function (p) { return !p.deleted; });
      gallery.photos.forEach(function (p) { delete p.deleted; });

      if (!gallery.cover || !gallery.photos.some(function (p) { return p.file === gallery.cover; })) {
        gallery.cover = gallery.photos.length ? gallery.photos[0].file : '';
      }

      state.data.galleries = state.data.galleries.map(function (g) {
        return g.id === gallery.id ? gallery : g;
      });

      progress(2, 4, 'Enviando o manifesto…');
      return GH.putBlob(JSON.stringify(state.data, null, 2) + '\n');
    }).then(function (sha) {
      entries.push({ path: 'galleries.json', sha: sha });

      progress(3, 4, 'Criando commit…');
      return GH.commit('Edita a galeria "' + state.work.name + '"', entries);
    }).then(function () {
      state.busy = false;
      loadGallery(state.work.id);          // recarrega a partir do manifesto já atualizado
      refreshGallerySelect();
      progress(4, 4, 'Pronto!');
      log('✓ Alterações publicadas. O site atualiza em cerca de 1 minuto.');
    }).catch(function (err) {
      console.error(err);
      log('✗ Erro: ' + err.message);
      progress(0, 1, 'Falhou — nada foi alterado no repositório.');
      state.busy = false;
      // Recarrega do GitHub para não continuar de um estado meio aplicado
      GH.loadManifest().then(function (data) {
        state.data = data;
        loadGallery(state.work.id);
        refreshGallerySelect();
      });
    });
  }

  function dirOf(path) {
    return path.slice(0, path.lastIndexOf('/') + 1);
  }

  function moveFile(tree, entries, from, to) {
    if (!tree[from] || from === to) return;
    entries.push({ path: to, sha: tree[from] });
    entries.push({ path: from, remove: true });
  }

  function refreshGallerySelect() {
    var current = el.gallerySelect.value;
    el.gallerySelect.innerHTML = '';
    state.data.galleries.forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.id;
      o.textContent = (g.name || g.id) + ' (' + ((g.photos || []).length) + ')';
      el.gallerySelect.appendChild(o);
    });
    el.gallerySelect.value = current;
  }

  // ---------- Início ----------

  if (GH.state.token) {
    el.tokenInput.value = GH.state.token;
    connect(GH.state.token, false);
  }
})();
