// Zuordnung eines Tipps zu einer Runde (HANDOFF Abschnitt 4).
// Reine Funktionen ohne Zugriff auf DOM, Speicher oder die aktuelle Uhrzeit.
// Eine Runde wird als Date am Anfang der vollen Stunde (Gerätezeit) dargestellt.

const MINUTE = 60 * 1000;

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

/**
 * Rundungsregel mit Verspätungstoleranz: Minute ≤ spaet → laufende Stunde, sonst die nächste.
 */
export function gerundeteRunde(t, spaet = STANDARD_TOLERANZEN.spaet) {
  const start = stundenAnfang(t);
  return t.getMinutes() <= spaet ? start : plusStunden(start, 1);
}

/** Ganze Minuten von `a` bis `b` (abgerundet), negativ wenn `b` vor `a` liegt. */
function minutenZwischen(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / MINUTE);
}

/**
 * Ordnet einen Tipp zur Zeit `t` einer Runde zu.
 *
 * @param {Date} t                Zeitpunkt des Tipps
 * @param {Date|null} letzteRunde späteste bereits erfasste Runde (Stundenanfang) oder null
 * @param {{frueh?:number, spaet?:number, maxLueckeStunden?:number}} [toleranzen]
 * @returns {{
 *   art: 'neu'|'normal'|'spaet'|'frueh',
 *   runde: Date,
 *   luecken: Date[],
 *   minutenBisFaellig?: number
 * }}
 *   neu    – keine (verwertbare) letzte Runde, Runde nach Rundungsregel
 *   normal – Tipp liegt im Fenster der erwarteten Runde
 *   spaet  – Zielrunde nach Rundungsregel, dazwischen liegende Runden sind Lücken
 *   frueh  – wahrscheinlich Doppeltipp; die App fragt nach, Runde = erwartete Runde
 */
export function zuordnen(t, letzteRunde, toleranzen = {}) {
  const { frueh, spaet, maxLueckeStunden } = { ...STANDARD_TOLERANZEN, ...toleranzen };

  if (!letzteRunde) {
    return { art: 'neu', runde: gerundeteRunde(t, spaet), luecken: [] };
  }

  const erwartet = plusStunden(letzteRunde, 1);
  const abstand = minutenZwischen(erwartet, t); // > 0: nach der erwarteten Runde

  if (abstand > maxLueckeStunden * 60) {
    return { art: 'neu', runde: gerundeteRunde(t, spaet), luecken: [] };
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

  const ziel = gerundeteRunde(t, spaet);
  const luecken = [];
  for (let r = erwartet; r < ziel; r = plusStunden(r, 1)) luecken.push(r);
  return { art: 'spaet', runde: ziel, luecken };
}
