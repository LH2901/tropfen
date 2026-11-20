// Oberfläche. Alle Regeln stehen in zuordnung.js und logik.js; hier nur Anzeige, Eingabe und Speicher.
import { zuordnen } from './zuordnung.js';
import {
  leererZustand, migrieren, importLesen, exportErzeugen, schluessel, ausSchluessel, letzteRunde,
  faelligeMittel, mittelNach, rundeErfassen, rundeAusgefallen, rundeUnklar, rundenStatus,
  tagesZeitleiste, offenePunkte, ueblicheZeit, ereignisseAm, EREIGNIS_TYPEN, uhrzeit, rundenName,
  dauer, ueblichText, statusText, rundenDetail, tagesText, icsErzeugen, tagesSchluessel
} from './logik.js';

const APP_VERSION = '1.0.0';
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
  z = migrieren(JSON.parse(rueckStand));
  rueckStand = null;
  speichern();
  $('toast').hidden = true;
  render();
}

const toleranzen = () => ({ frueh: Number(z.einstellungen.frueh), spaet: Number(z.einstellungen.spaet) });
const kurzName = (id) => { const m = mittelNach(z.plan, id); return m.kurz || m.name; };

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
  renderNaechste(jetzt);
  renderOffen(jetzt);
  renderEreignisse(jetzt);
  renderZeitleiste(jetzt);
  $('beispiel').hidden = !z.plan.beispiel;
}

function renderNaechste(jetzt) {
  const letzte = letzteRunde(z.runden);
  const r = zuordnen(jetzt, letzte, toleranzen());
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
  $('haupt').classList.toggle('ruhig', r.art === 'frueh');
  $('haupt').setAttribute('aria-label', `${rundenName(r.runde)}: alles bekommen`);
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
    return `<button class="ereignis${zuletzt ? ' erfasst' : ''}" data-aktion="ereignis" data-typ="${t.id}">
      <span class="ereignis-name">${t.name}</span>
      ${zuletzt ? `<span class="ereignis-heute">heute ${uhrzeit(new Date(zuletzt.zeit))}</span>` : ''}
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
  $('zeitleiste').innerHTML = tagesZeitleiste(z, tag, jetzt, UEBERFAELLIG_NACH).map((zeile) => {
    const k = schluessel(zeile.runde);
    const e = zeile.eintrag;
    const zeit = e && e.zeit ? uhrzeit(new Date(e.zeit)) : '';
    const status = statusText(zeile.status) + (zeit ? ` · ${zeit}` : '');
    const detail = rundenDetail(z.plan, zeile);
    return `<li><button class="zeile ${zeile.status}${k === aktuell ? ' jetzt' : ''}" data-aktion="runde" data-k="${k}">
      <span class="zeile-stunde">${zeile.runde.getHours()}</span>${glyph(zeile.status)}
      <span class="zeile-text"><span class="zeile-status">${status}</span>${detail ? `<span class="zeile-detail">${esc(detail)}</span>` : ''}</span>
    </button></li>`;
  }).join('');
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
  $('sheet').hidden = true;
  $('schleier').hidden = true;
  document.documentElement.classList.remove('gesperrt');
  const nach = sheetBeiSchliessen;
  sheetAktionen = {};
  sheetBeiSchliessen = null;
  if (nach) nach();
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
  const r = zuordnen(jetzt, letzteRunde(z.runden), toleranzen());
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
  const r = zuordnen(new Date(), letzteRunde(z.runden), toleranzen());
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

function ereignisTippen(typ) {
  const t = EREIGNIS_TYPEN.find((x) => x.id === typ);
  const heute = ereignisseAm(z.ereignisse, typ, new Date());
  const neu = () => {
    merken();
    const jetzt = new Date();
    z.ereignisse.push({ typ, zeit: jetzt.toISOString() });
    speichern(); render();
    toast(`${t.name} · ${uhrzeit(jetzt)}`);
  };
  if (!heute.length) { neu(); return; }

  sheetOeffnen(t.name, `
    <p class="leise">Heute erfasst. Uhrzeit ändern oder löschen:</p>
    ${heute.map((e, i) => `<div class="feld"><label for="e-${i}">Um</label>
      <input id="e-${i}" type="time" value="${feldZeit(e.zeit)}" data-zeit="${e.zeit}">
      <button class="knopf gefahr" data-aktion="loeschen" data-zeit="${e.zeit}">Löschen</button></div>`).join('')}
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
  });
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
  sheetOeffnen('Einstellungen', `
    <h3>Plan</h3>
    ${z.plan.beispiel ? '<p class="leise">Das ist ein Beispielplan.</p>' : ''}
    <ul class="plan-liste">${z.plan.mittel.map((m) => `<li>${artIcon(m.art)}<span>${esc(m.name)}<small>${stundenText(m.stunden)}${m.nachholbar === false ? '' : ' · nachholbar'}</small></span></li>`).join('')}</ul>
    <div class="knoepfe"><button class="knopf" data-aktion="importieren">Plan importieren</button></div>

    <h3>Darstellung</h3>
    <div class="segment" role="group" aria-label="Dunkle Darstellung">
      ${modi.map(([w, l]) => `<button data-aktion="modus" data-wert="${w}" aria-pressed="${e.dunkel === w}">${l}</button>`).join('')}
    </div>
    <p class="leise">Automatisch: dunkel von 21 bis 7 Uhr und wenn das iPhone dunkel eingestellt ist.</p>

    <h3>Zuordnung</h3>
    <div class="feld"><label for="s-frueh">Bis so viele Minuten vor der Runde zählt ein Tipp noch dazu</label>
      <input id="s-frueh" type="number" inputmode="numeric" min="0" max="59" value="${e.frueh}"></div>
    <div class="feld"><label for="s-spaet">Bis so viele Minuten nach der Runde zählt ein Tipp noch dazu</label>
      <input id="s-spaet" type="number" inputmode="numeric" min="0" max="59" value="${e.spaet}"></div>

    <h3>Erinnerungen im Kalender</h3>
    <div class="feld"><label for="s-von">Von</label><select id="s-von">${stundenOptionen(e.erinnerungVon)}</select></div>
    <div class="feld"><label for="s-bis">Bis einschließlich</label><select id="s-bis">${stundenOptionen(e.erinnerungBis)}</select></div>
    <div class="knoepfe"><button class="knopf" data-aktion="ics">Erinnerungen in Kalender übernehmen</button></div>
    <p class="leise">Erzeugt je volle Stunde einen täglichen 5-Minuten-Termin „Augentropfen“ mit Hinweis.
      Im Teilen-Menü „Kalender“ wählen oder „In Dateien sichern“ und die Datei dort antippen, dann „Alle hinzufügen“.
      Tipp: in einen eigenen Kalender „Tropfen“ übernehmen. Zum Entfernen löschst du später einfach diesen Kalender.</p>

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
    importieren: () => $('datei').click(),
    ics: async () => {
      const von = Number(z.einstellungen.erinnerungVon);
      const bis = Number(z.einstellungen.erinnerungBis);
      if (bis < von) { toast('„Bis“ muss nach „Von“ liegen.', false); return; }
      await dateiAusgeben('tropfen-erinnerungen.ics', icsErzeugen(von, bis, new Date()), 'text/calendar');
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
  zahl('s-frueh', 'frueh');
  zahl('s-spaet', 'spaet');
  for (const [id, feld] of [['s-von', 'erinnerungVon'], ['s-bis', 'erinnerungBis']]) {
    $(id).addEventListener('change', (ev) => { z.einstellungen[feld] = Number(ev.target.value); speichern(); });
  }
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
    bestaetigen({
      titel: 'Backup einspielen?',
      text: `Das Backup enthält ${n} Runden. Es ersetzt alle Daten auf diesem Gerät.`,
      ja: 'Backup einspielen'
    }, () => { merken(); z = ergebnis.zustand; speichern(); render(); toast('Backup eingespielt'); });
  }
});

// ---------- Ereignisse ----------

const aktionen = {
  alles: () => erfassenStart([]),
  'nicht-alles': nichtAllesSheet,
  rueckgaengig,
  einstellungen: einstellungenSheet,
  luecken: lueckenSheet,
  nachgeholt: (el) => offenMarkieren(el, 'nachgeholt'),
  entfaellt: (el) => offenMarkieren(el, 'entfaellt'),
  ereignis: (el) => ereignisTippen(el.dataset.typ),
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
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
