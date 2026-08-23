/* ---------------------------------------------------------
   Home — lista as galerias de galleries.json
   (textos da interface em inglês)
   --------------------------------------------------------- */
(function () {
  'use strict';

  var els = {
    albums:   document.getElementById('albums'),
    empty:    document.getElementById('emptyState'),
    title:    document.getElementById('siteTitle'),
    subtitle: document.getElementById('siteSubtitle'),
    footer:   document.getElementById('footerCopy')
  };

  fetch('galleries.json?v=' + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error('galleries.json not found');
      return r.json();
    })
    .then(function (data) {
      var site = data.site || {};
      // Galeria privada só existe para quem tem o link: não entra na capa
      var galleries = (data.galleries || []).filter(function (g) {
        return g && g.id && g.visibility !== 'private';
      });

      if (site.title) {
        els.title.textContent = site.title;
        document.title = site.title;
      }
      if (site.subtitle) els.subtitle.textContent = site.subtitle;

      els.footer.textContent = '© ' + new Date().getFullYear() + ' ' +
        (site.copyrightHolder || site.title || 'Gallery') + '. All rights reserved.';

      Track.configure(site);
      Track.page();

      render(galleries);
    })
    .catch(function (err) {
      console.error(err);
      els.empty.hidden = false;
    });

  /* "2026-08-17" -> "17 August 2026" */
  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function render(galleries) {
    if (!galleries.length) {
      els.empty.hidden = false;
      return;
    }

    var frag = document.createDocumentFragment();

    galleries.forEach(function (g) {
      var photos = g.photos || [];

      // Usa a miniatura da foto escolhida como capa, se existir
      var coverPhoto = g.cover
        ? photos.filter(function (p) { return p.file === g.cover; })[0]
        : photos[0];
      var cover = (coverPhoto && (coverPhoto.thumb || coverPhoto.file)) || g.cover;

      var card = document.createElement('a');
      card.className = 'album';
      card.href = 'g/' + encodeURIComponent(g.id) + '/';

      var frame = document.createElement('div');
      frame.className = 'album-frame';

      if (cover) {
        var img = document.createElement('img');
        img.src = cover;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        frame.appendChild(img);
      } else {
        frame.classList.add('album-frame--empty');
      }
      card.appendChild(frame);

      var info = document.createElement('div');
      info.className = 'album-info';

      var name = document.createElement('h2');
      name.className = 'album-name';
      name.textContent = g.name || g.id;
      info.appendChild(name);

      var meta = document.createElement('p');
      meta.className = 'album-meta';

      var bits = [];
      if (g.date) bits.push(formatDate(g.date));
      bits.push(photos.length + (photos.length === 1 ? ' photo' : ' photos'));
      if (g.description) bits.push(g.description);
      meta.textContent = bits.join(' · ');
      info.appendChild(meta);

      card.appendChild(info);
      frag.appendChild(card);
    });

    els.albums.appendChild(frag);
  }
})();
