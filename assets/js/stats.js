/* ---------------------------------------------------------
   Página de estatísticas — lê o coletor (Cloudflare Worker)
   e cruza os números com o galleries.json para mostrar nomes
   e miniaturas em vez de ids.
   --------------------------------------------------------- */
(function () {
  'use strict';

  var KEY_STORE = 'photos.stats_key';

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    authPill: $('authPill'), authForm: $('authForm'), authDone: $('authDone'),
    authWho: $('authWho'), authHint: $('authHint'),
    keyInput: $('keyInput'), btnUnlock: $('btnUnlock'), btnForget: $('btnForget'),
    cardSummary: $('cardSummary'), cardGalleries: $('cardGalleries'), cardPhotos: $('cardPhotos'),
    rangeSelect: $('rangeSelect'), summaryTiles: $('summaryTiles'), chart: $('chart'),
    galleryTable: $('galleryTable'), photoGallery: $('photoGallery'),
    photoList: $('photoList'), photoHint: $('photoHint')
  };

  var state = {
    key: localStorage.getItem(KEY_STORE) || '',
    endpoint: '',
    manifest: null,
    data: null
  };

  var LABELS = {
    page: 'Home visits',
    gallery: 'Gallery opens',
    view: 'Photo views',
    download: 'Downloads'
  };

  // ---------- Manifesto (nomes e miniaturas) ----------

  fetch('../galleries.json?v=' + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      state.manifest = data;
      state.endpoint = (data.site && data.site.statsEndpoint) || '';

      if (!state.endpoint) {
        setPill('Collector not set up', 'error');
        el.authHint.innerHTML = 'No <code>statsEndpoint</code> in <code>galleries.json</code> yet. ' +
          'Follow <code>analytics/README.md</code> to publish the Cloudflare Worker, ' +
          'then paste its URL there.';
        el.btnUnlock.disabled = true;
        return;
      }

      if (state.key) load();
    })
    .catch(function () {
      setPill('galleries.json not found', 'error');
    });

  // ---------- Acesso ----------

  function setPill(text, kind) {
    el.authPill.textContent = text;
    el.authPill.className = 'pill' + (kind ? ' pill--' + kind : '');
  }

  el.btnUnlock.addEventListener('click', function () {
    var key = el.keyInput.value.trim();
    if (!key) { setPill('Paste the key first', 'error'); return; }
    state.key = key;
    load(true);
  });

  el.keyInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') el.btnUnlock.click();
  });

  el.btnForget.addEventListener('click', function () {
    localStorage.removeItem(KEY_STORE);
    location.reload();
  });

  el.rangeSelect.addEventListener('change', function () { load(); });

  function load(remember) {
    setPill('Loading…');
    el.btnUnlock.disabled = true;

    var url = state.endpoint.replace(/\/+$/, '') + '/stats?days=' +
      encodeURIComponent(el.rangeSelect.value) + '&key=' + encodeURIComponent(state.key);

    fetch(url)
      .then(function (r) {
        if (r.status === 401) throw new Error('Wrong key.');
        if (!r.ok) throw new Error('Collector returned HTTP ' + r.status + '.');
        return r.json();
      })
      .then(function (data) {
        state.data = data;
        if (remember) localStorage.setItem(KEY_STORE, state.key);

        setPill('Unlocked', 'ok');
        el.authForm.hidden = true;
        el.authDone.hidden = false;
        el.authWho.textContent = 'Reading from ' + state.endpoint + '.';
        el.cardSummary.hidden = false;
        el.cardGalleries.hidden = false;
        el.cardPhotos.hidden = false;

        render();
      })
      .catch(function (err) {
        el.btnUnlock.disabled = false;
        setPill(err.message, 'error');
      });
  }

  // ---------- Helpers ----------

  function galleryName(id) {
    var g = ((state.manifest && state.manifest.galleries) || []).filter(function (x) {
      return x.id === id;
    })[0];
    return g ? (g.name || g.id) : id;
  }

  function photoInfo(galleryId, file) {
    var g = ((state.manifest && state.manifest.galleries) || []).filter(function (x) {
      return x.id === galleryId;
    })[0];
    if (!g) return null;

    return (g.photos || []).filter(function (p) {
      return p.file.split('/').pop() === file;
    })[0] || null;
  }

  function sumBy(rows, keyFn) {
    var out = {};
    (rows || []).forEach(function (row) {
      var k = keyFn(row);
      out[k] = (out[k] || 0) + (row.count || 0);
    });
    return out;
  }

  function number(n) {
    return (n || 0).toLocaleString('en-GB');
  }

  // ---------- Render ----------

  function render() {
    renderSummary();
    renderChart();
    renderGalleries();
    renderPhotoGalleries();
  }

  function renderSummary() {
    var period = sumBy(state.data.daily, function (r) { return r.kind; });
    var allTime = sumBy(state.data.allTime, function (r) { return r.kind; });

    el.summaryTiles.innerHTML = '';

    ['page', 'gallery', 'view', 'download'].forEach(function (kind) {
      var tile = document.createElement('div');
      tile.className = 'tile-stat';

      var value = document.createElement('p');
      value.className = 'tile-value';
      value.textContent = number(period[kind]);
      tile.appendChild(value);

      var label = document.createElement('p');
      label.className = 'tile-label';
      label.textContent = LABELS[kind];
      tile.appendChild(label);

      var total = document.createElement('p');
      total.className = 'tile-total';
      total.textContent = number(allTime[kind]) + ' all time';
      tile.appendChild(total);

      el.summaryTiles.appendChild(tile);
    });
  }

  function renderChart() {
    var byDay = {};
    (state.data.daily || []).forEach(function (r) {
      byDay[r.day] = (byDay[r.day] || 0) + (r.count || 0);
    });

    var days = Object.keys(byDay).sort();
    el.chart.innerHTML = '';

    if (!days.length) {
      el.chart.innerHTML = '<p class="hint">Nothing recorded in this period yet.</p>';
      return;
    }

    var max = Math.max.apply(null, days.map(function (d) { return byDay[d]; }));

    days.forEach(function (day) {
      var bar = document.createElement('div');
      bar.className = 'bar';
      bar.title = day + ': ' + number(byDay[day]) + ' events';

      var fill = document.createElement('span');
      fill.style.height = Math.max(3, Math.round((byDay[day] / max) * 100)) + '%';
      bar.appendChild(fill);

      el.chart.appendChild(bar);
    });

    var scale = document.createElement('p');
    scale.className = 'chart-scale';
    scale.textContent = days[0] + ' → ' + days[days.length - 1] + ' · peak ' + number(max) + '/day';
    el.chart.appendChild(scale);
  }

  function renderGalleries() {
    var body = el.galleryTable.querySelector('tbody');
    body.innerHTML = '';

    var rows = {};
    (state.data.galleries || []).forEach(function (r) {
      rows[r.gallery] = rows[r.gallery] || { gallery: r.gallery, gallery_: 0, view: 0, download: 0 };
      if (r.kind === 'gallery') rows[r.gallery].gallery_ += r.count;
      if (r.kind === 'view') rows[r.gallery].view += r.count;
      if (r.kind === 'download') rows[r.gallery].download += r.count;
    });

    var list = Object.keys(rows).map(function (k) { return rows[k]; })
      .sort(function (a, b) { return b.gallery_ - a.gallery_ || b.view - a.view; });

    if (!list.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-cell">Nothing recorded yet.</td></tr>';
      return;
    }

    list.forEach(function (row) {
      var tr = document.createElement('tr');

      var name = document.createElement('td');
      var link = document.createElement('a');
      link.href = '../g/' + row.gallery + '/';
      link.textContent = galleryName(row.gallery);
      name.appendChild(link);
      tr.appendChild(name);

      [row.gallery_, row.view, row.download].forEach(function (value) {
        var td = document.createElement('td');
        td.className = 'num';
        td.textContent = number(value);
        tr.appendChild(td);
      });

      body.appendChild(tr);
    });
  }

  function renderPhotoGalleries() {
    var ids = {};
    (state.data.photos || []).forEach(function (r) { ids[r.gallery] = true; });

    var previous = el.photoGallery.value;
    el.photoGallery.innerHTML = '';

    Object.keys(ids).forEach(function (id) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = galleryName(id);
      el.photoGallery.appendChild(o);
    });

    if (!Object.keys(ids).length) {
      el.photoList.innerHTML = '';
      el.photoHint.textContent = 'No photo views or downloads recorded yet.';
      return;
    }

    el.photoGallery.value = previous && ids[previous] ? previous : Object.keys(ids)[0];
    renderPhotos();
  }

  el.photoGallery.addEventListener('change', renderPhotos);

  function renderPhotos() {
    var galleryId = el.photoGallery.value;
    var rows = {};

    (state.data.photos || []).forEach(function (r) {
      if (r.gallery !== galleryId) return;
      rows[r.photo] = rows[r.photo] || { photo: r.photo, view: 0, download: 0 };
      if (r.kind === 'view') rows[r.photo].view += r.count;
      if (r.kind === 'download') rows[r.photo].download += r.count;
    });

    var list = Object.keys(rows).map(function (k) { return rows[k]; })
      .sort(function (a, b) { return b.view - a.view || b.download - a.download; });

    el.photoHint.textContent = list.length + ' photo(s) with activity, most seen first.';
    el.photoList.innerHTML = '';

    list.forEach(function (row) {
      var info = photoInfo(galleryId, row.photo);

      var li = document.createElement('li');
      li.className = 'photostat';

      var thumb = document.createElement('img');
      thumb.className = 'photostat-thumb';
      thumb.src = info ? '../' + (info.thumb || info.file) : '';
      thumb.alt = '';
      thumb.loading = 'lazy';
      li.appendChild(thumb);

      var meta = document.createElement('div');
      meta.className = 'photostat-meta';

      var title = document.createElement('p');
      title.className = 'photostat-title';
      title.textContent = info ? (info.title || row.photo) : row.photo;
      meta.appendChild(title);

      var file = document.createElement('p');
      file.className = 'photostat-file';
      file.textContent = row.photo;
      meta.appendChild(file);

      li.appendChild(meta);

      var counts = document.createElement('div');
      counts.className = 'photostat-counts';
      counts.appendChild(count(row.view, 'views'));
      counts.appendChild(count(row.download, 'downloads'));
      li.appendChild(counts);

      el.photoList.appendChild(li);
    });
  }

  function count(value, label) {
    var box = document.createElement('div');
    box.className = 'photostat-count';

    var n = document.createElement('span');
    n.className = 'photostat-number';
    n.textContent = number(value);
    box.appendChild(n);

    var l = document.createElement('span');
    l.className = 'photostat-label';
    l.textContent = label;
    box.appendChild(l);

    return box;
  }

  // ---------- Início ----------

  if (state.key) el.keyInput.value = state.key;
})();
