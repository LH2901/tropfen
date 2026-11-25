// Oberfläche. Alle Regeln stehen in zuordnung.js und logik.js; hier nur Anzeige, Eingabe und Speicher.
import { zuordnen } from './zuordnung.js';
import {
  leererZustand, migrieren, importLesen, exportErzeugen, schluessel, ausSchluessel, letzteRunde,
  faelligeMittel, mittelNach, rundeErfassen, rundeAusgefallen, rundeUnklar, rundenStatus,
  tagesZeitleiste, offenePunkte, ueblicheZeit, ereignisseAm, EREIGNIS_TYPEN, uhrzeit, rundenName,
  dauer, ueblichText, statusText, rundenDetail, tagesText, icsErzeugen, tagesSchluessel,
  ereignisVerlauf, minutenAlsUhrzeit, notizSetzen, visiten, rundenStunden,
  extraErfassen, extraAm, extraMittelText,
  proTag, gabeErfassen, gabenAm, anzahlStand, gabeVorschlag, mittelText
} from './logik.js';

const APP_VERSION = '1.5.1';
const SPEICHER_KEY = 'tropfen';
const UEBERFAELLIG_NACH = 15; // Minuten nach der vollen Stunde

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Speicher ----------

function laden() {
  try {
    const roh = localStorage.getItem(SPEICHER_KEY);
    return roh ? migrieren(JSON.parse(roh)) : leererZustand();
  } catch (fehler) {
    try { localStorage.setItem(SPEICHER_KEY + '.defekt', localStorage.getItem(SPEICHER_KEY) || ''); } catch {}
    console.error(fehler);
    return leererZustand();
  }
}

let z = laden();
let tagVersatz = 0;

function speichern() {
  try { localStorage.setItem(SPEICHER_KEY, JSON.stringify(z)); }
  catch { toast('Speichern fehlgeschlagen. Bitte ein Backup exportieren.'); }
}

// Rückgängig: Stand vor der letzten Aktion
let rueckStand = null;
let toastTimer = null;
const merken = () => { rueckStand = JSON.stringify(z); };

function toast(text, mitRueckgaengig = true) {
  $('toast-text').textContent = text;
  $('toast').querySelector('.toast-knopf').hidden = !mitRueckgaengig;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; rueckStand = null; }, 6000);
}

function rueckgaengig() {
  if (!rueckStand) return;
  // Ein offenes Sheet gehört zur rückgängig gemachten Aktion (Lückenfragen, Visite-Notiz)
  if (!$('sheet').hidden) sheetSchliessen();
  z = migrieren(JSON.parse(rueckStand));
  rueckStand = null;
  speichern();
  $('toast').hidden = true;
  render();
}

const toleranzen = () => ({ frueh: Number(z.einstellungen.frueh), spaet: Number(z.einstellungen.spaet) });
const kurzName = (id) => { const m = mittelNach(z.plan, id); return m.kurz || m.name; };
const anzahlModus = () => z.einstellungen.modus === 'anzahl';

// ---------- Bausteine ----------

const TROPFEN = 'M12 2.8C9.6 6.3 5.5 11 5.5 15a6.5 6.5 0 0 0 13 0c0-4-4.1-8.7-6.5-12.2Z';

function glyph(status) {
  let inhalt;
  let klasse = '';
  switch (status) {
    case 'erledigt': inhalt = `<path class="fuellung" d="${TROPFEN}"/>`; break;
    case 'teilweise': inhalt = `<path class="umriss" d="${TROPFEN}"/><path class="fuellung" d="${TROPFEN}" clip-path="url(#unten-haelfte)"/>`; break;
    case 'ausgefallen': inhalt = `<path class="umriss" d="${TROPFEN}"/><line class="strich" x1="3.5" y1="21.5" x2="20.5" y2="4.5"/>`; break;
    case 'ueberfaellig': inhalt = `<path class="umriss" d="${TROPFEN}"/><text class="zeichen" x="12" y="19.2" text-anchor="middle">!</text>`; break;
    case 'unklar': inhalt = `<path class="umriss" d="${TROPFEN}"/><text class="zeichen" x="12" y="19.2" text-anchor="middle">?</text>`; break;
    case 'faellig': inhalt = `<path class="umriss" d="${TROPFEN}"/>`; break;
    case 'extra': inhalt = `<path class="umriss" d="${TROPFEN}"/><line class="strich duenn" x1="12" y1="11.5" x2="12" y2="18.5"/><line class="strich duenn" x1="8.5" y1="15" x2="15.5" y2="15"/>`; break;
    case 'keine': klasse = 'leise'; inhalt = `<line class="strich" x1="7" y1="12" x2="17" y2="12"/>`; break;
    default: klasse = 'punkt leise'; inhalt = `<circle class="umriss" cx="12" cy="12" r="8"/>`;
  }
  return `<span class="glyph ${klasse}" aria-hidden="true"><svg viewBox="0 0 24 24">${inhalt}</svg></span>`;
}

const artIcon = (art) => `<svg class="ico" aria-hidden="true"><use href="#i-${art === 'salbe' ? 'salbe' : 'tropfen'}"/></svg>`;
const hakenIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><use href="#i-haken"/></svg>';

function zeitAusFeld(runde, wert) {
  if (!wert) return null;
  const [h, m] = wert.split(':').map(Number);
  const d = new Date(runde.getFullYear(), runde.getMonth(), runde.getDate(), h, m);
  // Eine Uhrzeit weit vor der Runde (z. B. 0:10 für die 23-Uhr-Runde) gehört zum Folgetag
  if (d - runde < -6 * 3600e3) d.setDate(d.getDate() + 1);
  return d;
}
const feldZeit = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ---------- Darstellung ----------

function themaAnwenden() {
  const modus = z.einstellungen.dunkel;
  const h = new Date().getHours();
  const dunkel = modus === 'immer' || (modus === 'auto' && (h >= 21 || h < 7 || matchMedia('(prefers-color-scheme: dark)').matches));
  document.documentElement.dataset.theme = dunkel ? 'dunkel' : 'hell';
  document.querySelector('meta[name="theme-color"]').content = dunkel ? '#141311' : '#e6e3dc';
}

function render() {
  const jetzt = new Date();
  themaAnwenden();
  $('datum').textContent = jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  if (anzahlModus()) {
    renderStand(jetzt);
    $('offen').hidden = true;
  } else {
    renderNaechste(jetzt);
    renderOffen(jetzt);
  }
  document.querySelector('.leiste [data-aktion="nicht-alles"]').textContent = anzahlModus() ? 'Auswahl …' : 'Nicht alles …';
  // Nach Anzahl wird zu Hause getropft: dort gibt es weder Klinikessen noch Visite
  $('essen-visite').hidden = anzahlModus();
  renderEreignisse(jetzt);
  renderZeitleiste(jetzt);
  $('beispiel').hidden = !z.plan.beispiel;
}

function renderNaechste(jetzt) {
  const letzte = letzteRunde(z.runden);
  const r = zuordnen(jetzt, letzte, toleranzen(), rundenStunden(z.plan));
  const mittel = faelligeMittel(z.plan, r.runde.getHours());
  const seit = Math.floor((jetzt - r.runde) / 60000);
  let abstand = '';
  let warnung = '';
  let notiz = '';

  if (r.art === 'frueh') {
    abstand = `in ${dauer(r.minutenBisFaellig)}`;
    const e = z.runden[schluessel(letzte)];
    const wann = e && e.zeit ? ` um ${uhrzeit(new Date(e.zeit))}` : '';
    notiz = `${rundenName(letzte)} ist eingetragen${wann}.`;
  } else if (seit < 0) {
    abstand = `in ${dauer(-seit)}`;
  } else if (seit <= UEBERFAELLIG_NACH) {
    abstand = seit === 0 ? 'jetzt fällig' : `fällig seit ${dauer(seit)}`;
  } else {
    warnung = `${glyph('ueberfaellig')}<span>Überfällig seit ${dauer(seit)}</span>`;
  }
  if (r.luecken.length) {
    const liste = r.luecken.map((d) => d.getHours()).join(', ').replace(/, (\d+)$/, ' und $1');
    notiz = `Für ${liste} Uhr fehlt ein Eintrag. Beim Eintragen wirst du kurz gefragt.`;
  }

  $('naechste').innerHTML = `
    <p class="naechste-label">Nächste Runde</p>
    <div class="naechste-zeile">
      <p class="naechste-zeit">${r.runde.getHours()}<small>Uhr</small></p>
      ${abstand ? `<p class="naechste-abstand">${abstand}</p>` : ''}
    </div>
    ${warnung ? `<p class="ueberfaellig">${warnung}</p>` : ''}
    <ul class="mittel-liste">${mittel.map((m) => `<li>${artIcon(m.art)}<span>${esc(m.name)}</span></li>`).join('')}</ul>
    ${notiz ? `<p class="notiz">${notiz}</p>` : ''}`;

  $('haupt-runde').textContent = rundenName(r.runde);
  $('haupt').querySelector('.haupt-label').textContent = 'Alles bekommen';
  $('haupt').classList.toggle('ruhig', r.art === 'frueh');
  $('haupt').setAttribute('aria-label', `${rundenName(r.runde)}: alles bekommen`);
}

// Modus „Nach Anzahl“: je Mittel, wie oft heute schon, und wann ungefähr als Nächstes
function standInfo(s, jetzt) {
  const zuletzt = s.zuletzt ? `zuletzt ${uhrzeit(s.zuletzt)}` : '';
  let wann;
  if (s.status === 'fertig') wann = 'für heute fertig';
  else if (s.status === 'spaeter') wann = s.zuletzt ? `nächste ~${uhrzeit(s.naechste)}` : `ab ~${uhrzeit(s.naechste)}`;
  else {
    const seit = Math.floor((jetzt - s.naechste) / 60000);
    wann = seit < 0 ? `fällig ~${uhrzeit(s.naechste)}` : seit < 5 ? 'jetzt fällig' : `fällig seit ${dauer(seit)}`;
  }
  return [zuletzt, wann].filter(Boolean).join(' · ');
}

function renderStand(jetzt) {
  const stand = anzahlStand(z, jetzt);
  const v = gabeVorschlag(stand);
  $('naechste').innerHTML = `
    <p class="naechste-label">Heute</p>
    ${stand.length ? `<ul class="stand-liste">${stand.map((s) => `<li class="stand ${s.status}">
      ${artIcon(s.m.art)}
      <span class="stand-text"><span class="stand-name">${esc(s.m.name)}</span>
        <span class="stand-punkte" aria-hidden="true">${Array.from({ length: s.soll }, (_, i) => `<i${i < s.ist ? ' class="voll"' : ''}></i>`).join('')}</span>
        <span class="stand-info">${standInfo(s, jetzt)}</span></span>
      <span class="stand-zahl" aria-label="${s.ist} von ${s.soll}">${s.ist}<small>/${s.soll}</small></span>
    </li>`).join('')}</ul>` : '<p class="notiz">Im Plan steht bei keinem Mittel, wie oft am Tag.</p>'}`;
  const text = v.ids.length ? mittelText(z.plan, v.ids) + (v.frueh ? ` · erst ~${uhrzeit(v.um)}` : '') : 'Für heute alles erledigt';
  $('haupt-runde').textContent = text;
  $('haupt').querySelector('.haupt-label').textContent = v.ids.length ? 'Jetzt getropft' : 'Trotzdem tropfen …';
  $('haupt').classList.toggle('ruhig', !v.ids.length || v.frueh);
  $('haupt').setAttribute('aria-label', v.ids.length ? `Jetzt getropft: ${text}` : 'Tropfen eintragen');
}

function renderOffen(jetzt) {
  const punkte = offenePunkte(z, jetzt);
  $('offen').hidden = !punkte.length;
  if (!punkte.length) { $('offen').innerHTML = ''; return; }
  $('offen').innerHTML = `
    <h2 class="ueberschrift">Offen</h2>
    <ul class="offen-liste">${punkte.map((p) => {
      if (p.art === 'unklar') {
        return `<li><button class="offen-haupt" data-aktion="luecken">${glyph('unklar')}
          <span class="offen-text"><span>${rundenName(p.runde)}</span><span>Eintrag fehlt</span></span>
          <span class="offen-aktion">Beantworten</span></button></li>`;
      }
      const m = mittelNach(z.plan, p.id);
      return `<li><button class="offen-haupt" data-aktion="nachgeholt" data-k="${p.k}" data-id="${esc(p.id)}">${artIcon(m.art)}
          <span class="offen-text"><span>${esc(kurzName(p.id))}</span><span>${rundenName(p.runde)}</span></span>
          <span class="offen-aktion">Nachgeholt</span></button>
        <button class="offen-neben" data-aktion="entfaellt" data-k="${p.k}" data-id="${esc(p.id)}">Entfällt</button></li>`;
    }).join('')}</ul>`;
}

function ueblichHtml(u) {
  if (!u) return `<span class="ereignis-ueblich">${ueblichText(u)}</span>`;
  const [haupt, spanne] = ueblichText(u).split(' (');
  return `<span class="ereignis-ueblich">${haupt}</span>${spanne ? `<span class="ereignis-ueblich">${spanne.slice(0, -1)}</span>` : ''}`;
}

function renderEreignisse(jetzt) {
  $('ereignisse').innerHTML = EREIGNIS_TYPEN.map((t) => {
    const heute = ereignisseAm(z.ereignisse, t.id, jetzt);
    const zuletzt = heute[heute.length - 1];
    const mitNotiz = heute.some((e) => e.notiz) ? ' · Notiz' : '';
    return `<button class="ereignis${zuletzt ? ' erfasst' : ''}" data-aktion="ereignis" data-typ="${t.id}">
      <span class="ereignis-name">${t.name}</span>
      ${zuletzt ? `<span class="ereignis-heute">heute ${uhrzeit(new Date(zuletzt.zeit))}${mitNotiz}</span>` : ''}
      ${ueblichHtml(ueblicheZeit(z.ereignisse, t.id))}
    </button>`;
  }).join('');
}

function renderZeitleiste(jetzt) {
  const tag = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + tagVersatz);
  $('tag-titel').textContent = tagVersatz === 0 ? 'Heute' : tagVersatz === -1 ? 'Gestern'
    : tag.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
  document.querySelector('[data-aktion="tag"][data-wert="1"]').disabled = tagVersatz >= 0;
  const aktuell = schluessel(jetzt);
  const runden = anzahlModus() ? gabenZeilen(tag, jetzt) : tagesZeitleiste(z, tag, jetzt, UEBERFAELLIG_NACH).map((zeile) => {
    const k = schluessel(zeile.runde);
    const e = zeile.eintrag;
    const zeit = e && e.zeit ? uhrzeit(new Date(e.zeit)) : '';
    const status = statusText(zeile.status) + (zeit ? ` · ${zeit}` : '');
    const detail = rundenDetail(z.plan, zeile);
    return { t: zeile.runde.getTime(), html: `<li><button class="zeile ${zeile.status}${k === aktuell ? ' jetzt' : ''}" data-aktion="runde" data-k="${k}">
      <span class="zeile-stunde">${zeile.runde.getHours()}</span>${glyph(zeile.status)}
      <span class="zeile-text"><span class="zeile-status">${status}</span>${detail ? `<span class="zeile-detail">${esc(detail)}</span>` : ''}</span>
    </button></li>` };
  });
  // Tropfen außer der Reihe stehen zeitlich zwischen den Runden
  const extra = extraAm(z.extra, tag).map((e) => {
    const d = new Date(e.zeit);
    const detail = extraMittelText(z.plan, e) + (e.notiz ? ` · ${e.notiz}` : '');
    return { t: d.getTime(), html: `<li><button class="zeile extra" data-aktion="extra" data-zeit="${e.zeit}">
      <span class="zeile-stunde">${uhrzeit(d)}</span>${glyph('extra')}
      <span class="zeile-text"><span class="zeile-status">außer der Reihe</span><span class="zeile-detail">${esc(detail)}</span></span>
    </button></li>` };
  });
  const alle = [...runden, ...extra].sort((a, b) => a.t - b.t);
  $('zeitleiste').innerHTML = alle.length ? alle.map((x) => x.html).join('') : '<li class="leer-zeile">Keine Einträge an diesem Tag.</li>';
}

/** Zeitleiste im Modus „Nach Anzahl“: eingetragene Gaben, heute dazu, was als Nächstes dran ist. */
function gabenZeilen(tag, jetzt) {
  const zeilen = gabenAm(z.gaben, tag).map((g) => {
    const d = new Date(g.zeit);
    const detail = mittelText(z.plan, g.mittel) + (g.notiz ? ` · ${g.notiz}` : '');
    return { t: d.getTime(), html: `<li><button class="zeile erledigt uhr" data-aktion="gabe" data-zeit="${g.zeit}">
      <span class="zeile-stunde">${uhrzeit(d)}</span>${glyph('erledigt')}
      <span class="zeile-text"><span class="zeile-status">getropft</span><span class="zeile-detail">${esc(detail)}</span></span>
    </button></li>` };
  });
  if (tagesSchluessel(tag) !== tagesSchluessel(jetzt)) return zeilen;
  const v = gabeVorschlag(anzahlStand(z, jetzt));
  if (v.ids.length) {
    const t = v.frueh ? v.um.getTime() : jetzt.getTime() + 1;
    zeilen.push({ t, html: `<li><button class="zeile ${v.frueh ? 'kommt' : 'faellig jetzt'} uhr" data-aktion="gabe-neu" data-ids="${esc(v.ids.join(' '))}">
      <span class="zeile-stunde">${v.frueh ? `~${uhrzeit(v.um)}` : 'jetzt'}</span>${glyph(v.frueh ? 'kommt' : 'faellig')}
      <span class="zeile-text"><span class="zeile-status">${v.frueh ? 'als Nächstes' : 'fällig'}</span><span class="zeile-detail">${esc(mittelText(z.plan, v.ids))}</span></span>
    </button></li>` });
  }
  return zeilen;
}

// ---------- Sheets ----------

let sheetAktionen = {};
let sheetBeiSchliessen = null;

function sheetOeffnen(titel, inhalt, aktionen = {}, beiSchliessen = null) {
  sheetAktionen = aktionen;
  sheetBeiSchliessen = beiSchliessen;
  $('sheet').innerHTML = `<div class="sheet-griff"></div>
    <div class="sheet-kopf"><h2 id="sheet-titel" tabindex="-1">${titel}</h2>
    <button class="schliessen" data-aktion="schliessen">Schließen</button></div>${inhalt}`;
  $('sheet').hidden = false;
  $('schleier').hidden = false;
  document.documentElement.classList.add('gesperrt');
  $('sheet').scrollTop = 0;
  $('sheet-titel').focus({ preventScroll: true });
}

function sheetSchliessen() {
  // Tastatur zuerst schließen, damit iOS das Layout danach sauber neu berechnet
  const fokus = document.activeElement;
  if (fokus && $('sheet').contains(fokus)) fokus.blur();
  $('sheet').hidden = true;
  $('schleier').hidden = true;
  document.documentElement.classList.remove('gesperrt');
  const nach = sheetBeiSchliessen;
  sheetAktionen = {};
  sheetBeiSchliessen = null;
  if (nach) nach();
  layoutAuffrischen();
}

// iOS lässt fixierte Elemente (die Leiste unten) nach dem Schließen der Tastatur manchmal
// um die Tastaturhöhe nach oben verschoben stehen, bis man scrollt. Ein Mini-Scroll und
// ein kurz gesetzter Transform erzwingen das Neuberechnen; sonst ist das unsichtbar.
function layoutAuffrischen() {
  for (const ms of [0, 150, 450]) {
    setTimeout(() => {
      const y = window.scrollY;
      window.scrollTo(0, y > 0 ? y - 1 : y + 1);
      window.scrollTo(0, y);
      const leiste = $('leiste');
      leiste.style.transform = 'translateZ(0)';
      setTimeout(() => { leiste.style.transform = ''; }, 60);
    }, ms);
  }
}

function bestaetigen({ titel, text = '', ja, nein = 'Abbrechen', gefahr = false }, aktion) {
  sheetOeffnen(esc(titel), `${text ? `<p>${text}</p>` : ''}
    <div class="knoepfe">
      <button class="knopf ${gefahr ? 'gefahr' : 'primaer'}" data-aktion="ja">${esc(ja)}</button>
      <button class="knopf" data-aktion="schliessen">${esc(nein)}</button>
    </div>`, { ja: () => { sheetSchliessen(); aktion(); } });
}

function schalterListe(eintraege) {
  return `<ul class="schalter-liste">${eintraege.map((s) => `<li>
    <button class="schalter" role="switch" aria-checked="${s.an}" data-aktion="schalter" data-id="${esc(s.id)}">
      <span class="kasten">${hakenIcon}</span>${artIcon(s.art)}<span class="schalter-name">${esc(s.name)}</span>
      ${s.zusatz ? `<span class="schalter-zusatz">${esc(s.zusatz)}</span>` : ''}
    </button></li>`).join('')}</ul>`;
}

function schalterUmlegen(el) {
  const an = el.getAttribute('aria-checked') !== 'true';
  el.setAttribute('aria-checked', String(an));
  return an;
}

// ---------- Erfassen ----------

function erfassenStart(fehlend = []) {
  const jetzt = new Date();
  const r = zuordnen(jetzt, letzteRunde(z.runden), toleranzen(), rundenStunden(z.plan));
  if (r.art === 'frueh') {
    const min = r.minutenBisFaellig;
    bestaetigen({
      titel: 'Trotzdem eintragen?',
      text: `Die ${r.runde.getHours()}-Uhr-Runde ist erst in ${min < 60 ? `${min} Minuten` : dauer(min)} fällig.`,
      ja: 'Trotzdem eintragen'
    }, () => erfassen(r, jetzt, fehlend));
    return;
  }
  erfassen(r, jetzt, fehlend);
}

function erfassen(r, jetzt, fehlend) {
  merken();
  for (const luecke of r.luecken) z.runden[schluessel(luecke)] = rundeUnklar(z.plan, luecke);
  const eintrag = rundeErfassen(z.plan, r.runde, jetzt, fehlend);
  z.runden[schluessel(r.runde)] = eintrag;
  speichern();
  render();
  const fehlt = Object.entries(eintrag.mittel).filter(([, s]) => s === 'nein').map(([id]) => kurzName(id));
  const zusatz = rundenStatus(eintrag) === 'ausgefallen' ? 'nicht bekommen' : fehlt.length ? `${fehlt.join(', ')} fehlt` : 'eingetragen';
  toast(`${rundenName(r.runde)} ${zusatz} · ${uhrzeit(jetzt)}`);
  if (r.luecken.length) lueckenSheet();
}

function nichtAllesSheet() {
  const r = zuordnen(new Date(), letzteRunde(z.runden), toleranzen(), rundenStunden(z.plan));
  const mittel = faelligeMittel(z.plan, r.runde.getHours());
  sheetOeffnen(`${rundenName(r.runde)}`, `
    <p class="leise">Tippe weg, was gefehlt hat.</p>
    ${schalterListe(mittel.map((m) => ({ id: m.id, name: m.name, art: m.art, an: true })))}
    <div class="knoepfe"><button class="knopf primaer" data-aktion="speichern">Speichern</button></div>`, {
    schalter: schalterUmlegen,
    speichern: () => {
      const fehlend = [...$('sheet').querySelectorAll('.schalter[aria-checked="false"]')].map((el) => el.dataset.id);
      sheetSchliessen();
      erfassenStart(fehlend);
    }
  });
}

function lueckenSheet() {
  const offen = Object.keys(z.runden).filter((k) => z.runden[k].unklar).sort();
  if (!offen.length) return;
  const antworten = {};
  const zeichnen = () => offen.map((k) => {
    const runde = ausSchluessel(k);
    const a = antworten[k];
    return `<div class="luecke"><h3>${rundenName(runde)}</h3>
      ${a ? `<p class="luecke-ergebnis">${a === 'ja' ? 'Bekommen, Uhrzeit unbekannt' : 'Nicht bekommen'}</p>`
        : `<div class="knoepfe">
          <button class="knopf" data-aktion="ja" data-k="${k}">Bekommen, vergessen einzutragen</button>
          <button class="knopf" data-aktion="nein" data-k="${k}">Nicht bekommen</button></div>`}
    </div>`;
  }).join('');
  const antworten_ = (wert) => (el) => {
    const k = el.dataset.k;
    const runde = ausSchluessel(k);
    if (wert === 'ja') {
      const e = { ...z.runden[k] };
      delete e.unklar;
      z.runden[k] = e;
    } else {
      z.runden[k] = rundeAusgefallen(z.plan, runde);
    }
    antworten[k] = wert;
    speichern();
    render();
    if (offen.every((x) => antworten[x])) { sheetSchliessen(); toast('Lücken eingetragen', false); }
    else $('luecken-inhalt').innerHTML = zeichnen();
  };
  sheetOeffnen(offen.length === 1 ? 'Eine Runde ohne Eintrag' : `${offen.length} Runden ohne Eintrag`,
    `<p class="leise">Hast du diese Tropfen bekommen?</p><div id="luecken-inhalt">${zeichnen()}</div>`,
    { ja: antworten_('ja'), nein: antworten_('nein') });
}

function offenMarkieren(el, wert) {
  const { k, id } = el.dataset;
  const e = z.runden[k];
  if (!e) return;
  merken();
  e.mittel[id] = wert;
  if (wert === 'nachgeholt') e.nachgeholt = { ...(e.nachgeholt || {}), [id]: new Date().toISOString() };
  speichern();
  render();
  toast(`${kurzName(id)} (${rundenName(ausSchluessel(k))}) ${wert === 'nachgeholt' ? `nachgeholt · ${uhrzeit(new Date())}` : 'entfällt'}`);
}

// ---------- Außer der Reihe ----------

/** Uhrzeit aus dem Feld am Tag `bezug`; liegt sie bei einem neuen Eintrag in der Zukunft, war es gestern. */
function extraZeit(bezug, wert, neu) {
  if (!wert) return null;
  const [h, m] = wert.split(':').map(Number);
  const d = new Date(bezug.getFullYear(), bezug.getMonth(), bezug.getDate(), h, m);
  if (neu && d - new Date() > 5 * 60000) d.setDate(d.getDate() - 1);
  return d;
}

function extraSheet(zeitAlt) {
  const alt = zeitAlt ? z.extra.find((e) => e.zeit === zeitAlt) : null;
  if (zeitAlt && !alt) return;
  const gewaehlt = new Set(alt ? alt.mittel : []);
  const bezug = alt ? new Date(alt.zeit) : new Date();
  sheetOeffnen(alt ? 'Außer der Reihe' : 'Extra getropft', `
    <p class="leise">Für Tropfen außerhalb des Plans, z. B. wenn einer gleich wieder ausgelaufen ist. ${anzahlModus() ? 'Zählt nicht zur Anzahl am Tag.' : 'Zählt nicht als Runde.'}</p>
    ${schalterListe(z.plan.mittel.map((m) => ({ id: m.id, name: m.name, art: m.art, an: gewaehlt.has(m.id) }))).replace("schalter-liste", "schalter-liste auswahl")}
    <div class="feld"><label for="x-anderes">Anderes Mittel</label>
      <input id="x-anderes" type="text" autocapitalize="sentences" placeholder="optional" value="${esc(alt && alt.anderes || '')}"></div>
    <div class="feld"><label for="x-zeit">Uhrzeit</label><input id="x-zeit" type="time" value="${feldZeit(bezug.toISOString())}"></div>
    <div class="visite-notiz-feld"><label for="x-notiz">Grund (optional)</label>
      <textarea id="x-notiz" rows="2" autocapitalize="sentences" placeholder="z. B. sofort ausgelaufen">${esc(alt && alt.notiz || '')}</textarea></div>
    <p class="leise" id="x-hinweis" hidden>Bitte mindestens ein Mittel wählen oder eintragen.</p>
    <div class="knoepfe"><button class="knopf primaer" data-aktion="speichern">${alt ? 'Speichern' : 'Eintragen'}</button></div>
    ${alt ? '<div class="knoepfe abstand-gross"><button class="knopf gefahr" data-aktion="loeschen">Eintrag löschen</button></div>' : ''}`, {
    schalter: (el) => { if (schalterUmlegen(el)) gewaehlt.add(el.dataset.id); else gewaehlt.delete(el.dataset.id); },
    speichern: () => {
      const zeit = extraZeit(bezug, $('x-zeit').value, !alt) || bezug;
      const plan = new Set(z.plan.mittel.map((m) => m.id));
      // Mittel aus einem früheren Plan bleiben beim Bearbeiten erhalten
      const reihenfolge = z.plan.mittel.map((m) => m.id);
      const ids = [...gewaehlt].filter((id) => plan.has(id) || (alt && alt.mittel.includes(id)))
        .sort((a, b) => (reihenfolge.indexOf(a) + 1 || 99) - (reihenfolge.indexOf(b) + 1 || 99));
      const e = extraErfassen(zeit, ids, $('x-anderes').value, $('x-notiz').value);
      if (!e) { $('x-hinweis').hidden = false; return; }
      merken();
      if (alt) z.extra = z.extra.filter((x) => x !== alt);
      z.extra.push(e);
      speichern(); sheetSchliessen(); render();
      toast(`${extraMittelText(z.plan, e)} außer der Reihe · ${uhrzeit(zeit)}`);
    },
    loeschen: () => {
      merken();
      z.extra = z.extra.filter((x) => x !== alt);
      speichern(); sheetSchliessen(); render();
      toast('Eintrag gelöscht');
    }
  });
}

// ---------- Nach Anzahl: Gaben ----------

function gabeSpeichern(zeit, ids, notiz = '', alt = null) {
  const g = gabeErfassen(zeit, ids, notiz);
  if (!g) return false;
  merken();
  if (alt) z.gaben = z.gaben.filter((x) => x !== alt);
  z.gaben.push(g);
  speichern(); render();
  toast(`${mittelText(z.plan, g.mittel)} · ${uhrzeit(zeit)}`);
  return true;
}

/** Hauptknopf: das Vorgeschlagene mit der Uhrzeit von jetzt eintragen. */
function gabeJetzt() {
  const v = gabeVorschlag(anzahlStand(z, new Date()));
  if (!v.ids.length) { gabeSheet(null, []); return; }
  if (!v.frueh) { gabeSpeichern(new Date(), v.ids); return; }
  bestaetigen({
    titel: 'Trotzdem jetzt eintragen?',
    text: `${esc(mittelText(z.plan, v.ids))} ${v.ids.length > 1 ? 'sind' : 'ist'} erst gegen ${uhrzeit(v.um)} dran. Für eine andere Auswahl „Auswahl …“ nehmen.`,
    ja: 'Trotzdem eintragen'
  }, () => gabeSpeichern(new Date(), v.ids));
}

function gabeSheet(zeitAlt, vorauswahl = []) {
  const alt = zeitAlt ? z.gaben.find((g) => g.zeit === zeitAlt) : null;
  if (zeitAlt && !alt) return;
  const gewaehlt = new Set(alt ? alt.mittel : vorauswahl);
  const bezug = alt ? new Date(alt.zeit) : new Date();
  const stand = Object.fromEntries(anzahlStand(z, new Date()).map((s) => [s.m.id, s]));
  const liste = z.plan.mittel.filter((m) => proTag(m) > 0 || gewaehlt.has(m.id));
  // Mittel aus einem früheren Plan, die in der Gabe stehen, bleiben sichtbar
  for (const id of gewaehlt) if (!liste.some((m) => m.id === id)) liste.push(mittelNach(z.plan, id));
  sheetOeffnen(alt ? 'Gabe' : 'Getropft', `
    <p class="leise">${alt ? bezug.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Was hast du getropft?'}</p>
    ${schalterListe(liste.map((m) => ({
      id: m.id, name: m.name, art: m.art, an: gewaehlt.has(m.id),
      zusatz: !alt && stand[m.id] ? `${stand[m.id].ist}/${stand[m.id].soll}` : ''
    }))).replace('schalter-liste', 'schalter-liste auswahl')}
    <div class="feld"><label for="g-zeit">Uhrzeit</label><input id="g-zeit" type="time" value="${feldZeit(bezug.toISOString())}"></div>
    <div class="visite-notiz-feld"><label for="g-notiz">Notiz (optional)</label>
      <textarea id="g-notiz" rows="2" autocapitalize="sentences">${esc(alt && alt.notiz || '')}</textarea></div>
    <p class="leise" id="g-hinweis" hidden>Bitte mindestens ein Mittel wählen.</p>
    <div class="knoepfe"><button class="knopf primaer" data-aktion="speichern">${alt ? 'Speichern' : 'Eintragen'}</button></div>
    ${alt ? '<div class="knoepfe abstand-gross"><button class="knopf gefahr" data-aktion="loeschen">Eintrag löschen</button></div>' : ''}`, {
    schalter: (el) => { if (schalterUmlegen(el)) gewaehlt.add(el.dataset.id); else gewaehlt.delete(el.dataset.id); },
    speichern: () => {
      const zeit = extraZeit(bezug, $('g-zeit').value, !alt) || bezug;
      const ids = liste.map((m) => m.id).filter((id) => gewaehlt.has(id));
      if (!ids.length) { $('g-hinweis').hidden = false; return; }
      sheetSchliessen();
      gabeSpeichern(zeit, ids, $('g-notiz').value, alt);
    },
    loeschen: () => {
      merken();
      z.gaben = z.gaben.filter((x) => x !== alt);
      speichern(); sheetSchliessen(); render();
      toast('Eintrag gelöscht');
    }
  });
}

// ---------- Runde korrigieren ----------

function korrekturSheet(k) {
  const runde = ausSchluessel(k);
  const e = z.runden[k];
  const ids = e ? Object.keys(e.mittel) : faelligeMittel(z.plan, runde.getHours()).map((m) => m.id);
  const werte = Object.fromEntries(ids.map((id) => [id, e ? e.mittel[id] : 'ja']));
  const zusatz = (id) => {
    if (werte[id] === 'nachgeholt' && e && e.nachgeholt && e.nachgeholt[id]) return `nachgeholt ${uhrzeit(new Date(e.nachgeholt[id]))}`;
    if (werte[id] === 'entfaellt') return 'entfällt';
    return '';
  };
  const status = e ? statusText(rundenStatus(e)) : 'noch kein Eintrag';
  sheetOeffnen(rundenName(runde), `
    <p class="leise">${runde.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} · ${esc(status)}</p>
    ${schalterListe(ids.map((id) => {
      const m = mittelNach(z.plan, id);
      return { id, name: m.name, art: m.art, an: werte[id] === 'ja' || werte[id] === 'nachgeholt', zusatz: zusatz(id) };
    }))}
    <div class="feld"><label for="k-zeit">Uhrzeit</label><input id="k-zeit" type="time" value="${feldZeit(e && e.zeit)}"></div>
    <p class="leise">Leer lassen, wenn die Uhrzeit unbekannt ist.</p>
    <div class="knoepfe">
      <button class="knopf primaer" data-aktion="speichern">Speichern</button>
      <button class="knopf" data-aktion="ausgefallen">Nicht bekommen</button>
    </div>
    ${e ? '<div class="knoepfe abstand-gross"><button class="knopf gefahr" data-aktion="loeschen">Eintrag löschen</button></div>' : ''}`, {
    schalter: (el) => {
      const an = schalterUmlegen(el);
      const id = el.dataset.id;
      werte[id] = an ? (e && e.mittel[id] === 'nachgeholt' ? 'nachgeholt' : 'ja') : 'nein';
    },
    speichern: () => {
      merken();
      const zeit = zeitAusFeld(runde, $('k-zeit').value);
      const neu = { zeit: zeit ? zeit.toISOString() : null, mittel: { ...werte } };
      const nach = Object.fromEntries(Object.entries((e && e.nachgeholt) || {}).filter(([id]) => werte[id] === 'nachgeholt'));
      if (Object.keys(nach).length) neu.nachgeholt = nach;
      if (Object.values(werte).every((s) => s === 'nein' || s === 'entfaellt')) neu.ausgefallen = true;
      z.runden[k] = neu;
      speichern(); sheetSchliessen(); render();
      toast(`${rundenName(runde)} gespeichert`);
    },
    ausgefallen: () => {
      merken();
      z.runden[k] = rundeAusgefallen(z.plan, runde);
      speichern(); sheetSchliessen(); render();
      toast(`${rundenName(runde)}: nicht bekommen`);
    },
    loeschen: () => {
      merken();
      delete z.runden[k];
      speichern(); sheetSchliessen(); render();
      toast(`${rundenName(runde)} gelöscht`);
    }
  });
}

// ---------- Essen und Visite ----------

// Notizfeld zur Visite; gespeichert wird bei jeder Eingabe, damit beim Schließen nichts verloren geht
function notizFeld(e, i = 0) {
  return `<div class="visite-notiz-feld"><label for="n-${i}">Was wurde besprochen?</label>
    <textarea id="n-${i}" rows="5" data-zeit="${e.zeit}" autocapitalize="sentences">${esc(e.notiz || '')}</textarea></div>`;
}

function notizenVerbinden() {
  for (const feld of $('sheet').querySelectorAll('textarea[data-zeit]')) {
    feld.addEventListener('input', () => {
      if (notizSetzen(z.ereignisse, 'visite', feld.dataset.zeit, feld.value)) speichern();
    });
  }
}

function notizSheet(e, beiSchliessen = null, neu = false) {
  const d = new Date(e.zeit);
  const tag = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  sheetOeffnen(`Visite · ${uhrzeit(d)}`, `
    <p class="leise">${neu ? 'Eingetragen. Notiz nur, wenn du magst' : tag}. Wird beim Schreiben gespeichert.</p>
    ${notizFeld(e)}
    <div class="knoepfe"><button class="knopf primaer" data-aktion="fertig">Fertig</button></div>`, {
    fertig: () => { sheetSchliessen(); render(); }
  }, () => { render(); if (beiSchliessen) beiSchliessen(); });
  notizenVerbinden();
}

function ereignisTippen(typ) {
  const t = EREIGNIS_TYPEN.find((x) => x.id === typ);
  const heute = ereignisseAm(z.ereignisse, typ, new Date());
  const neu = () => {
    merken();
    const jetzt = new Date();
    const eintrag = { typ, zeit: jetzt.toISOString() };
    z.ereignisse.push(eintrag);
    speichern(); render();
    toast(`${t.name} · ${uhrzeit(jetzt)}`);
    if (typ === 'visite') notizSheet(eintrag, null, true);
  };
  if (!heute.length) { neu(); return; }

  const istVisite = typ === 'visite';
  sheetOeffnen(t.name, `
    <p class="leise">Heute erfasst. ${istVisite ? 'Uhrzeit ändern, löschen oder Notiz ergänzen:' : 'Uhrzeit ändern oder löschen:'}</p>
    ${heute.map((e, i) => `<div class="feld"><label for="e-${i}">Um</label>
      <input id="e-${i}" type="time" value="${feldZeit(e.zeit)}" data-zeit="${e.zeit}">
      <button class="knopf gefahr" data-aktion="loeschen" data-zeit="${e.zeit}">Löschen</button></div>
      ${istVisite ? notizFeld(e, i) : ''}`).join('')}
    <div class="knoepfe">
      <button class="knopf primaer" data-aktion="fertig">Fertig</button>
      <button class="knopf" data-aktion="nochmal">Noch einmal erfassen (jetzt)</button>
    </div>`, {
    loeschen: (el) => {
      merken();
      z.ereignisse = z.ereignisse.filter((e) => !(e.typ === typ && e.zeit === el.dataset.zeit));
      speichern(); sheetSchliessen(); render();
      toast(`${t.name} gelöscht`);
    },
    fertig: () => {
      merken();
      for (const input of $('sheet').querySelectorAll('input[type="time"]')) {
        const alt = input.dataset.zeit;
        if (!input.value || input.value === feldZeit(alt)) continue;
        const neueZeit = zeitAusFeld(new Date(alt), input.value);
        const e = z.ereignisse.find((x) => x.typ === typ && x.zeit === alt);
        if (e && neueZeit) e.zeit = neueZeit.toISOString();
      }
      speichern(); sheetSchliessen(); render();
    },
    nochmal: () => { sheetSchliessen(); neu(); }
  }, render);
  if (istVisite) notizenVerbinden();
}

// ---------- Einstellungen ----------

function stundenText(stunden) {
  if (stunden.length === 24) return 'jede volle Stunde';
  return `${stunden.join(', ').replace(/, (\d+)$/, ' und $1')} Uhr`;
}

function backupText() {
  if (!z.letztesBackup) return 'Noch kein Backup exportiert.';
  const tage = Math.floor((new Date() - new Date(z.letztesBackup)) / 864e5);
  return `Letztes Backup: ${tage === 0 ? 'heute' : tage === 1 ? 'gestern' : `vor ${tage} Tagen`}.`;
}

function einstellungenSheet() {
  const e = z.einstellungen;
  const stundenOptionen = (wert) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === Number(wert) ? ' selected' : ''}>${h} Uhr</option>`).join('');
  const modi = [['immer', 'Dunkel'], ['auto', 'Automatisch'], ['nie', 'Hell']];
  const anzahl = anzahlModus();
  const planZusatz = (m) => anzahl
    ? (proTag(m) > 0 ? `${proTag(m)}× täglich` : 'wird nicht gezählt')
    : `${stundenText(m.stunden)}${m.nachholbar === false ? '' : ' · nachholbar'}`;
  sheetOeffnen('Einstellungen', `
    <h3>Tropfen</h3>
    <div class="segment zwei" role="group" aria-label="Wie getropft wird">
      ${[['zeiten', 'Feste Uhrzeiten'], ['anzahl', 'Nach Anzahl']].map(([w, l]) => `<button data-aktion="tropfmodus" data-wert="${w}" aria-pressed="${(e.modus || 'zeiten') === w}">${l}</button>`).join('')}
    </div>
    <p class="leise">${anzahl
      ? 'Keine festen Runden: Du trägst ein, wann du was getropft hast. Die App zählt mit und schlägt vor, wann es gleichmäßig verteilt als Nächstes dran ist. Essen und Visite sind dabei ausgeblendet.'
      : 'Runden zu festen Uhrzeiten laut Plan. Ein Tipp trägt die ganze Runde ein.'}</p>

    <h3>Plan</h3>
    ${z.plan.beispiel ? '<p class="leise">Das ist ein Beispielplan.</p>' : ''}
    <ul class="plan-liste">${z.plan.mittel.map((m) => `<li>${artIcon(m.art)}<span>${esc(m.name)}<small>${planZusatz(m)}</small></span></li>`).join('')}</ul>
    <div class="knoepfe"><button class="knopf" data-aktion="importieren">Plan importieren</button></div>

    <h3>Darstellung</h3>
    <div class="segment" role="group" aria-label="Dunkle Darstellung">
      ${modi.map(([w, l]) => `<button data-aktion="modus" data-wert="${w}" aria-pressed="${e.dunkel === w}">${l}</button>`).join('')}
    </div>
    <p class="leise">Automatisch: dunkel von 21 bis 7 Uhr und wenn das iPhone dunkel eingestellt ist.</p>

    ${anzahl ? `
    <h3>Verteilung über den Tag</h3>
    <div class="feld"><label for="s-tag-von">Erste Gabe ab</label><select id="s-tag-von">${stundenOptionen(e.tagVon)}</select></div>
    <div class="feld"><label for="s-tag-bis">Letzte Gabe bis</label><select id="s-tag-bis">${stundenOptionen(e.tagBis)}</select></div>
    <p class="leise">Danach richtet sich der Vorschlag für die nächste Gabe: höchstens 24 Stunden geteilt durch die Anzahl, aber so, dass der Rest bis zur letzten Gabe passt.</p>
    ` : `
    <h3>Zuordnung</h3>
    <div class="feld"><label for="s-frueh">Bis so viele Minuten vor der Runde zählt ein Tipp noch dazu</label>
      <input id="s-frueh" type="number" inputmode="numeric" min="0" max="59" value="${e.frueh}"></div>
    <div class="feld"><label for="s-spaet">Bis so viele Minuten nach der Runde zählt ein Tipp noch dazu</label>
      <input id="s-spaet" type="number" inputmode="numeric" min="0" max="59" value="${e.spaet}"></div>

    <h3>Erinnerungen im Kalender</h3>
    <div class="feld"><label for="s-von">Von</label><select id="s-von">${stundenOptionen(e.erinnerungVon)}</select></div>
    <div class="feld"><label for="s-bis">Bis einschließlich</label><select id="s-bis">${stundenOptionen(e.erinnerungBis)}</select></div>
    <div class="knoepfe"><button class="knopf" data-aktion="ics">Erinnerungen in Kalender übernehmen</button></div>
    <p class="leise">Erzeugt zu jeder Runde laut Plan einen täglichen 5-Minuten-Termin „Augentropfen“ mit Hinweis.
      Im Teilen-Menü „Kalender“ wählen oder „In Dateien sichern“ und die Datei dort antippen, dann „Alle hinzufügen“.
      Tipp: in einen eigenen Kalender „Tropfen“ übernehmen. Zum Entfernen löschst du später einfach diesen Kalender.</p>
    `}

    <h3>Daten</h3>
    <p class="leise">${backupText()}</p>
    <div class="knoepfe">
      <button class="knopf" data-aktion="export">Backup exportieren</button>
      <button class="knopf" data-aktion="importieren">Backup importieren</button>
      <button class="knopf" data-aktion="uebersicht">Tagesübersicht als Text</button>
    </div>
    <div class="knoepfe abstand-gross"><button class="knopf gefahr" data-aktion="alles-loeschen">Alle Daten löschen</button></div>
    <p class="leise abstand-gross">Version ${APP_VERSION}. Alle Daten bleiben auf diesem Gerät.</p>`, {
    modus: (el) => {
      z.einstellungen.dunkel = el.dataset.wert;
      speichern(); render();
      for (const b of $('sheet').querySelectorAll('[data-aktion="modus"]')) b.setAttribute('aria-pressed', String(b === el));
    },
    tropfmodus: (el) => {
      if (z.einstellungen.modus === el.dataset.wert) return;
      merken();
      z.einstellungen.modus = el.dataset.wert;
      speichern(); render();
      einstellungenSheet();
      toast(el.dataset.wert === 'anzahl' ? 'Nach Anzahl tropfen' : 'Feste Uhrzeiten');
    },
    importieren: () => $('datei').click(),
    ics: async () => {
      const von = Number(z.einstellungen.erinnerungVon);
      const bis = Number(z.einstellungen.erinnerungBis);
      if (bis < von) { toast('„Bis“ muss nach „Von“ liegen.', false); return; }
      await dateiAusgeben('tropfen-erinnerungen.ics', icsErzeugen(von, bis, new Date(), 'tropfen', rundenStunden(z.plan)), 'text/calendar');
    },
    export: async () => {
      const ok = await dateiAusgeben(`tropfen-backup-${tagesSchluessel(new Date())}.json`, exportErzeugen(z), 'application/json');
      if (ok) { z.letztesBackup = new Date().toISOString(); speichern(); }
    },
    uebersicht: () => uebersichtSheet(),
    'alles-loeschen': () => bestaetigen({
      titel: 'Alle Daten löschen?',
      text: 'Alle Runden, Essen, Visiten, Einstellungen und der Plan werden von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen. Exportiere vorher ein Backup, wenn du die Daten noch brauchst.',
      ja: 'Alles löschen', gefahr: true
    }, () => { z = leererZustand(); speichern(); render(); toast('Alle Daten gelöscht', false); })
  });

  const zahl = (id, feld) => $(id).addEventListener('change', (ev) => {
    const n = Math.max(0, Math.min(59, Math.round(Number(ev.target.value))));
    if (Number.isFinite(n)) { z.einstellungen[feld] = n; ev.target.value = n; speichern(); render(); }
  });
  if (anzahl) {
    for (const [id, feld] of [['s-tag-von', 'tagVon'], ['s-tag-bis', 'tagBis']]) {
      $(id).addEventListener('change', (ev) => { z.einstellungen[feld] = Number(ev.target.value); speichern(); render(); });
    }
    return;
  }
  zahl('s-frueh', 'frueh');
  zahl('s-spaet', 'spaet');
  for (const [id, feld] of [['s-von', 'erinnerungVon'], ['s-bis', 'erinnerungBis']]) {
    $(id).addEventListener('change', (ev) => { z.einstellungen[feld] = Number(ev.target.value); speichern(); });
  }
}

const KURZ_KOPF = { fruehstueck: 'Frühst.', mittag: 'Mittag', abend: 'Abend', visite: 'Visite' };

function verlaufSheet() {
  const verlauf = ereignisVerlauf(z.ereignisse, 14);
  if (!verlauf.length) {
    sheetOeffnen('Verlauf', '<p class="leise">Noch nichts erfasst. Tippe auf Frühstück, Mittagessen, Abendessen oder Visite, wenn es so weit ist.</p>');
    return;
  }
  const heute = tagesSchluessel(new Date());
  const gestern = tagesSchluessel(new Date(Date.now() - 864e5));
  const tagName = (d) => {
    const k = tagesSchluessel(d);
    if (k === heute) return 'Heute';
    if (k === gestern) return 'Gestern';
    return `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
  };
  const zelle = (zeiten) => zeiten.length
    ? zeiten.map((d) => `<span>${uhrzeit(d)}</span>`).join('')
    : '<span class="leer" aria-label="kein Eintrag">–</span>';
  const ueblich = EREIGNIS_TYPEN.map((t) => {
    const u = ueblicheZeit(z.ereignisse, t.id);
    return `<td>${u ? `<span>~${minutenAlsUhrzeit(u.median)}</span>` : '<span class="leer">–</span>'}</td>`;
  }).join('');
  const liste = visiten(z.ereignisse, verlauf[verlauf.length - 1].tag);
  const notizen = liste.length ? `
    <h3>Visite</h3>
    <ul class="visite-notizen">${liste.map((e) => {
      const d = new Date(e.zeit);
      return `<li><button data-aktion="notiz" data-zeit="${e.zeit}">
        <span class="vn-wann">${tagName(d)}, ${uhrzeit(d)}</span>
        ${e.notiz ? `<span class="vn-text">${esc(e.notiz)}</span>` : '<span class="vn-text leer">Keine Notiz. Antippen zum Schreiben.</span>'}
      </button></li>`;
    }).join('')}</ul>` : '';
  sheetOeffnen('Verlauf', `
    <p class="leise">Erfasste Uhrzeiten, neuester Tag oben. Bis zu 14 Tage.</p>
    <table class="verlauf">
      <thead><tr><th scope="col">Tag</th>${EREIGNIS_TYPEN.map((t) => `<th scope="col"><abbr title="${t.name}">${KURZ_KOPF[t.id]}</abbr></th>`).join('')}</tr></thead>
      <tbody>${verlauf.map((v) => `<tr><th scope="row">${tagName(v.tag)}</th>${EREIGNIS_TYPEN.map((t) => `<td>${zelle(v.typen[t.id] || [])}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">üblich</th>${ueblich}</tr></tfoot>
    </table>
    <p class="leise">„üblich“ ist der Median der letzten 5 Tage, jeweils der erste Eintrag des Tages.</p>
    ${notizen}`, {
    notiz: (el) => {
      const e = z.ereignisse.find((x) => x.typ === 'visite' && x.zeit === el.dataset.zeit);
      if (e) notizSheet(e, verlaufSheet);
    }
  });
}

function uebersichtSheet() {
  const jetzt = new Date();
  const tag = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + tagVersatz);
  const text = tagesText(z, tag, jetzt);
  sheetOeffnen('Tagesübersicht', `<pre class="uebersicht">${esc(text)}</pre>
    <div class="knoepfe"><button class="knopf primaer" data-aktion="kopieren">Kopieren</button></div>`, {
    kopieren: async () => {
      try { await navigator.clipboard.writeText(text); toast('Kopiert', false); }
      catch { toast('Kopieren ging nicht. Text gedrückt halten und markieren.', false); }
    }
  });
}

/** Teilen-Menü, wenn das Gerät Dateien teilen kann, sonst Download. */
async function dateiAusgeben(name, text, typ) {
  const datei = new File([text], name, { type: typ });
  if (navigator.canShare && navigator.canShare({ files: [datei] })) {
    try { await navigator.share({ files: [datei] }); return true; }
    catch (fehler) { if (fehler.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(datei);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

$('datei').addEventListener('change', async (ev) => {
  const datei = ev.target.files[0];
  ev.target.value = '';
  if (!datei) return;
  let ergebnis;
  try { ergebnis = importLesen(await datei.text()); }
  catch (fehler) { sheetSchliessen(); toast(fehler.message, false); return; }
  if (ergebnis.art === 'plan') {
    bestaetigen({
      titel: 'Plan übernehmen?',
      text: `${ergebnis.plan.mittel.map((m) => esc(m.name)).join(', ')}. Bisherige Einträge bleiben erhalten.`,
      ja: 'Plan übernehmen'
    }, () => { merken(); z.plan = ergebnis.plan; speichern(); render(); toast('Plan übernommen'); });
  } else {
    const n = Object.keys(ergebnis.zustand.runden).length;
    const g = ergebnis.zustand.gaben.length;
    bestaetigen({
      titel: 'Backup einspielen?',
      text: `Das Backup enthält ${n} Runden${g ? ` und ${g} Gaben` : ''}. Es ersetzt alle Daten auf diesem Gerät.`,
      ja: 'Backup einspielen'
    }, () => { merken(); z = ergebnis.zustand; speichern(); render(); toast('Backup eingespielt'); });
  }
});

// ---------- Ereignisse ----------

const aktionen = {
  alles: () => (anzahlModus() ? gabeJetzt() : erfassenStart([])),
  'nicht-alles': () => (anzahlModus() ? gabeSheet(null, gabeVorschlag(anzahlStand(z, new Date())).ids) : nichtAllesSheet()),
  gabe: (el) => gabeSheet(el.dataset.zeit),
  'gabe-neu': (el) => gabeSheet(null, el.dataset.ids.split(' ')),
  'extra-neu': () => extraSheet(null),
  extra: (el) => extraSheet(el.dataset.zeit),
  rueckgaengig,
  einstellungen: einstellungenSheet,
  luecken: lueckenSheet,
  nachgeholt: (el) => offenMarkieren(el, 'nachgeholt'),
  entfaellt: (el) => offenMarkieren(el, 'entfaellt'),
  ereignis: (el) => ereignisTippen(el.dataset.typ),
  verlauf: verlaufSheet,
  runde: (el) => korrekturSheet(el.dataset.k),
  tag: (el) => { tagVersatz = Math.min(0, tagVersatz + Number(el.dataset.wert)); render(); }
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-aktion]');
  if (!el || el.disabled) return;
  const name = el.dataset.aktion;
  if (name === 'schliessen') { sheetSchliessen(); return; }
  if ($('sheet').contains(el)) { if (sheetAktionen[name]) sheetAktionen[name](el); return; }
  if (aktionen[name]) aktionen[name](el);
});
$('schleier').addEventListener('click', sheetSchliessen);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('sheet').hidden) sheetSchliessen(); });

render();
setInterval(() => { if (!document.hidden) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); layoutAuffrischen(); } });
document.addEventListener('focusout', (ev) => {
  if (ev.target.matches && ev.target.matches('input, textarea, select')) layoutAuffrischen();
});
if (window.visualViewport) {
  let hoehe = visualViewport.height;
  visualViewport.addEventListener('resize', () => {
    if (visualViewport.height > hoehe + 100) layoutAuffrischen(); // Tastatur wurde geschlossen
    hoehe = visualViewport.height;
  });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themaAnwenden);

// ---------- Offline ----------

if ('serviceWorker' in navigator) {
  const geladenUm = Date.now();
  const hatteController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((f) => console.warn('Service Worker:', f));
  // Neue Version kurz nach dem Start sofort übernehmen, später nicht mitten in der Bedienung
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hatteController && Date.now() - geladenUm < 8000 && $('sheet').hidden) location.reload();
  });
}
