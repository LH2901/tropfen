// Erzeugt die App-Icons als PNG ohne Abhängigkeiten: node tools/icons.mjs
// Motiv: bernsteinfarbener Tropfen auf warmem Fast-Schwarz.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const GRUND = [0x14, 0x13, 0x11];
const TROPFEN = [0xe8, 0xa9, 0x3b];

const crcTabelle = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTabelle[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function block(typ, daten) {
  const laenge = Buffer.alloc(4); laenge.writeUInt32BE(daten.length);
  const td = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([laenge, td, crc]);
}

// Tropfen in Einheitskoordinaten: Kreis plus Kegel zur Spitze, `s` skaliert um die Mitte
function imTropfen(x, y, s) {
  const cx = 0.5, cy = 0.5 + 0.1 * s, r = 0.22 * s, spitze = 0.5 - 0.3 * s;
  const dx = x - cx, dy = y - cy;
  if (dx * dx + dy * dy <= r * r) return true;
  const d = cy - spitze;
  const sinH = r / d, cosH = Math.sqrt(1 - sinH * sinH), tanH = sinH / cosH;
  const yTangente = spitze + Math.sqrt(d * d - r * r) * cosH;
  return y >= spitze && y <= yTangente && Math.abs(dx) <= (y - spitze) * tanH;
}

function png(groesse, skala) {
  const ss = 4;
  const zeilen = Buffer.alloc((groesse * 3 + 1) * groesse);
  for (let py = 0; py < groesse; py++) {
    zeilen[py * (groesse * 3 + 1)] = 0;
    for (let px = 0; px < groesse; px++) {
      let treffer = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        if (imTropfen((px + (sx + 0.5) / ss) / groesse, (py + (sy + 0.5) / ss) / groesse, skala)) treffer++;
      }
      const a = treffer / (ss * ss);
      const o = py * (groesse * 3 + 1) + 1 + px * 3;
      for (let i = 0; i < 3; i++) zeilen[o + i] = Math.round(GRUND[i] * (1 - a) + TROPFEN[i] * a);
    }
  }
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(groesse, 0); kopf.writeUInt32BE(groesse, 4);
  kopf[8] = 8; kopf[9] = 2; kopf[10] = 0; kopf[11] = 0; kopf[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', kopf), block('IDAT', deflateSync(zeilen, { level: 9 })), block('IEND', Buffer.alloc(0))
  ]);
}

const ziel = new URL('../icons/', import.meta.url);
mkdirSync(ziel, { recursive: true });
writeFileSync(new URL('apple-touch-icon.png', ziel), png(180, 1.25));
writeFileSync(new URL('icon-192.png', ziel), png(192, 1.25));
writeFileSync(new URL('icon-512.png', ziel), png(512, 1.25));
writeFileSync(new URL('icon-maskable-512.png', ziel), png(512, 1.0)); // kleiner für die sichere Zone
console.log('Icons geschrieben');
