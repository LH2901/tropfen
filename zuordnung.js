// Zuordnung eines Tipps zu einer Runde (HANDOFF Abschnitt 4).
// Reine Funktionen ohne Zugriff auf DOM, Speicher oder die aktuelle Uhrzeit.
// Eine Runde wird als Date am Anfang der vollen Stunde (Gerätezeit) dargestellt.
// Runden gibt es nur zu den Stunden, in denen laut Plan etwas fällig ist (`stunden`);
// ohne Angabe ist jede volle Stunde eine Runde.

const MINUTE = 60 * 1000;
export const ALLE_STUNDEN = Object.freeze([...Array(24).keys()]);

export const STANDARD_TOLERANZEN = Object.freeze({
  frueh: 40,          // Minuten vor der erwarteten Runde, die noch zu ihr zählen
  spaet: 45,          // Minuten nach der erwarteten Runde; zugleich Grenze der Rundungsregel
  maxLueckeStunden: 6 // größere Lücken gelten als Neuanfang ohne Lückenfragen
});

/** Anfang der vollen Stunde von `d` in Gerätezeit. */
export function stundenAnfang(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
}

/** Runde `n` Stunden nach `runde`, über die Wanduhr gezählt (robust bei Datumswechsel). */
export function plusStunden(runde, n) {
  return new Date(runde.getFullYear(), runde.getMonth(), runde.getDate(), runde.getHours() + n);
}

const stundenMenge = (stunden) => new Set(stunden && stunden.length ? stunden : ALLE_STUNDEN);

/** Erste Runde strikt nach `d`. */
export function naechsteRunde(d, stunden = ALLE_STUNDEN) {
  const menge = stundenMenge(stunden);
  let r = plusStunden(stundenAnfang(d), 1);
  for (let i = 0; i < 48 && !menge.has(r.getHours()); i++) r = plusStunden(r, 1);
  return r;
}

/** Späteste Runde, die zu oder vor `d` beginnt. */
export function rundeBis(d, stunden = ALLE_STUNDEN) {
  const menge = stundenMenge(stunden);
  let r = stundenAnfang(d);
  for (let i = 0; i < 48 && !menge.has(r.getHours()); i++) r = plusStunden(r, -1);
  return r;
}

/** Ganze Minuten von `a` bis `b` (abgerundet), negativ wenn `b` vor `a` liegt. */
function minutenZwischen(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / MINUTE);
}

/**
 * Rundungsregel mit Verspätungstoleranz. Stündlich: Minute ≤ spaet → laufende Runde, sonst die nächste.
 * Allgemein gehören die letzten (60 − spaet) Minuten vor einer Runde schon zu ihr.
 */
export function gerundeteRunde(t, spaet = STANDARD_TOLERANZEN.spaet, stunden = ALLE_STUNDEN) {
  const vorige = rundeBis(t, stunden);
  const naechste = naechsteRunde(vorige, stunden);
  const abstand = minutenZwischen(vorige, naechste);
  return minutenZwischen(vorige, t) <= abstand - 60 + spaet ? vorige : naechste;
}

/**
 * Ordnet einen Tipp zur Zeit `t` einer Runde zu.
 *
 * @param {Date} t                Zeitpunkt des Tipps
 * @param {Date|null} letzteRunde späteste bereits erfasste Runde (Stundenanfang) oder null
 * @param {{frueh?:number, spaet?:number, maxLueckeStunden?:number}} [toleranzen]
 * @param {number[]} [stunden]    Stunden mit Runden laut Plan (Standard: jede Stunde)
 * @returns {{
 *   art: 'neu'|'normal'|'spaet'|'frueh',
 *   runde: Date,
 *   luecken: Date[],
 *   minutenBisFaellig?: number
 * }}
 *   neu    – keine (verwertbare) letzte Runde, Runde nach Rundungsregel
 *   normal – Tipp gehört zur erwarteten Runde
 *   spaet  – Zielrunde nach Rundungsregel, dazwischen liegende Runden sind Lücken
 *   frueh  – wahrscheinlich Doppeltipp; die App fragt nach, Runde = erwartete Runde
 */
export function zuordnen(t, letzteRunde, toleranzen = {}, stunden = ALLE_STUNDEN) {
  const { frueh, spaet, maxLueckeStunden } = { ...STANDARD_TOLERANZEN, ...toleranzen };

  if (!letzteRunde) {
    return { art: 'neu', runde: gerundeteRunde(t, spaet, stunden), luecken: [] };
  }

  const erwartet = naechsteRunde(letzteRunde, stunden);
  const abstand = minutenZwischen(erwartet, t); // > 0: nach der erwarteten Runde

  if (abstand > maxLueckeStunden * 60) {
    return { art: 'neu', runde: gerundeteRunde(t, spaet, stunden), luecken: [] };
  }

  if (abstand < -frueh) {
    return {
      art: 'frueh',
      runde: erwartet,
      luecken: [],
      minutenBisFaellig: Math.ceil((erwartet.getTime() - t.getTime()) / MINUTE)
    };
  }

  if (abstand <= spaet) {
    return { art: 'normal', runde: erwartet, luecken: [] };
  }

  const ziel = gerundeteRunde(t, spaet, stunden);
  // Bei Abständen über einer Stunde kann ein später Tipp noch zur erwarteten Runde gehören
  if (ziel <= erwartet) return { art: 'normal', runde: erwartet, luecken: [] };
  const luecken = [];
  for (let r = erwartet; r < ziel; r = naechsteRunde(r, stunden)) luecken.push(r);
  return { art: 'spaet', runde: ziel, luecken };
}
