/* ---------------------------------------------------------
   Home — lista as galerias de galleries.json
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
      if (!r.ok) throw new Error('galleries.json não encontrado');
      return r.json();
    })
    .then(function (data) {
      var site = data.site || {};
      var galleries = (data.galleries || []).filter(function (g) { return g && g.id; });

      if (site.title) {
        els.title.textContent = site.title;
        document.title = site.title;
      }
      if (site.subtitle) els.subtitle.textContent = site.subtitle;

      els.footer.textContent = '© ' + new Date().getFullYear() + ' ' +
        (site.copyrightHolder || site.title || 'Galeria') + '. Todos os direitos reservados.';

      render(galleries);
    })
    .catch(function (err) {
      console.error(err);
      els.empty.hidden = false;
    });

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
      card.href = 'gallery.html?g=' + encodeURIComponent(g.id);

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
      meta.textContent = photos.length + (photos.length === 1 ? ' foto' : ' fotos');
      if (g.description) meta.textContent += ' · ' + g.description;
      info.appendChild(meta);

      card.appendChild(info);
      frag.appendChild(card);
    });

    els.albums.appendChild(frag);
  }
})();
