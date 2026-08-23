/* ---------------------------------------------------------
   Upload — envia fotos para o repositório via API do GitHub
   e atualiza galleries.json em um único commit.
   O token fica só no localStorage deste navegador.
   --------------------------------------------------------- */
(function () {
  'use strict';

  var state = {
    repo: GH.state.repo,
    data: null,
    items: [],
    bulk: null,      // {base, start} — nome em lote com numeração
    cover: null,     // {kind:'existing', file} | {kind:'new', itemId}
    busy: false
  };

  // Atalhos para os utilitários compartilhados (assets/js/gh.js)
  var slugify = GH.slugify;
  var prettyTitle = GH.prettyTitle;
  var pad = GH.pad;
  var humanSize = GH.humanSize;
  var extOf = GH.extOf;
  var putBlob = GH.putBlob;

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
    defInstagram: $('defInstagram'), galleryDate: $('galleryDate'), galleryDateHint: $('galleryDateHint'),
    coverPicker: $('coverPicker'), coverStrip: $('coverStrip'),
    downloadAll: $('downloadAllToggle'),
    visibility: $('visibilitySelect'), privateFields: $('privateFields'),
    galleryPassword: $('galleryPassword'), passwordHint: $('passwordHint'),
    dropzone: $('dropzone'), fileInput: $('fileInput'), fileList: $('fileList'), filesPill: $('filesPill'),
    bulkTitle: $('bulkTitle'), bulkStart: $('bulkStart'), btnBulk: $('btnBulk'),
    bulkPreview: $('bulkPreview'), starHint: $('starHint'),
    orderSelect: $('orderSelect'), orderHint: $('orderHint'),
    resizeToggle: $('resizeToggle'), maxSize: $('maxSize'),
    btnPublish: $('btnPublish'), progressWrap: $('progressWrap'), progressBar: $('progressBar'),
    progressText: $('progressText'), log: $('log'),
    doneBox: $('doneBox'), doneText: $('doneText'), doneLink: $('doneLink'), btnAnother: $('btnAnother')
  };

  // ---------- Conexão ----------

  el.repoName.textContent = state.repo;

  el.btnConnect.addEventListener('click', function () {
    var token = el.tokenInput.value.trim();
    if (!token) { alertMsg('Paste the token first.'); return; }
    connect(token, true);
  });

  el.tokenInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') el.btnConnect.click();
  });

  el.btnForget.addEventListener('click', function () {
    GH.forgetToken();
    location.reload();
  });

  function alertMsg(msg) {
    el.authPill.textContent = msg;
    el.authPill.className = 'pill pill--error';
  }

  function connect(token, remember) {
    el.btnConnect.disabled = true;
    el.authPill.textContent = 'Connecting\u2026';
    el.authPill.className = 'pill';

    GH.connect(token, remember)
      .then(function () { return loadManifest(); })
      .then(function () {
        el.authPill.textContent = 'Connected';
        el.authPill.className = 'pill pill--ok';
        el.authForm.hidden = true;
        el.authDone.hidden = false;
        el.authWho.textContent = 'Writing to ' + state.repo + ' (branch ' + GH.state.branch + ').';
        showForm();
      })
      .catch(function (err) {
        el.btnConnect.disabled = false;
        alertMsg(err.message);
      });
  }

  function loadManifest() {
    return GH.loadManifest().then(function (data) { state.data = data; });
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

  /* Data em que a foto foi tirada, guardada no manifesto para o /edit reordenar. */
  function isoLocal(ts) {
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function shortDate(ts) {
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
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
    renderCoverStrip();
    updateBulkPreview();
    refreshPublishState();
  }

  function fillGallerySelect() {
    var sel = el.gallerySelect;
    var prev = sel.value;
    sel.innerHTML = '';

    var optNew = document.createElement('option');
    optNew.value = '__new__';
    optNew.textContent = '➕ New gallery';
    sel.appendChild(optNew);

    (state.data.galleries || []).forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.id;
      o.textContent = (g.name || g.id) + ' (' + ((g.photos || []).length) + ')';
      sel.appendChild(o);
    });

    sel.value = prev;
    if (!sel.value) sel.value = '__new__';
    el.newFields.hidden = sel.value !== '__new__';

    var g = selectedGallery();
    el.downloadAll.checked = g ? !!g.downloadAll : false;
    showVisibility(g);
  }

  /* Mostra público/privado e conta se a galeria já tem senha guardada */
  function showVisibility(gallery) {
    el.visibility.value = (gallery && gallery.visibility === 'private') ? 'private' : 'public';
    el.privateFields.hidden = el.visibility.value !== 'private';
    el.galleryPassword.value = '';

    var hasLock = !!(gallery && gallery.lock && gallery.lock.hash);
    el.galleryPassword.placeholder = hasLock
      ? 'Leave empty to keep the current password'
      : 'Leave empty for no password';
    el.passwordHint.textContent = hasLock
      ? 'This gallery already has a password. Type a new one to replace it, or leave it empty to keep it.'
      : 'Whoever opens the link has to type it. Only the encrypted form goes to the repository — ' +
        'the password itself is never stored, so there is no way to recover it, only replace it.';
  }

  el.visibility.addEventListener('change', function () {
    el.privateFields.hidden = el.visibility.value !== 'private';
    refreshPublishState();
  });

  el.galleryPassword.addEventListener('input', refreshPublishState);

  // ---------- Galeria ----------

  el.gallerySelect.addEventListener('change', function () {
    var isNew = el.gallerySelect.value === '__new__';
    el.newFields.hidden = !isNew;
    state.cover = null;

    // Numeração em lote continua de onde a galeria parou
    var g = selectedGallery();
    el.bulkStart.value = g ? ((g.photos || []).length + 1) : 1;
    el.downloadAll.checked = g ? !!g.downloadAll : false;
    showVisibility(g);

    renderCoverStrip();
    updateBulkPreview();
    refreshPublishState();
  });

  /* Ligar/desligar o botão de baixar tudo já é uma mudança publicável,
     mesmo sem foto nova na fila */
  el.downloadAll.addEventListener('change', refreshPublishState);

  function downloadAllChanged() {
    var g = selectedGallery();
    return !!g && !!g.downloadAll !== el.downloadAll.checked;
  }

  function visibilityChanged() {
    var g = selectedGallery();
    if (!g) return false;
    var now = g.visibility === 'private' ? 'private' : 'public';
    if (now !== el.visibility.value) return true;
    return el.visibility.value === 'private' && el.galleryPassword.value.length > 0;
  }

  function selectedGallery() {
    if (el.gallerySelect.value === '__new__') return null;
    return (state.data.galleries || []).filter(function (g) {
      return g.id === el.gallerySelect.value;
    })[0] || null;
  }

  // ---------- Miniatura (capa) da galeria ----------

  function renderCoverStrip() {
    var gallery = selectedGallery();
    var photos = gallery ? (gallery.photos || []) : [];

    el.coverPicker.hidden = photos.length === 0;
    el.coverStrip.innerHTML = '';
    if (!photos.length) return;

    photos.forEach(function (p) {
      var chosen = state.cover
        ? (state.cover.kind === 'existing' && state.cover.file === p.file)
        : (gallery.cover === p.file);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'coverthumb' + (chosen ? ' coverthumb--on' : '');
      btn.title = p.title || '';
      btn.setAttribute('aria-pressed', chosen ? 'true' : 'false');
      btn.setAttribute('aria-label', 'Use "' + (p.title || p.file) + '" as the cover');

      var img = document.createElement('img');
      img.src = '../' + p.file;
      img.alt = '';
      img.loading = 'lazy';
      btn.appendChild(img);

      btn.addEventListener('click', function () {
        state.cover = { kind: 'existing', file: p.file };
        renderCoverStrip();
        renderFiles();
        refreshPublishState();
      });

      el.coverStrip.appendChild(btn);
    });
  }

  function coverChanged() {
    if (!state.cover) return false;
    if (state.cover.kind === 'new') return true;
    var gallery = selectedGallery();
    return !!gallery && gallery.cover !== state.cover.file;
  }

  // ---------- Nome em lote ----------

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  el.btnBulk.addEventListener('click', applyBulk);

  el.bulkTitle.addEventListener('input', updateBulkPreview);
  el.bulkStart.addEventListener('input', updateBulkPreview);

  el.bulkTitle.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); applyBulk(); }
  });

  function bulkStartValue() {
    return Math.max(1, Math.min(9999, parseInt(el.bulkStart.value, 10) || 1));
  }

  function applyBulk() {
    var base = el.bulkTitle.value.trim();

    if (!base) {
      state.bulk = null;
      state.items.forEach(function (it) { it.title = prettyTitle(it.file.name); });
    } else {
      state.bulk = { base: base, start: bulkStartValue() };
      applyNumbering();
    }

    renderFiles();
    updateBulkPreview();
  }

  /* Numera as fotos na ordem atual da lista — chamado ao aplicar o nome
     e sempre que a lista muda (novas fotos, remoção, reordenação). */
  function applyNumbering() {
    if (!state.bulk) return;
    var start = state.bulk.start;
    var width = String(start + Math.max(0, state.items.length - 1)).length;
    state.items.forEach(function (it, i) {
      it.title = state.bulk.base + ' ' + pad(start + i, width);
    });
  }

  function updateBulkPreview() {
    var base = el.bulkTitle.value.trim();

    if (!base) {
      el.bulkPreview.textContent = 'Leave empty to keep each file name.';
      return;
    }

    var start = bulkStartValue();
    var count = Math.max(state.items.length, 3);
    var width = String(start + Math.max(0, state.items.length - 1)).length;

    var names = [];
    for (var i = 0; i < Math.min(3, count); i++) names.push(base + ' ' + pad(start + i, width));

    el.bulkPreview.textContent = 'Result: ' + names.join(', ') +
      (count > 3 ? '…' : '') + ' · files ' + slugify(names[0]) + '.jpg, ' +
      slugify(names[1]) + '.jpg…';
  }

  el.galleryName.addEventListener('input', function () {
    updateSlugPreview();
    refreshPublishState();
  });

  var galleryDateTouched = false;
  el.galleryDate.addEventListener('input', function () { galleryDateTouched = true; });

  /* Sugere a data da galeria a partir da foto mais antiga do envio. */
  function suggestGalleryDate() {
    if (galleryDateTouched || el.gallerySelect.value !== '__new__') return;

    var oldest = state.items.reduce(function (min, it) {
      return (it.date && (!min || it.date < min)) ? it.date : min;
    }, 0);
    if (!oldest) return;

    el.galleryDate.value = isoLocal(oldest).slice(0, 10);
    el.galleryDateHint.textContent = 'Taken from the oldest photo — change it if you like.';
  }

  function updateSlugPreview() {
    var s = slugify(el.galleryName.value);
    el.slugPreview.textContent = 'images/' + (s || '…') + '/';
  }

  // ---------- Data da foto (EXIF) e ordenação ----------

  function readChunk(file, bytes) {
    var blob = file.slice(0, bytes);
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('leitura falhou')); };
      fr.readAsArrayBuffer(blob);
    });
  }

  /* Lê DateTimeOriginal do EXIF. Retorna timestamp ou 0 se não achar. */
  function readExifDate(file) {
    return readChunk(file, 131072).then(function (buf) {
      var view = new DataView(buf);
      if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return 0; // não é JPEG

      var offset = 2;
      while (offset + 4 <= view.byteLength) {
        var marker = view.getUint16(offset);
        if ((marker & 0xFF00) !== 0xFF00) break;
        var size = view.getUint16(offset + 2);
        if (marker === 0xFFE1) return parseApp1(view, offset + 4);
        if (marker === 0xFFDA) break; // começaram os dados da imagem
        offset += 2 + size;
      }
      return 0;
    }).catch(function () { return 0; });
  }

  function parseApp1(view, start) {
    if (start + 14 > view.byteLength) return 0;
    for (var i = 0; i < 4; i++) {
      if (view.getUint8(start + i) !== 'Exif'.charCodeAt(i)) return 0;
    }

    var tiff = start + 6;
    var order = view.getUint16(tiff);
    if (order !== 0x4949 && order !== 0x4D4D) return 0;
    var le = order === 0x4949;

    var ifd0 = tiff + view.getUint32(tiff + 4, le);
    var exifPtr = findTag(view, tiff, ifd0, le, 0x8769, true);
    if (!exifPtr) return 0;

    var str = findTag(view, tiff, tiff + exifPtr, le, 0x9003, false) ||
              findTag(view, tiff, tiff + exifPtr, le, 0x9004, false);
    return parseExifDate(str);
  }

  function findTag(view, tiff, ifd, le, wanted, asNumber) {
    if (ifd + 2 > view.byteLength) return asNumber ? 0 : '';
    var count = view.getUint16(ifd, le);

    for (var i = 0; i < count; i++) {
      var entry = ifd + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      if (view.getUint16(entry, le) !== wanted) continue;

      var num = view.getUint32(entry + 4, le);
      if (asNumber) return view.getUint32(entry + 8, le);

      var at = num > 4 ? tiff + view.getUint32(entry + 8, le) : entry + 8;
      var out = '';
      for (var k = 0; k < num - 1 && at + k < view.byteLength; k++) {
        out += String.fromCharCode(view.getUint8(at + k));
      }
      return out;
    }
    return asNumber ? 0 : '';
  }

  /* "2026:08:17 21:33:04" -> timestamp */
  function parseExifDate(s) {
    var m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || '');
    if (!m) return 0;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  }

  function naturalCompare(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  function sortItems() {
    var mode = el.orderSelect.value;

    state.items.sort(function (a, b) {
      if (mode === 'picked') return a.seq - b.seq;
      if (mode === 'name-asc') return naturalCompare(a.file.name, b.file.name) || (a.seq - b.seq);

      var da = a.date || 0, db = b.date || 0;
      if (da === db) return naturalCompare(a.file.name, b.file.name) || (a.seq - b.seq);
      return mode === 'date-desc' ? db - da : da - db;
    });
  }

  el.orderSelect.addEventListener('change', function () {
    sortItems();
    applyNumbering();
    renderFiles();
    updateBulkPreview();
  });

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
  var nextSeq = 1;

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) {
      return /^image\//.test(f.type);
    });
    if (!files.length) return;

    var added = files.map(function (file) {
      var item = {
        id: nextId++,
        seq: nextSeq++,
        file: file,
        title: prettyTitle(file.name),
        author: '',
        date: file.lastModified || 0
      };
      state.items.push(item);
      return item;
    });

    // Mostra a lista na hora; a data do EXIF chega logo depois e reordena
    renderFiles();
    refreshPublishState();
    el.orderHint.textContent = 'Reading photo dates…';

    Promise.all(added.map(function (item) {
      return readExifDate(item.file).then(function (ts) {
        if (ts) { item.date = ts; item.hasExif = true; }
      });
    })).then(function () {
      sortItems();
      applyNumbering();
      suggestGalleryDate();
      renderFiles();
      updateBulkPreview();
      refreshPublishState();

      var noExif = state.items.filter(function (it) { return !it.hasExif; }).length;
      el.orderHint.textContent = noExif
        ? noExif + ' photo(s) with no EXIF date — the file date was used for those.'
        : 'Sorted by the date the photos were taken (EXIF).';
    });
  }

  function renderFiles() {
    el.fileList.innerHTML = '';
    el.filesPill.hidden = state.items.length === 0;
    el.filesPill.textContent = state.items.length + (state.items.length === 1 ? ' photo' : ' photos');
    el.starHint.hidden = state.items.length === 0;

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
      title.placeholder = 'Photo title';
      title.setAttribute('aria-label', 'Photo title');
      title.addEventListener('input', function () { item.title = title.value; });
      fields.appendChild(title);

      var author = document.createElement('input');
      author.type = 'text';
      author.className = 'input input--sm';
      author.value = item.author;
      author.placeholder = 'Photographer (leave empty to use the default)';
      author.setAttribute('aria-label', 'Photographer for this photo');
      author.addEventListener('input', function () { item.author = author.value; });
      fields.appendChild(author);

      var meta = document.createElement('p');
      meta.className = 'fileitem-meta';
      meta.textContent = item.file.name + ' · ' + humanSize(item.file.size) +
        (item.date ? ' · ' + shortDate(item.date) : '');
      fields.appendChild(meta);

      li.appendChild(fields);

      // Estrela: escolhe esta foto como miniatura da galeria
      var chosen = !!state.cover && state.cover.kind === 'new' && state.cover.itemId === item.id;
      var star = document.createElement('button');
      star.type = 'button';
      star.className = 'fileitem-star' + (chosen ? ' fileitem-star--on' : '');
      star.textContent = chosen ? '★' : '☆';
      star.title = 'Use as the gallery thumbnail';
      star.setAttribute('aria-pressed', chosen ? 'true' : 'false');
      star.setAttribute('aria-label', 'Use ' + item.file.name + ' as the gallery thumbnail');
      star.addEventListener('click', function () {
        state.cover = chosen ? null : { kind: 'new', itemId: item.id };
        renderFiles();
        renderCoverStrip();
        refreshPublishState();
      });
      li.appendChild(star);

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'fileitem-rm';
      rm.innerHTML = '&times;';
      rm.title = 'Remove';
      rm.setAttribute('aria-label', 'Remove ' + item.file.name);
      rm.addEventListener('click', function () {
        state.items = state.items.filter(function (x) { return x.id !== item.id; });
        if (state.cover && state.cover.kind === 'new' && state.cover.itemId === item.id) {
          state.cover = null;
        }
        applyNumbering();
        renderFiles();
        renderCoverStrip();
        updateBulkPreview();
        refreshPublishState();
      });
      li.appendChild(rm);

      el.fileList.appendChild(li);
    });
  }

  function refreshPublishState() {
    var isNew = el.gallerySelect.value === '__new__';
    var hasGallery = !isNew || slugify(el.galleryName.value).length > 0;
    // Sem fotos novas ainda dá para publicar, se a mudança for só a capa
    // ou o botão de baixar tudo
    var hasWork = state.items.length > 0 ||
      (!isNew && (coverChanged() || downloadAllChanged() || visibilityChanged()));

    el.btnPublish.disabled = state.busy || !hasGallery || !hasWork;
    el.btnPublish.textContent = (state.items.length === 0 && hasWork)
      ? 'Save gallery settings'
      : 'Publish photos';
  }

  // ---------- Redimensionamento ----------

  function loadBitmap(file) {
    if (!window.createImageBitmap) return Promise.reject(new Error('sem createImageBitmap'));
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(function () { return createImageBitmap(file); });
  }

  var THUMB_MAX = 700;   // grid e capa
  var VIEW_MAX = 1800;   // lightbox

  function scaleTo(bmp, max, quality) {
    var s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    var w = Math.max(1, Math.round(bmp.width * s));
    var h = Math.max(1, Math.round(bmp.height * s));

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);

    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', quality);
    });
  }

  /* Gera as três versões de uma foto:
     main  — o que o botão "Baixar" entrega (original, ou reduzido se a opção estiver marcada)
     view  — 1800 px, o que aparece em tela cheia
     thumb — 700 px, o que aparece no grid */
  function processImage(file) {
    var reduce = el.resizeToggle.checked;
    var max = Math.max(600, Math.min(6000, parseInt(el.maxSize.value, 10) || 2000));
    var out = { main: { blob: file, ext: extOf(file.name) }, thumb: null, view: null };

    return loadBitmap(file).then(function (bmp) {
      return scaleTo(bmp, THUMB_MAX, 0.8).then(function (b) {
        out.thumb = b;
        return scaleTo(bmp, VIEW_MAX, 0.85);
      }).then(function (b) {
        out.view = b;
        return reduce ? scaleTo(bmp, max, 0.85) : null;
      }).then(function (b) {
        if (b) out.main = { blob: b, ext: 'jpg' };
        if (bmp.close) bmp.close();
        return out;
      });
    }).catch(function () {
      return out;   // navegador não conseguiu processar: sobe o arquivo como veio
    });
  }

  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name);
    return m ? m[1].toLowerCase() : 'jpg';
  }

  /* Página própria da galeria, com as tags de preview (WhatsApp e afins). */
  function galleryPageEntry(gallery, blobs) {
    return fetch('../gallery.html?v=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('gallery.html');
        return r.text();
      })
      .then(function (template) {
        return GH.putBlob(PageGen.build(template, state.data.site || {}, gallery));
      })
      .then(function (sha) {
        blobs.push({ path: PageGen.path(gallery), sha: sha });
      })
      .catch(function (err) {
        // O preview é um extra: não vale derrubar a publicação das fotos
        log('⚠ Link preview page not generated: ' + err.message);
      });
  }

  // ---------- Publicação ----------

  el.btnPublish.addEventListener('click', publish);

  el.btnAnother.addEventListener('click', function () {
    state.items = [];
    state.cover = null;
    renderFiles();
    el.doneBox.hidden = true;
    el.log.hidden = true;
    el.log.textContent = '';
    el.progressWrap.hidden = true;
    fillGallerySelect();
    renderCoverStrip();
    refreshPublishState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function publish() {
    var isNew = el.gallerySelect.value === '__new__';
    var defAuthor = el.defAuthor.value.trim();

    var missingAuthor = state.items.some(function (it) { return !it.author.trim() && !defAuthor; });
    if (missingAuthor) {
      alert('Fill in the default photographer (step 3) or the photographer for each photo — the copyright credit is required.');
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
        date: el.galleryDate.value || '',
        description: el.galleryDesc.value.trim(),
        createdAt: GH.today(),
        cover: '',
        photos: []
      };
      if (el.visibility.value === 'private') gallery.visibility = 'private';
    } else {
      gallery = state.data.galleries.filter(function (g) { return g.id === el.gallerySelect.value; })[0];
      if (!gallery) { alert('Gallery not found. Reload the page.'); return; }
      if (!gallery.photos) gallery.photos = [];
    }

    // Só grava a chave quando ligada, para o manifesto não encher de "false"
    if (el.downloadAll.checked) gallery.downloadAll = true;
    else delete gallery.downloadAll;

    /* Público não tem senha: virar público apaga a que existia.
       A senha em si nunca vai para o manifesto — só o PBKDF2 dela. */
    var typed = el.galleryPassword.value;
    var lockWork = Promise.resolve();

    if (el.visibility.value === 'private') {
      gallery.visibility = 'private';
      if (typed) lockWork = Lock.make(typed).then(function (lock) { gallery.lock = lock; });
    } else {
      delete gallery.visibility;
      delete gallery.lock;
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

    var chain = lockWork;

    state.items.forEach(function (item, i) {
      chain = chain.then(function () {
        progress(step, total, 'Preparing ' + (i + 1) + '/' + state.items.length + ': ' + item.file.name);
        return processImage(item.file);
      }).then(function (out) {
        var base = slugify(item.title) || slugify(item.file.name.replace(/\.[^.]+$/, '')) || 'photo';
        var filename = base + '.' + out.main.ext;
        var n = 2;
        while (used[filename.toLowerCase()]) { filename = base + '-' + n + '.' + out.main.ext; n++; }
        used[filename.toLowerCase()] = true;

        var dir = 'images/' + gallery.id + '/';
        var stem = filename.replace(/\.[^.]+$/, '');
        var path = dir + filename;
        item.publishedPath = path;

        var photo = {
          file: path,
          title: item.title.trim() || prettyTitle(item.file.name),
          author: item.author.trim() || defAuthor,
          year: el.defYear.value.trim(),
          license: el.defLicense.value,
          location: el.defLocation.value.trim(),
          instagram: GH.instagramHandle(el.defInstagram.value),
          alt: '',
          taken: item.date ? isoLocal(item.date) : ''
        };

        log('↑ ' + path + ' (' + humanSize(out.main.blob.size) + ')');

        return putBlob(out.main.blob).then(function (sha) {
          blobs.push({ path: path, sha: sha });
          if (!out.thumb) return null;
          return putBlob(out.thumb).then(function (s) {
            photo.thumb = dir + 'thumbs/' + stem + '.jpg';
            blobs.push({ path: photo.thumb, sha: s });
          });
        }).then(function () {
          if (!out.view) return null;
          return putBlob(out.view).then(function (s) {
            photo.view = dir + 'view/' + stem + '.jpg';
            blobs.push({ path: photo.view, sha: s });
          });
        }).then(function () {
          newPhotos.push(photo);
          step++;
          progress(step, total, 'Uploaded ' + step + '/' + state.items.length);
        });
      });
    });

    chain.then(function () {
      // Atualiza o manifesto
      var chosenCover = '';
      if (state.cover && state.cover.kind === 'existing') {
        chosenCover = state.cover.file;
      } else if (state.cover && state.cover.kind === 'new') {
        var picked = state.items.filter(function (it) { return it.id === state.cover.itemId; })[0];
        chosenCover = picked ? picked.publishedPath : '';
      }

      gallery.photos = (gallery.photos || []).concat(newPhotos);
      if (chosenCover) gallery.cover = chosenCover;
      if (!gallery.cover && gallery.photos.length) gallery.cover = gallery.photos[0].file;
      if (isNew) state.data.galleries.push(gallery);

      var manifest = JSON.stringify(state.data, null, 2) + '\n';

      progress(++step, total, 'Updating galleries.json\u2026');
      return GH.putBlob(manifest);
    }).then(function (manifestSha) {
      blobs.push({ path: 'galleries.json', sha: manifestSha });
      return galleryPageEntry(gallery, blobs);
    }).then(function () {
      progress(++step, total, 'Creating commit\u2026');
      return GH.commit(newPhotos.length
        ? 'Add ' + newPhotos.length + ' photo(s) to "' + gallery.name + '"'
        : 'Update the thumbnail of "' + gallery.name + '"', blobs);
    }).then(function () {
      progress(total, total, 'Done!');
      log('✓ Commit published.');
      state.busy = false;
      state.items = [];
      state.cover = null;
      renderFiles();
      el.doneBox.hidden = false;
      el.doneText.textContent = (newPhotos.length
        ? newPhotos.length + ' photo(s) uploaded to "' + gallery.name + '"'
        : 'Thumbnail of "' + gallery.name + '" updated') +
        '. The site updates in about a minute.';
      el.doneLink.href = '../g/' + gallery.id + '/';
      fillGallerySelect();
      el.gallerySelect.value = gallery.id;
      el.newFields.hidden = true;
      el.bulkStart.value = (gallery.photos || []).length + 1;
      renderCoverStrip();
      updateBulkPreview();
      refreshPublishState();
    }).catch(function (err) {
      console.error(err);
      log('✗ Error: ' + err.message);
      progress(0, 1, 'Failed — nothing was published.');
      // Desfaz as alterações locais no manifesto para não duplicar numa nova tentativa
      state.busy = false;
      loadManifest().then(function () {
        fillGallerySelect();
        renderCoverStrip();
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

  if (GH.state.token) {
    el.tokenInput.value = GH.state.token;
    connect(GH.state.token, false);
  }
})();
