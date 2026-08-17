/* ---------------------------------------------------------
   Galeria — carrega photos.json, monta o grid e o lightbox
   --------------------------------------------------------- */
(function () {
  'use strict';

  var els = {
    gallery:   document.getElementById('gallery'),
    empty:     document.getElementById('emptyState'),
    title:     document.getElementById('siteTitle'),
    subtitle:  document.getElementById('siteSubtitle'),
    footer:    document.getElementById('footerCopy'),
    lightbox:  document.getElementById('lightbox'),
    lbImage:   document.getElementById('lbImage'),
    lbSpinner: document.getElementById('lbSpinner'),
    lbTitle:   document.getElementById('lbTitle'),
    lbCredit:  document.getElementById('lbCredit'),
    lbLicense: document.getElementById('lbLicense'),
    lbDl:      document.getElementById('lbDownload'),
    lbClose:   document.getElementById('lbClose'),
    lbPrev:    document.getElementById('lbPrev'),
    lbNext:    document.getElementById('lbNext')
  };

  var photos = [];
  var site = {};
  var current = -1;
  var lastFocus = null;

  // ---------- Carregamento ----------

  fetch('photos.json?v=' + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error('photos.json não encontrado');
      return r.json();
    })
    .then(function (data) {
      site = data.site || {};
      photos = (data.photos || []).filter(function (p) { return p && p.file; });
      applySite();
      render();
    })
    .catch(function (err) {
      console.error(err);
      els.empty.hidden = false;
    });

  function applySite() {
    if (site.title) {
      els.title.textContent = site.title;
      document.title = site.title;
    }
    if (site.subtitle) els.subtitle.textContent = site.subtitle;

    var year = new Date().getFullYear();
    els.footer.textContent = '© ' + year + ' ' +
      (site.copyrightHolder || site.title || 'Galeria') +
      '. Todos os direitos reservados.';
  }

  // ---------- Grid ----------

  function render() {
    if (!photos.length) {
      els.empty.hidden = false;
      return;
    }

    var frag = document.createDocumentFragment();

    photos.forEach(function (photo, i) {
      var tile = document.createElement('button');
      tile.className = 'tile';
      tile.type = 'button';
      tile.setAttribute('role', 'listitem');
      tile.setAttribute('aria-label', 'Abrir ' + titleOf(photo, i));
      tile.addEventListener('click', function () { open(i); });

      var img = document.createElement('img');
      img.src = photo.thumb || photo.file;
      img.alt = photo.alt || titleOf(photo, i);
      img.loading = i < 8 ? 'eager' : 'lazy';
      img.decoding = 'async';
      tile.appendChild(img);

      var overlay = document.createElement('div');
      overlay.className = 'tile-overlay';

      var cap = document.createElement('span');
      cap.className = 'tile-caption';
      cap.textContent = titleOf(photo, i);

      var author = authorOf(photo);
      if (author) {
        var by = document.createElement('span');
        by.className = 'tile-author';
        by.textContent = '© ' + author;
        cap.appendChild(by);
      }

      overlay.appendChild(cap);
      tile.appendChild(overlay);

      // Download direto, sem abrir o lightbox
      var dl = document.createElement('a');
      dl.className = 'tile-dl';
      dl.href = photo.file;
      dl.setAttribute('download', fileName(photo));
      dl.setAttribute('aria-label', 'Baixar ' + titleOf(photo, i));
      dl.title = 'Baixar';
      dl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 19h16"/></svg>';
      dl.addEventListener('click', function (e) { e.stopPropagation(); });
      tile.appendChild(dl);

      frag.appendChild(tile);
    });

    els.gallery.appendChild(frag);
  }

  // ---------- Helpers de metadados ----------

  function titleOf(photo, i) {
    return photo.title || ('Foto ' + (i + 1));
  }

  function authorOf(photo) {
    return photo.author || site.defaultAuthor || '';
  }

  function licenseOf(photo) {
    return photo.license || site.defaultLicense || 'Todos os direitos reservados';
  }

  function yearOf(photo) {
    return photo.year || site.defaultYear || '';
  }

  function fileName(photo) {
    return photo.file.split('/').pop();
  }

  function creditLine(photo) {
    var author = authorOf(photo);
    var year = yearOf(photo);
    if (!author) return '';
    return '© ' + (year ? year + ' ' : '') + author;
  }

  // ---------- Lightbox ----------

  function open(index) {
    current = index;
    lastFocus = document.activeElement;
    els.lightbox.hidden = false;
    document.body.classList.add('no-scroll');
    show(index);
    els.lbClose.focus();
  }

  function show(index) {
    var photo = photos[index];
    if (!photo) return;
    current = index;

    els.lbImage.classList.remove('loaded');
    els.lbSpinner.hidden = false;
    els.lbImage.alt = photo.alt || titleOf(photo, index);
    els.lbImage.src = photo.file;

    els.lbTitle.textContent = titleOf(photo, index);

    var credit = creditLine(photo);
    els.lbCredit.textContent = credit;
    els.lbCredit.hidden = !credit;

    var lic = licenseOf(photo);
    var extra = [];
    if (photo.location) extra.push(photo.location);
    extra.push(lic);
    els.lbLicense.textContent = extra.join(' · ');

    els.lbDl.href = photo.file;
    els.lbDl.setAttribute('download', fileName(photo));

    var many = photos.length > 1;
    els.lbPrev.hidden = !many;
    els.lbNext.hidden = !many;

    preload(index + 1);
    preload(index - 1);
  }

  function preload(i) {
    var photo = photos[(i + photos.length) % photos.length];
    if (photo) { var im = new Image(); im.src = photo.file; }
  }

  els.lbImage.addEventListener('load', function () {
    els.lbImage.classList.add('loaded');
    els.lbSpinner.hidden = true;
  });

  els.lbImage.addEventListener('error', function () {
    els.lbSpinner.hidden = true;
  });

  function close() {
    els.lightbox.hidden = true;
    els.lbImage.src = '';
    document.body.classList.remove('no-scroll');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function step(delta) {
    if (!photos.length) return;
    show((current + delta + photos.length) % photos.length);
  }

  els.lbClose.addEventListener('click', close);
  els.lbPrev.addEventListener('click', function () { step(-1); });
  els.lbNext.addEventListener('click', function () { step(1); });

  // Clicar no fundo fecha
  els.lightbox.addEventListener('click', function (e) {
    if (e.target === els.lightbox || e.target.classList.contains('lb-stage')) close();
  });

  // Teclado
  document.addEventListener('keydown', function (e) {
    if (els.lightbox.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // Swipe no celular
  var touchX = 0, touchY = 0;
  els.lightbox.addEventListener('touchstart', function (e) {
    touchX = e.changedTouches[0].clientX;
    touchY = e.changedTouches[0].clientY;
  }, { passive: true });

  els.lightbox.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
  }, { passive: true });
})();
