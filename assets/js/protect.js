/* ---------------------------------------------------------
   Protect — tira o "salvar imagem" do menu do navegador e do
   toque longo no celular, e avisa para usar o botão Download.

   Não é proteção: o arquivo precisa estar acessível para a
   galeria conseguir mostrar a foto. É um empurrão para o
   caminho certo — que também é o que conta nas estatísticas.
   --------------------------------------------------------- */
(function () {
  'use strict';

  var MESSAGES = {
    gallery: 'To save this photo, use the Download button.',
    home: 'Open a gallery to download the photos.'
  };

  var toast = null;
  var timer = null;

  function message() {
    return document.getElementById('lightbox') ? MESSAGES.gallery : MESSAGES.home;
  }

  function show(text) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }

    toast.textContent = text;
    toast.classList.add('toast--on');

    clearTimeout(timer);
    timer = setTimeout(function () {
      toast.classList.remove('toast--on');
    }, 2600);
  }

  function isPhoto(target) {
    return target && target.tagName === 'IMG';
  }

  // Menu do botão direito (e o menu do toque longo no Android)
  document.addEventListener('contextmenu', function (e) {
    if (!isPhoto(e.target)) return;
    e.preventDefault();
    show(message());
  });

  // Arrastar a imagem para fora do navegador
  document.addEventListener('dragstart', function (e) {
    if (isPhoto(e.target)) e.preventDefault();
  });

  /* No iPhone a folha de "salvar imagem" é suprimida pelo CSS e o
     contextmenu não dispara — então o aviso vem do toque longo. */
  var press = null;

  document.addEventListener('touchstart', function (e) {
    if (!isPhoto(e.target)) return;
    clearTimeout(press);
    press = setTimeout(function () { show(message()); }, 550);
  }, { passive: true });

  ['touchend', 'touchmove', 'touchcancel'].forEach(function (evt) {
    document.addEventListener(evt, function () { clearTimeout(press); }, { passive: true });
  });
})();
