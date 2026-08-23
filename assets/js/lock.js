/* ---------------------------------------------------------
   Lock — senha das galerias privadas.

   O manifesto é público (qualquer um baixa galleries.json), então a
   senha NUNCA é gravada nele. O que fica gravado é o resultado de
   passar a senha por PBKDF2-SHA256 com um sal aleatório e muitas
   iterações — de onde não se volta para a senha, e cuja verificação
   é lenta o bastante para atrapalhar quem tente adivinhar.

   Isso tranca a porta da página. Não esconde os arquivos: as fotos
   continuam em images/<galeria>/ e o repositório é público. Veja o
   README, seção "Galeria privada".
   --------------------------------------------------------- */
window.Lock = (function () {
  'use strict';

  var ITERATIONS = 200000;

  function subtle() {
    return (window.crypto && window.crypto.subtle) || null;
  }

  function hex(buffer) {
    var bytes = new Uint8Array(buffer), out = '';
    for (var i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
  }

  function randomSalt() {
    return hex(window.crypto.getRandomValues(new Uint8Array(16)));
  }

  function bytesFromHex(s) {
    var out = new Uint8Array(s.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
  }

  /* senha + sal -> chave derivada, em hexadecimal */
  function derive(password, salt, iterations) {
    var api = subtle();
    if (!api) return Promise.reject(new Error('This browser cannot check the password.'));

    return api.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return api.deriveBits({
          name: 'PBKDF2',
          salt: bytesFromHex(salt),
          iterations: iterations || ITERATIONS,
          hash: 'SHA-256'
        }, key, 256);
      })
      .then(hex);
  }

  /* Cria o registro que vai para o manifesto */
  function make(password) {
    var salt = randomSalt();
    return derive(password, salt, ITERATIONS).then(function (hash) {
      return { salt: salt, hash: hash, iterations: ITERATIONS };
    });
  }

  function check(password, lock) {
    if (!lock || !lock.salt || !lock.hash) return Promise.resolve(false);
    return derive(password, lock.salt, lock.iterations).then(function (hash) {
      return hash === lock.hash;
    });
  }

  /* Quem acertou a senha não precisa digitar de novo a cada foto aberta.
     Vale só para esta aba: fechou o navegador, pede de novo. */
  function key(id) { return 'gallery-open:' + id; }

  function remember(id) {
    try { sessionStorage.setItem(key(id), '1'); } catch (e) { /* modo privado */ }
  }

  function remembered(id) {
    try { return sessionStorage.getItem(key(id)) === '1'; } catch (e) { return false; }
  }

  function forget(id) {
    try { sessionStorage.removeItem(key(id)); } catch (e) { /* nada a fazer */ }
  }

  function available() { return !!subtle(); }

  return {
    make: make,
    check: check,
    remember: remember,
    remembered: remembered,
    forget: forget,
    available: available
  };
})();
