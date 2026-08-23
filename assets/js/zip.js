/* ---------------------------------------------------------
   Zip — monta um .zip no próprio navegador, sem dependência.

   As fotos já são JPEG, ou seja, já estão comprimidas: comprimir
   de novo não ganharia quase nada e custaria muito processamento
   no celular. Por isso cada arquivo entra "stored" (método 0), e
   o formato fica simples — para cada foto um cabeçalho seguido
   dos bytes, e no fim o diretório central listando tudo.

   Uso:
     Zip.build([{ name: 'foto.jpg', url: 'images/x/foto.jpg' }], onProgress)
       .then(function (blob) { Zip.save(blob, 'galeria.zip'); });
   --------------------------------------------------------- */
window.Zip = (function () {
  'use strict';

  var LIMIT = 0xFFFFFFFF;   // zip comum guarda tamanhos em 32 bits (4 GB)

  // ---------- CRC-32 ----------

  var table = null;

  function crcTable() {
    if (table) return table;
    table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }

  function crc32(bytes) {
    var t = crcTable(), c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------- Pedaços do formato ----------

  function encodeName(name) {
    if (window.TextEncoder) return new TextEncoder().encode(name);
    var out = [];                       // navegador antigo: UTF-8 na mão
    var esc = unescape(encodeURIComponent(name));
    for (var i = 0; i < esc.length; i++) out.push(esc.charCodeAt(i) & 0xFF);
    return new Uint8Array(out);
  }

  /* O zip guarda data e hora no formato do MS-DOS: 2 bytes cada,
     com o ano contado a partir de 1980 e o segundo em passos de 2. */
  function dosStamp(d) {
    return {
      time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31),
      date: (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)
    };
  }

  function localHeader(name, crc, size, stamp) {
    var b = new Uint8Array(30 + name.length), v = new DataView(b.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);        // versão necessária para abrir
    v.setUint16(6, 0x0800, true);    // nome do arquivo em UTF-8
    v.setUint16(8, 0, true);         // método: stored
    v.setUint16(10, stamp.time, true);
    v.setUint16(12, stamp.date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, size, true);     // tamanho comprimido
    v.setUint32(22, size, true);     // tamanho original (iguais em stored)
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true);        // sem campo extra
    b.set(name, 30);
    return b;
  }

  function centralEntry(name, crc, size, stamp, offset) {
    var b = new Uint8Array(46 + name.length), v = new DataView(b.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);        // versão que gerou
    v.setUint16(6, 20, true);        // versão necessária
    v.setUint16(8, 0x0800, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, stamp.time, true);
    v.setUint16(14, stamp.date, true);
    v.setUint32(16, crc, true);
    v.setUint32(20, size, true);
    v.setUint32(24, size, true);
    v.setUint16(28, name.length, true);
    v.setUint16(30, 0, true);        // extra
    v.setUint16(32, 0, true);        // comentário
    v.setUint16(34, 0, true);        // disco
    v.setUint16(36, 0, true);        // atributos internos
    v.setUint32(38, 0, true);        // atributos externos
    v.setUint32(42, offset, true);   // onde está o cabeçalho local
    b.set(name, 46);
    return b;
  }

  function endOfDirectory(count, size, offset) {
    var b = new Uint8Array(22), v = new DataView(b.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(4, 0, true);
    v.setUint16(6, 0, true);
    v.setUint16(8, count, true);
    v.setUint16(10, count, true);
    v.setUint32(12, size, true);
    v.setUint32(16, offset, true);
    v.setUint16(20, 0, true);
    return b;
  }

  /* Dois arquivos com o mesmo nome quebram o zip na hora de extrair */
  function unique(used, name) {
    if (!used[name.toLowerCase()]) { used[name.toLowerCase()] = true; return name; }
    var dot = name.lastIndexOf('.');
    var stem = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot) : '';
    var n = 2, candidate;
    do { candidate = stem + '-' + n + ext; n++; } while (used[candidate.toLowerCase()]);
    used[candidate.toLowerCase()] = true;
    return candidate;
  }

  // ---------- Montagem ----------

  function build(entries, onProgress) {
    var parts = [], directory = [], offset = 0, used = {};
    var stamp = dosStamp(new Date());
    var chain = Promise.resolve();

    entries.forEach(function (entry, i) {
      chain = chain.then(function () {
        if (onProgress) onProgress(i, entries.length);
        return fetch(entry.url);
      }).then(function (r) {
        if (!r.ok) throw new Error('Could not read ' + entry.url);
        return r.arrayBuffer();
      }).then(function (buf) {
        var bytes = new Uint8Array(buf);
        var name = encodeName(unique(used, entry.name));
        var crc = crc32(bytes);
        var head = localHeader(name, crc, bytes.length, stamp);

        // Vira Blob para o navegador poder tirar os bytes da memória do JS
        parts.push(head, new Blob([bytes]));
        directory.push(centralEntry(name, crc, bytes.length, stamp, offset));
        offset += head.length + bytes.length;

        if (offset > LIMIT) throw new Error('This gallery is too large to zip in the browser.');
      });
    });

    return chain.then(function () {
      var size = 0;
      directory.forEach(function (entry) { size += entry.length; });
      if (onProgress) onProgress(entries.length, entries.length);
      return new Blob(parts.concat(directory, [endOfDirectory(directory.length, size, offset)]),
                      { type: 'application/zip' });
    });
  }

  function save(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  return { build: build, save: save, crc32: crc32 };
})();
