// Datenmodell und daraus abgeleitete Ansichten. Reine Funktionen, ohne DOM und ohne Speicherzugriff.
import { BEISPIELPLAN } from './plan.js';
import { STANDARD_TOLERANZEN, plusStunden } from './zuordnung.js';

export const DATEN_VERSION = 1;
const STUNDE = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export const EREIGNIS_TYPEN = [
  { id: 'fruehstueck', name: 'Frühstück' },
  { id: 'mittag', name: 'Mittagessen' },
  { id: 'abend', name: 'Abendessen' },
  { id: 'visite', name: 'Visite' }
];

/*
 Datenmodell (version 1)
 {
   version: 1,
   plan: { beispiel?: true, mittel: [{ id, name, kurz, art, stunden: number[], nachholbar }] },
   einstellungen: { frueh, spaet, dunkel: 'immer'|'auto'|'nie', erinnerungVon, erinnerungBis },
   runden: {
     'JJJJ-MM-TTTHH': {
       zeit: ISO-String | null,          // echte Uhrzeit der Eingabe, null = unbekannt
       mittel: { [id]: 'ja'|'nein'|'nachgeholt'|'entfaellt' },
       nachgeholt?: { [id]: ISO-String },
       ausgefallen?: true,               // „Nicht bekommen“ bestätigt
       unklar?: true                     // Lücke, Frage noch nicht beantwortet
     }
   },
   ereignisse: [{ typ, zeit: ISO-String, notiz?: string }],   // notiz bisher nur bei Visite
   letztesBackup: ISO-String | null
 }
*/

export function leererZustand() {
  return {
    version: DATEN_VERSION,
    plan: structuredClone(BEISPIELPLAN),
    einstellungen: {
      frueh: STANDARD_TOLERANZEN.frueh,
      spaet: STANDARD_TOLERANZEN.spaet,
      dunkel: 'immer',
      erinnerungVon: 10,
      erinnerungBis: 19
    },
    runden: {},
    ereignisse: [],
    letztesBackup: null
  };
}

/** Bringt gespeicherte Daten jeder bekannten Version auf den aktuellen Stand. */
export function migrieren(daten) {
  const basis = leererZustand();
  if (!daten || typeof daten !== 'object') return basis;
  const v = Number(daten.version) || 1;
  if (v > DATEN_VERSION) throw new Error('Diese Daten stammen aus einer neueren Version der App.');
  // Künftige Migrationen hier schrittweise: if (v < 2) { ... }
  return {
    version: DATEN_VERSION,
    plan: gueltigerPlan(daten.plan) ? daten.plan : basis.plan,
    einstellungen: { ...basis.einstellungen, ...(daten.einstellungen || {}) },
    runden: daten.runden && typeof daten.runden === 'object' ? daten.runden : {},
    ereignisse: Array.isArray(daten.ereignisse) ? daten.ereignisse : [],
    letztesBackup: daten.letztesBackup || null
  };
}

export function gueltigerPlan(plan) {
  return !!plan && Array.isArray(plan.mittel) && plan.mittel.length > 0 &&
    plan.mittel.every((m) =>
      typeof m.id === 'string' && m.id && typeof m.name === 'string' &&
      (m.art === 'tropfen' || m.art === 'salbe') &&
      Array.isArray(m.stunden) && m.stunden.every((h) => Number.isInteger(h) && h >= 0 && h <= 23));
}

/** Liest eine importierte Datei: vollständiges Backup oder nur ein Plan. */
export function importLesen(text) {
  let daten;
  try { daten = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (daten && daten.format === 'tropfen-plan') {
    if (!gueltigerPlan(daten.plan)) throw new Error('Der Plan in der Datei ist unvollständig.');
    const plan = { mittel: daten.plan.mittel.map((m) => ({ kurz: m.name, nachholbar: true, ...m })) };
    return { art: 'plan', plan };
  }
  if (daten && (daten.format === 'tropfen-backup' || daten.runden)) {
    return { art: 'backup', zustand: migrieren(daten) };
  }
  throw new Error('Die Datei ist weder ein Backup noch ein Plan dieser App.');
}

export function exportErzeugen(zustand) {
  return JSON.stringify({ format: 'tropfen-backup', ...zustand }, null, 2);
}

// ---------- Runden ----------

const pad = (n) => String(n).padStart(2, '0');

export function schluessel(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
}

export function ausSchluessel(k) {
  const [datum, h] = k.split('T');
  const [j, m, t] = datum.split('-').map(Number);
  return new Date(j, m - 1, t, Number(h));
}

/** Späteste erfasste Runde (auch teilweise, ausgefallen oder unklar) oder null. */
export function letzteRunde(runden) {
  const keys = Object.keys(runden);
  if (!keys.length) return null;
  keys.sort();
  return ausSchluessel(keys[keys.length - 1]);
}

export function faelligeMittel(plan, stunde) {
  return plan.mittel.filter((m) => m.stunden.includes(stunde));
}

export function mittelNach(plan, id) {
  return plan.mittel.find((m) => m.id === id) || { id, name: id, kurz: id, art: 'tropfen', nachholbar: true };
}

/** Neuer Rundeneintrag; `fehlend` sind die IDs, die nicht gegeben wurden. */
export function rundeErfassen(plan, runde, zeit, fehlend = []) {
  const mittel = {};
  for (const m of faelligeMittel(plan, runde.getHours())) mittel[m.id] = fehlend.includes(m.id) ? 'nein' : 'ja';
  const eintrag = { zeit: zeit ? zeit.toISOString() : null, mittel };
  if (Object.values(mittel).length && Object.values(mittel).every((s) => s === 'nein')) eintrag.ausgefallen = true;
  return eintrag;
}

export function rundeAusgefallen(plan, runde) {
  const mittel = {};
  for (const m of faelligeMittel(plan, runde.getHours())) mittel[m.id] = 'nein';
  return { zeit: null, mittel, ausgefallen: true };
}

export function rundeUnklar(plan, runde) {
  const mittel = {};
  for (const m of faelligeMittel(plan, runde.getHours())) mittel[m.id] = 'ja';
  return { zeit: null, mittel, unklar: true };
}

/** 'erledigt' | 'teilweise' | 'ausgefallen' | 'unklar' */
export function rundenStatus(e) {
  if (e.unklar) return 'unklar';
  const werte = Object.values(e.mittel);
  const gegeben = werte.filter((s) => s === 'ja' || s === 'nachgeholt').length;
  if (e.ausgefallen && gegeben === 0) return 'ausgefallen';
  return gegeben === werte.length ? 'erledigt' : 'teilweise';
}

/**
 * Alle 24 Runden eines Tages mit Status.
 * Status ohne Eintrag: 'kommt' (Zukunft), 'faellig', 'ueberfaellig', 'keine' (keine Angabe).
 */
export function tagesZeitleiste(zustand, tag, jetzt, ueberfaelligNach = 15) {
  const letzte = letzteRunde(zustand.runden);
  const zeilen = [];
  for (let h = 0; h < 24; h++) {
    const runde = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), h);
    const eintrag = zustand.runden[schluessel(runde)];
    let status;
    if (eintrag) status = rundenStatus(eintrag);
    else if (runde > jetzt) status = 'kommt';
    else if (!letzte || runde < letzte) status = 'keine';
    else status = (jetzt - runde) / MINUTE > ueberfaelligNach ? 'ueberfaellig' : 'faellig';
    const ids = eintrag ? Object.keys(eintrag.mittel) : faelligeMittel(zustand.plan, h).map((m) => m.id);
    zeilen.push({ runde, status, eintrag: eintrag || null, ids });
  }
  return zeilen;
}

/** Offene Punkte der letzten `stunden` Stunden: fehlende nachholbare Mittel und unbeantwortete Lücken. */
export function offenePunkte(zustand, jetzt, stunden = 24) {
  const liste = [];
  for (const k of Object.keys(zustand.runden).sort()) {
    const runde = ausSchluessel(k);
    if (jetzt - runde > stunden * STUNDE) continue;
    const e = zustand.runden[k];
    if (e.unklar) { liste.push({ art: 'unklar', k, runde }); continue; }
    for (const [id, s] of Object.entries(e.mittel)) {
      if (s === 'nein' && mittelNach(zustand.plan, id).nachholbar !== false) liste.push({ art: 'mittel', k, runde, id });
    }
  }
  return liste;
}

// ---------- Essen und Visite ----------

export function tagesSchluessel(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Median und Spanne der Uhrzeit (Minuten seit Mitternacht) über die letzten bis zu `tage` Tage mit Eintrag. */
export function ueblicheZeit(ereignisse, typ, tage = 5) {
  const ersteJeTag = new Map();
  for (const e of ereignisse) {
    if (e.typ !== typ) continue;
    const d = new Date(e.zeit);
    const k = tagesSchluessel(d);
    const min = d.getHours() * 60 + d.getMinutes();
    if (!ersteJeTag.has(k) || min < ersteJeTag.get(k)) ersteJeTag.set(k, min);
  }
  const werte = [...ersteJeTag.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, tage).map((x) => x[1]);
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mitte] : Math.round((s[mitte - 1] + s[mitte]) / 2);
  return { median, min: s[0], max: s[s.length - 1], anzahl: s.length };
}

export function ereignisseAm(ereignisse, typ, tag) {
  const k = tagesSchluessel(tag);
  return ereignisse.filter((e) => e.typ === typ && tagesSchluessel(new Date(e.zeit)) === k)
    .sort((a, b) => (a.zeit < b.zeit ? -1 : 1));
}

/**
 * Verlauf von Essen und Visite: die letzten `tage` Tage mit mindestens einem Eintrag, neueste zuerst.
 * @returns {{ tag: Date, typen: { [typ]: Date[] } }[]}
 */
export function ereignisVerlauf(ereignisse, tage = 14) {
  const proTag = new Map();
  for (const e of ereignisse) {
    const d = new Date(e.zeit);
    const k = tagesSchluessel(d);
    if (!proTag.has(k)) {
      proTag.set(k, { tag: new Date(d.getFullYear(), d.getMonth(), d.getDate()), typen: Object.fromEntries(EREIGNIS_TYPEN.map((t) => [t.id, []])) });
    }
    (proTag.get(k).typen[e.typ] ||= []).push(d);
  }
  const liste = [...proTag.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, tage).map((x) => x[1]);
  for (const t of liste) for (const zeiten of Object.values(t.typen)) zeiten.sort((a, b) => a - b);
  return liste;
}

/**
 * Setzt die Notiz eines Eintrags, gefunden über Typ und Zeit. Leerer Text entfernt die Notiz.
 * @returns {boolean} ob der Eintrag existiert
 */
export function notizSetzen(ereignisse, typ, zeit, text) {
  const e = ereignisse.find((x) => x.typ === typ && x.zeit === zeit);
  if (!e) return false;
  const t = String(text ?? '').trim();
  if (t) e.notiz = t; else delete e.notiz;
  return true;
}

/** Alle Visiten ab dem Tag `ab` (oder alle), neueste zuerst. */
export function visiten(ereignisse, ab = null) {
  const grenze = ab ? new Date(ab.getFullYear(), ab.getMonth(), ab.getDate()) : null;
  return ereignisse.filter((e) => e.typ === 'visite' && (!grenze || new Date(e.zeit) >= grenze))
    .sort((a, b) => (a.zeit < b.zeit ? 1 : -1));
}

// ---------- Formatierung ----------

export const uhrzeit = (d) => `${d.getHours()}:${pad(d.getMinutes())}`;
export const minutenAlsUhrzeit = (min) => `${Math.floor(min / 60)}:${pad(min % 60)}`;
export const rundenName = (runde) => `${runde.getHours()}-Uhr-Runde`;

export function dauer(minuten) {
  if (minuten < 60) return `${minuten} min`;
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function ueblichText(u) {
  if (!u) return 'noch keine Daten';
  const basis = `üblich ~${minutenAlsUhrzeit(u.median)}`;
  return u.min === u.max ? basis : `${basis} (${minutenAlsUhrzeit(u.min)}–${minutenAlsUhrzeit(u.max)})`;
}

const STATUS_TEXT = {
  erledigt: 'erledigt', teilweise: 'teilweise', ausgefallen: 'nicht bekommen', unklar: 'Eintrag fehlt',
  kommt: 'kommt noch', faellig: 'fällig', ueberfaellig: 'überfällig', keine: 'keine Angabe'
};
export const statusText = (s) => STATUS_TEXT[s] || s;

/** Kurzbeschreibung einer Runde für Zeitleiste und Tagesübersicht. */
export function rundenDetail(plan, zeile) {
  const e = zeile.eintrag;
  const kurz = (id) => mittelNach(plan, id).kurz || mittelNach(plan, id).name;
  // Ohne Eintrag nur die Zusatzmittel nennen; das stündliche Mittel steht in jeder Runde
  if (!e) return zeile.ids.filter((id) => (mittelNach(plan, id).stunden || []).length < 24).map(kurz).join(', ');
  if (e.unklar) return 'bekommen?';
  if (rundenStatus(e) === 'ausgefallen') return '';
  const fehlt = Object.entries(e.mittel).filter(([, s]) => s === 'nein').map(([id]) => kurz(id));
  const entfaellt = Object.entries(e.mittel).filter(([, s]) => s === 'entfaellt').map(([id]) => kurz(id));
  const nach = Object.entries(e.mittel).filter(([, s]) => s === 'nachgeholt').map(([id]) => kurz(id));
  const teile = [];
  if (fehlt.length) teile.push(`${fehlt.join(', ')} fehlt`);
  if (nach.length) teile.push(`${nach.join(', ')} nachgeholt`);
  if (entfaellt.length) teile.push(`${entfaellt.join(', ')} entfällt`);
  if (!teile.length) teile.push(e.zeit ? 'alles bekommen' : 'bekommen, Uhrzeit unbekannt');
  return teile.join(' · ');
}

/** Tagesübersicht als Text zum Vorzeigen oder Kopieren. */
export function tagesText(zustand, tag, jetzt) {
  const datum = tag.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const zeilen = [`Augentropfen ${datum}`, ''];
  for (const z of tagesZeitleiste(zustand, tag, jetzt)) {
    if (z.status === 'kommt' || z.status === 'keine') continue;
    const zeit = z.eintrag && z.eintrag.zeit ? uhrzeit(new Date(z.eintrag.zeit)) : '–';
    const detail = z.eintrag ? rundenDetail(zustand.plan, z) : '';
    zeilen.push(`${pad(z.runde.getHours())} Uhr  ${zeit.padStart(5)}  ${statusText(z.status)}${detail ? ' – ' + detail : ''}`);
  }
  const ev = EREIGNIS_TYPEN.flatMap((t) => ereignisseAm(zustand.ereignisse, t.id, tag).map((e) => `${t.name} ${uhrzeit(new Date(e.zeit))}`));
  if (ev.length) zeilen.push('', ev.join(', '));
  for (const e of ereignisseAm(zustand.ereignisse, 'visite', tag)) {
    if (e.notiz) zeilen.push('', `Visite ${uhrzeit(new Date(e.zeit))}:`, e.notiz);
  }
  return zeilen.join('\n');
}

// ---------- Kalender-Erinnerungen ----------

const icsDatum = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Je volle Stunde von `von` bis einschließlich `bis` ein täglich wiederkehrendes
 * 5-Minuten-Ereignis mit Alarm zur Startzeit. Zeiten sind „floating“ (Gerätezeit).
 */
export function icsErzeugen(von, bis, start, kennung = 'tropfen') {
  const z = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//tropfen//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const stempel = icsUtc(start);
  for (let h = von; h <= bis; h++) {
    const beginn = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h, 0);
    const ende = new Date(beginn.getTime() + 5 * MINUTE);
    z.push('BEGIN:VEVENT', `UID:${kennung}-${pad(h)}-${stempel}@tropfen`, `DTSTAMP:${stempel}`,
      `DTSTART:${icsDatum(beginn)}`, `DTEND:${icsDatum(ende)}`, 'RRULE:FREQ=DAILY', 'SUMMARY:Augentropfen',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Augentropfen', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  z.push('END:VCALENDAR');
  return z.join('\r\n') + '\r\n';
}

export { plusStunden };
