/* ---------------------------------------------------------
   Galeria — carrega uma galeria de galleries.json (?g=<id>),
   monta o grid e o lightbox
   --------------------------------------------------------- */
(function () {
  'use strict';

  var els = {
    gallery:   document.getElementById('gallery'),
    empty:     document.getElementById('emptyState'),
    name:      document.getElementById('galleryName'),
    date:      document.getElementById('galleryDate'),
    desc:      document.getElementById('galleryDesc'),
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

  var wantedId = new URLSearchParams(location.search).get('g');

  fetch('galleries.json?v=' + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error('galleries.json not found');
      return r.json();
    })
    .then(function (data) {
      site = data.site || {};
      var galleries = (data.galleries || []).filter(function (g) { return g && g.id; });

      var gallery = wantedId
        ? galleries.filter(function (g) { return g.id === wantedId; })[0]
        : galleries[0];

      els.footer.textContent = '© ' + new Date().getFullYear() + ' ' +
        (site.copyrightHolder || site.title || 'Gallery') + '. All rights reserved.';

      if (!gallery) {
        els.empty.hidden = false;
        return;
      }

      var name = gallery.name || gallery.id;
      els.name.textContent = name;
      document.title = name + ' — ' + (site.title || 'Gallery');
      if (gallery.date) els.date.textContent = formatDate(gallery.date);
      if (gallery.description) els.desc.textContent = gallery.description;

      photos = (gallery.photos || []).filter(function (p) { return p && p.file; });
      render();
    })
    .catch(function (err) {
      console.error(err);
      els.empty.hidden = false;
    });

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
      tile.setAttribute('aria-label', 'Open ' + titleOf(photo, i));
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
      dl.setAttribute('aria-label', 'Download ' + titleOf(photo, i));
      dl.title = 'Download';
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
    return photo.title || ('Photo ' + (i + 1));
  }

  function authorOf(photo) {
    return photo.author || site.defaultAuthor || '';
  }

  function licenseOf(photo) {
    return photo.license || site.defaultLicense || 'All rights reserved';
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

  /* @usuario -> link para o perfil no Instagram */
  function instagramOf(photo) {
    var handle = (photo.instagram || site.defaultInstagram || '').trim().replace(/^@+/, '');
    return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : '';
  }

  /* "2026-08-17" -> "17 August 2026" */
  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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
    els.lbImage.src = photo.view || photo.file;   // versão leve para ver; o download é o original

    els.lbTitle.textContent = titleOf(photo, index);

    var credit = creditLine(photo);
    els.lbCredit.textContent = credit;

    var handle = instagramOf(photo);
    if (handle) {
      var link = document.createElement('a');
      link.className = 'lb-instagram';
      link.href = 'https://www.instagram.com/' + handle + '/';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '@' + handle;
      if (credit) els.lbCredit.appendChild(document.createTextNode(' · '));
      els.lbCredit.appendChild(link);
    }

    els.lbCredit.hidden = !credit && !handle;

    var extra = [];
    if (photo.location) extra.push(photo.location);
    extra.push(licenseOf(photo));
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
    if (photo) { var im = new Image(); im.src = photo.view || photo.file; }
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
