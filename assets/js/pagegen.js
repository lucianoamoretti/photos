/* ---------------------------------------------------------
   PageGen — gera g/<id>/index.html a partir de gallery.html.

   WhatsApp, Instagram e afins não rodam JavaScript: eles leem só o
   HTML cru. Como gallery.html é uma página só para todas as galerias,
   o preview saía sempre com o mesmo título. Cada galeria passa a ter
   uma página própria, com as tags Open Graph já escritas no HTML.
   --------------------------------------------------------- */
window.PageGen = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function base(site) {
    return (site.url || '').replace(/\/+$/, '');
  }

  function absolute(site, path) {
    return base(site) + '/' + String(path || '').replace(/^\/+/, '');
  }

  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* Miniatura da capa — é o que aparece no preview do link. */
  function coverImage(gallery) {
    var photos = gallery.photos || [];
    var cover = gallery.cover
      ? photos.filter(function (p) { return p.file === gallery.cover; })[0]
      : photos[0];
    if (!cover) cover = photos[0];
    return cover ? (cover.thumb || cover.file) : '';
  }

  function description(gallery) {
    var photos = gallery.photos || [];
    var bits = [];

    if (gallery.date) bits.push(formatDate(gallery.date));
    bits.push(photos.length + (photos.length === 1 ? ' photo' : ' photos'));

    var author = (photos[0] && photos[0].author) || '';
    if (author) bits.push('by ' + author);

    var text = bits.join(' · ');
    return gallery.description ? gallery.description + ' — ' + text : text;
  }

  function path(gallery) {
    return 'g/' + gallery.id + '/index.html';
  }

  function url(site, gallery) {
    return base(site) + '/g/' + gallery.id + '/';
  }

  /* Recebe o HTML de gallery.html e devolve a página da galeria. */
  function build(template, site, gallery) {
    var siteName = site.title || 'Gallery';
    var title = (gallery.name || gallery.id) + ' — ' + siteName;
    var desc = description(gallery);
    var image = coverImage(gallery);

    var head = [
      '<base href="../../">',
      '<link rel="canonical" href="' + esc(url(site, gallery)) + '">',
      '<meta name="description" content="' + esc(desc) + '">',
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="' + esc(siteName) + '">',
      '<meta property="og:title" content="' + esc(gallery.name || gallery.id) + '">',
      '<meta property="og:description" content="' + esc(desc) + '">',
      '<meta property="og:url" content="' + esc(url(site, gallery)) + '">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:title" content="' + esc(gallery.name || gallery.id) + '">',
      '<meta name="twitter:description" content="' + esc(desc) + '">'
    ];

    if (image) {
      head.splice(head.length - 3, 0,
        '<meta property="og:image" content="' + esc(absolute(site, image)) + '">',
        '<meta property="og:image:alt" content="' + esc(gallery.name || gallery.id) + '">');
      head.push('<meta name="twitter:image" content="' + esc(absolute(site, image)) + '">');
    }

    var html = template;

    /* Depois do charset (que precisa vir nos primeiros bytes) e antes de
       qualquer URL relativa do <head>, por causa do <base>. */
    var anchor = '<meta charset="utf-8">';
    html = html.indexOf(anchor) !== -1
      ? html.replace(anchor, anchor + '\n' + head.join('\n'))
      : html.replace('<head>', '<head>\n' + head.join('\n'));

    html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>');

    html = html.replace('<script src="assets/js/gallery.js"></script>',
      '<script>window.GALLERY_ID = ' + JSON.stringify(gallery.id) + ';</script>\n' +
      '<script src="assets/js/gallery.js"></script>');

    return html;
  }

  return {
    build: build,
    path: path,
    url: url,
    coverImage: coverImage
  };
})();
