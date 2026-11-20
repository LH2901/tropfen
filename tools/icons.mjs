// Erzeugt die App-Icons als PNG ohne Abhängigkeiten: node tools/icons.mjs
// Motiv „Stundenring“: bernsteinfarbener Tropfen auf warmem Fast-Schwarz,
// umgeben von zwölf Strichen wie auf einem Zifferblatt; der Strich oben leuchtet.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const GRUND = [0x14, 0x13, 0x11];
const BERNSTEIN = [0xe8, 0xa9, 0x3b];
const STRICH = [0x5a, 0x54, 0x4b];

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

// Alle Maße in einem 100×100-Raster, Mitte (50, 50)

// Tropfen: unterer Kreis plus tangentialer Kegel zur Spitze
const TROPFEN = { cx: 50, cy: 57.1, r: 14, spitze: 30.9 };
function imTropfen(x, y) {
  const { cx, cy, r, spitze } = TROPFEN;
  const dx = x - cx, dy = y - cy;
  if (dx * dx + dy * dy <= r * r) return true;
  const d = cy - spitze;
  const sinH = r / d, cosH = Math.sqrt(1 - sinH * sinH), tanH = sinH / cosH;
  const yTangente = spitze + Math.sqrt(d * d - r * r) * cosH;
  return y >= spitze && y <= yTangente && Math.abs(dx) <= (y - spitze) * tanH;
}

// Zwölf Striche von Radius 35 bis 41, Breite 3 mit runden Enden
const STRICHE = Array.from({ length: 12 }, (_, i) => {
  const w = (i * Math.PI) / 6;
  const s = Math.sin(w), c = -Math.cos(w);
  return { x1: 50 + 35 * s, y1: 50 + 35 * c, x2: 50 + 41 * s, y2: 50 + 41 * c, oben: i === 0 };
});
function abstandZuStrecke(px, py, { x1, y1, x2, y2 }) {
  const vx = x2 - x1, vy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

function farbe(x, y) {
  if (imTropfen(x, y)) return BERNSTEIN;
  for (const s of STRICHE) if (abstandZuStrecke(x, y, s) <= 1.5) return s.oben ? BERNSTEIN : STRICH;
  return GRUND;
}

/** `motiv` skaliert das Motiv um die Mitte (für die sichere Zone von „maskable“). */
function png(groesse, motiv = 1) {
  const ss = 4;
  const breite = groesse * 3 + 1;
  const zeilen = Buffer.alloc(breite * groesse);
  for (let py = 0; py < groesse; py++) {
    zeilen[py * breite] = 0;
    for (let px = 0; px < groesse; px++) {
      const summe = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const u = ((px + (sx + 0.5) / ss) / groesse) * 100;
        const v = ((py + (sy + 0.5) / ss) / groesse) * 100;
        const f = farbe(50 + (u - 50) / motiv, 50 + (v - 50) / motiv);
        for (let i = 0; i < 3; i++) summe[i] += f[i];
      }
      const o = py * breite + 1 + px * 3;
      for (let i = 0; i < 3; i++) zeilen[o + i] = Math.round(summe[i] / (ss * ss));
    }
  }
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(groesse, 0); kopf.writeUInt32BE(groesse, 4);
  kopf[8] = 8; kopf[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', kopf), block('IDAT', deflateSync(zeilen, { level: 9 })), block('IEND', Buffer.alloc(0))
  ]);
}

const ziel = new URL('../icons/', import.meta.url);
mkdirSync(ziel, { recursive: true });
writeFileSync(new URL('apple-touch-icon.png', ziel), png(180));
writeFileSync(new URL('icon-192.png', ziel), png(192));
writeFileSync(new URL('icon-512.png', ziel), png(512));
writeFileSync(new URL('icon-maskable-512.png', ziel), png(512, 0.8)); // Ring bleibt im sicheren Kreis
console.log('Icons geschrieben');
