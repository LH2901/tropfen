import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  leererZustand, migrieren, importLesen, exportErzeugen, schluessel, ausSchluessel, letzteRunde,
  rundeErfassen, rundeAusgefallen, rundeUnklar, rundenStatus, tagesZeitleiste, offenePunkte,
  ueblicheZeit, ueblichText, icsErzeugen, rundenDetail, ereignisVerlauf, notizSetzen, visiten, tagesText,
  rundenStunden, extraErfassen, extraAm, extraMittelText,
  proTag, gabeErfassen, gabenAm, anzahlStand, gabeVorschlag, mittelText, gueltigerPlan
} from '../logik.js';

test('Außer der Reihe: erfassen, Tag, Text; Runden bleiben unberührt; Backup behält Einträge', () => {
  assert.equal(extraErfassen(um(9, 12), [], '  '), null);
  const a = extraErfassen(um(9, 12), ['wechsel', 'wechsel'], '', ' ausgelaufen ');
  assert.deepEqual(a, { zeit: um(9, 12).toISOString(), mittel: ['wechsel'], notiz: 'ausgelaufen' });
  const b = extraErfassen(um(7, 5), ['salbe'], 'Tränenersatz');
  const c = extraErfassen(um(23, 50, 19), ['salbe']);

  const z = { ...leererZustand(), plan, extra: [a, b, c] };
  assert.deepEqual(extraAm(z.extra, um(0)).map((e) => e.zeit), [b.zeit, a.zeit]);
  assert.equal(extraMittelText(plan, b), 'Salbe, Tränenersatz');

  // Kein Einfluss auf Runden: letzte Runde und Zeitleiste ignorieren Extra-Einträge
  assert.equal(letzteRunde(z.runden), null);
  assert.equal(tagesZeitleiste(z, um(0), um(10)).filter((x) => x.eintrag).length, 0);

  const text = tagesText(z, um(0), um(23));
  assert.match(text, /Außer der Reihe:\n 7:05  Salbe, Tränenersatz\n 9:12  Wechsel – ausgelaufen/);
  assert.doesNotMatch(text, /23:50/);

  assert.equal(migrieren(JSON.parse(exportErzeugen(z))).extra.length, 3);
  assert.deepEqual(migrieren({ version: 1 }).extra, []);
});

test('Plan alle 2 Stunden: Runden-Stunden, Zeitleiste mit altem Eintrag, Kalender', () => {
  const zweiStd = { mittel: [
    { id: 'v', name: 'V', kurz: 'V', art: 'tropfen', stunden: [2, 6, 10, 14, 18, 22], nachholbar: false },
    { id: 'p', name: 'P', kurz: 'P', art: 'tropfen', stunden: [0, 4, 8, 12, 16, 20], nachholbar: false },
    { id: 's', name: 'S', kurz: 'S', art: 'salbe', stunden: [8, 12, 14], nachholbar: true }
  ] };
  assert.deepEqual(rundenStunden(zweiStd), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
  assert.equal(rundenStunden(plan).length, 24);

  // Eintrag von 13 Uhr stammt noch aus dem stündlichen Plan und bleibt sichtbar
  const z = { ...leererZustand(), plan: zweiStd, runden: {
    '2026-11-20T13': { zeit: um(13, 2).toISOString(), mittel: { alt: 'ja' } },
    '2026-11-20T14': { zeit: um(14, 3).toISOString(), mittel: { v: 'ja', s: 'ja' } }
  } };
  const zeilen = tagesZeitleiste(z, um(0), um(16, 30));
  assert.deepEqual(zeilen.map((x) => x.runde.getHours()), [0, 2, 4, 6, 8, 10, 12, 13, 14, 16, 18, 20, 22]);
  assert.deepEqual(zeilen.filter((x) => x.runde.getHours() >= 13 && x.runde.getHours() <= 18).map((x) => x.status),
    ['erledigt', 'erledigt', 'ueberfaellig', 'kommt']);

  const ics = icsErzeugen(10, 19, um(9), 'tropfen', rundenStunden(zweiStd));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 5); // 10, 12, 14, 16, 18
});

test('Visite-Notiz: setzen, kürzen, leeren; Liste neueste zuerst; Tagesübersicht', () => {
  const v1 = um(9, 40, 19).toISOString();
  const v2 = um(10, 15, 20).toISOString();
  const ereignisse = [
    { typ: 'visite', zeit: v1 },
    { typ: 'fruehstueck', zeit: um(7, 30, 20).toISOString() },
    { typ: 'visite', zeit: v2 }
  ];
  assert.equal(notizSetzen(ereignisse, 'visite', v2, '  Druck ok.\nTropfen ab Montag reduzieren.  '), true);
  assert.equal(ereignisse[2].notiz, 'Druck ok.\nTropfen ab Montag reduzieren.');
  assert.equal(notizSetzen(ereignisse, 'visite', 'gibt-es-nicht', 'x'), false);
  notizSetzen(ereignisse, 'visite', v1, 'kurz');
  notizSetzen(ereignisse, 'visite', v1, '   ');
  assert.equal('notiz' in ereignisse[0], false);

  assert.deepEqual(visiten(ereignisse).map((e) => e.zeit), [v2, v1]);
  assert.deepEqual(visiten(ereignisse, um(0, 0, 20)).map((e) => e.zeit), [v2]);

  const zustand = { ...leererZustand(), plan, ereignisse };
  const text = tagesText(zustand, um(0, 0, 20), um(23, 0, 20));
  assert.match(text, /Frühstück 7:30, Visite 10:15/);
  assert.match(text, /\n\nVisite 10:15:\nDruck ok\.\nTropfen ab Montag reduzieren\.$/);
  assert.doesNotMatch(tagesText(zustand, um(0, 0, 19), um(23, 0, 20)), /Visite 9:40:/);
});

const um = (h, m = 0, tag = 20) => new Date(2026, 10, tag, h, m);
const plan = {
  mittel: [
    { id: 'wechsel', name: 'Wechsel', kurz: 'Wechsel', art: 'tropfen', stunden: [...Array(24).keys()], nachholbar: false },
    { id: 'salbe', name: 'Salbe', kurz: 'Salbe', art: 'salbe', stunden: [8, 12], nachholbar: true }
  ]
};
const zustandMit = (runden = {}, ereignisse = []) => ({ ...leererZustand(), plan, runden, ereignisse });

test('Schlüssel und Rückweg', () => {
  assert.equal(schluessel(um(9, 8)), '2026-11-20T09');
  assert.deepEqual(ausSchluessel('2026-11-20T09'), um(9));
  assert.deepEqual(letzteRunde({ '2026-11-20T09': {}, '2026-11-19T23': {}, '2026-11-20T10': {} }), um(10));
  assert.equal(letzteRunde({}), null);
});

test('Rundenstatus aus den Mitteln', () => {
  assert.equal(rundenStatus(rundeErfassen(plan, um(8), um(8, 5))), 'erledigt');
  assert.equal(rundenStatus(rundeErfassen(plan, um(8), um(8, 5), ['salbe'])), 'teilweise');
  assert.equal(rundenStatus(rundeErfassen(plan, um(8), um(8, 5), ['salbe', 'wechsel'])), 'ausgefallen');
  assert.equal(rundenStatus(rundeAusgefallen(plan, um(9))), 'ausgefallen');
  assert.equal(rundenStatus(rundeUnklar(plan, um(9))), 'unklar');
  const nach = rundeErfassen(plan, um(8), um(8, 5), ['salbe']);
  nach.mittel.salbe = 'nachgeholt';
  assert.equal(rundenStatus(nach), 'erledigt');
});

test('Zeitleiste: kommt, fällig, überfällig, keine Angabe', () => {
  const z = zustandMit({ '2026-11-20T09': rundeErfassen(plan, um(9), um(9, 8)) });
  const zeilen = tagesZeitleiste(z, um(0), um(10, 20));
  assert.equal(zeilen[8].status, 'keine');
  assert.equal(zeilen[9].status, 'erledigt');
  assert.equal(zeilen[10].status, 'ueberfaellig');
  assert.equal(zeilen[11].status, 'kommt');
  assert.equal(tagesZeitleiste(z, um(0), um(10, 10))[10].status, 'faellig');
});

test('Offen: nachholbare Mittel und unklare Runden, nicht der stündliche Wechsel, nur 24 h', () => {
  const z = zustandMit({
    '2026-11-19T08': rundeErfassen(plan, um(8, 0, 19), um(8, 0, 19), ['salbe']),
    '2026-11-20T08': rundeErfassen(plan, um(8), um(8, 5), ['salbe', 'wechsel']),
    '2026-11-20T09': rundeUnklar(plan, um(9)),
    '2026-11-20T10': rundeErfassen(plan, um(10), um(10, 5), ['wechsel'])
  });
  const offen = offenePunkte(z, um(11));
  assert.deepEqual(offen.map((o) => [o.art, o.k, o.id]), [
    ['mittel', '2026-11-20T08', 'salbe'],
    ['unklar', '2026-11-20T09', undefined]
  ]);
});

test('Offen: Mittel, das nach neuem Plan fehlt, wird nicht mehr angeboten', () => {
  const z = zustandMit({
    '2026-11-20T08': { zeit: null, mittel: { alt: 'nein', salbe: 'nein' }, ausgefallen: true }
  });
  assert.deepEqual(offenePunkte(z, um(9)).map((o) => o.id), ['salbe']);
});

test('Übliche Zeit: Median der letzten 5 Tage, erster Eintrag je Tag', () => {
  const ev = [];
  const zeiten = [[15, 17, 20], [16, 17, 50], [17, 17, 35], [18, 17, 30], [19, 17, 40], [20, 17, 35]];
  for (const [tag, h, m] of zeiten) ev.push({ typ: 'abend', zeit: new Date(2026, 10, tag, h, m).toISOString() });
  ev.push({ typ: 'abend', zeit: new Date(2026, 10, 20, 19, 0).toISOString() }); // zweiter Eintrag am selben Tag
  const u = ueblicheZeit(ev, 'abend');
  assert.equal(u.anzahl, 5);
  assert.equal(ueblichText(u), 'üblich ~17:35 (17:30–17:50)');
  assert.equal(ueblichText(ueblicheZeit(ev, 'visite')), 'noch keine Daten');
});

test('Verlauf: Tage mit Einträgen, neueste zuerst, mehrere Einträge je Typ sortiert', () => {
  const ev = [
    { typ: 'visite', zeit: um(10, 30, 19).toISOString() },
    { typ: 'abend', zeit: um(17, 35, 20).toISOString() },
    { typ: 'visite', zeit: um(15, 0, 20).toISOString() },
    { typ: 'visite', zeit: um(10, 10, 20).toISOString() },
    { typ: 'fruehstueck', zeit: um(7, 40, 17).toISOString() }
  ];
  const v = ereignisVerlauf(ev);
  assert.deepEqual(v.map((t) => t.tag.getDate()), [20, 19, 17]);
  assert.deepEqual(v[0].typen.visite.map((d) => d.getHours()), [10, 15]);
  assert.deepEqual(v[0].typen.fruehstueck, []);
  assert.equal(ereignisVerlauf(ev, 2).length, 2);
  assert.deepEqual(ereignisVerlauf([]), []);
});

test('Migration und Import', () => {
  const alt = migrieren({ runden: { '2026-11-20T09': rundeErfassen(plan, um(9), um(9)) } });
  assert.equal(alt.version, 1);
  assert.equal(alt.einstellungen.spaet, 45);
  assert.throws(() => migrieren({ version: 99 }));

  const backup = importLesen(exportErzeugen(zustandMit({ '2026-11-20T09': rundeErfassen(plan, um(9), um(9)) })));
  assert.equal(backup.art, 'backup');
  assert.ok(backup.zustand.runden['2026-11-20T09']);

  const p = importLesen(JSON.stringify({ format: 'tropfen-plan', version: 1, plan }));
  assert.equal(p.art, 'plan');
  assert.equal(p.plan.mittel.length, 2);
  assert.throws(() => importLesen('{"format":"tropfen-plan","plan":{"mittel":[{"id":"x"}]}}'));
  assert.throws(() => importLesen('kein json'));
});

test('Rundendetail für die Zeitleiste', () => {
  const z = zustandMit({ '2026-11-20T08': rundeErfassen(plan, um(8), um(8, 5), ['salbe']) });
  const zeile = tagesZeitleiste(z, um(0), um(9))[8];
  assert.equal(rundenDetail(plan, zeile), 'Salbe fehlt');
});

test('ICS: 10–19 Uhr ergibt 10 tägliche Ereignisse mit Alarm', () => {
  const ics = icsErzeugen(10, 19, um(9));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 10);
  assert.equal(ics.match(/RRULE:FREQ=DAILY/g).length, 10);
  assert.equal(ics.match(/TRIGGER:PT0M/g).length, 10);
  assert.ok(ics.includes('DTSTART:20261120T100000'));
  assert.ok(ics.includes('DTEND:20261120T190500'));
  assert.ok(ics.includes('\r\n'));
});

test('Nach Anzahl: Stand, gleichmäßige Verteilung, Vorschlag, Text, Backup', () => {
  const p = {
    mittel: [
      { id: 'vig', name: 'Vigamox', kurz: 'Vigamox', art: 'tropfen', stunden: [], proTag: 6 },
      { id: 'poly', name: 'Polyspectran', kurz: 'Poly', art: 'tropfen', stunden: [], proTag: 6 },
      { id: 'salbe', name: 'Salbe', kurz: 'Salbe', art: 'salbe', stunden: [], proTag: 5 },
      { id: 'dexa', name: 'Dexa', kurz: 'Dexa', art: 'tropfen', stunden: [], proTag: 2 },
      { id: 'alt', name: 'Alt', kurz: 'Alt', art: 'tropfen', stunden: [8, 20] }
    ]
  };
  assert.ok(gueltigerPlan(p));
  assert.ok(!gueltigerPlan({ mittel: [{ ...p.mittel[0], proTag: 2.5 }] }));
  assert.equal(proTag(p.mittel[4]), 2);
  assert.equal(gabeErfassen(um(8), []), null);

  const z = { ...leererZustand(), plan: p };
  z.einstellungen.modus = 'anzahl';

  // Noch nichts: alles ab Tagesbeginn (8 Uhr) fällig, vorher die nächste Gruppe als früh
  let stand = anzahlStand(z, um(9));
  assert.deepEqual(stand.map((s) => s.status), ['faellig', 'faellig', 'faellig', 'faellig', 'faellig']);
  assert.equal(gabeVorschlag(anzahlStand(z, um(7))).frueh, true);
  assert.equal(gabeVorschlag(anzahlStand(z, um(7))).ids.length, 5);

  // 8:00 alles: Abstand min(24 h / n, Rest bis 22 Uhr / offene Gaben)
  z.gaben.push(gabeErfassen(um(8), ['vig', 'poly', 'salbe', 'dexa', 'alt']));
  stand = anzahlStand(z, um(10, 15));
  const n = Object.fromEntries(stand.map((s) => [s.m.id, s]));
  assert.equal(n.vig.ist, 1);
  assert.deepEqual(n.vig.naechste, um(10, 50));   // 14 h / 5 = 2 h 48 → auf 5 min gerundet
  assert.deepEqual(n.salbe.naechste, um(11, 30));  // 14 h / 4 = 3 h 30
  assert.deepEqual(n.dexa.naechste, um(20));       // 24 h / 2 = 12 h
  assert.equal(n.vig.status, 'spaeter');
  let v = gabeVorschlag(stand);
  assert.deepEqual(v, { ids: ['vig', 'poly'], frueh: true, um: um(10, 50) });

  // 30 Minuten vorher fällig; Salbe kommt dazu, sobald sie dran ist
  v = gabeVorschlag(anzahlStand(z, um(10, 25)));
  assert.deepEqual(v.ids, ['vig', 'poly']);
  assert.equal(v.frueh, false);
  z.gaben.push(gabeErfassen(um(10, 45), ['vig', 'poly']));
  assert.deepEqual(gabeVorschlag(anzahlStand(z, um(11, 10))).ids, ['salbe']);

  // Fertig, wenn die Anzahl erreicht ist; Gaben in der Zukunft zählen noch nicht
  z.gaben.push(gabeErfassen(um(20), ['dexa']));
  assert.equal(anzahlStand(z, um(19)).find((s) => s.m.id === 'dexa').ist, 1);
  assert.equal(anzahlStand(z, um(21)).find((s) => s.m.id === 'dexa').status, 'fertig');

  // Spät dran: Rest wird enger verteilt, aber nie unter 1 Stunde; direkt danach nicht gleich wieder fällig
  const spaet = { ...leererZustand(), plan: p, gaben: [gabeErfassen(um(21, 50), ['vig'])] };
  const s1 = anzahlStand(spaet, um(21, 51)).find((s) => s.m.id === 'vig');
  assert.deepEqual(s1.naechste, um(22, 50));
  assert.equal(s1.status, 'spaeter');
  assert.equal(anzahlStand(spaet, um(22, 35)).find((s) => s.m.id === 'vig').status, 'faellig');

  // Gaben anderer Tage zählen nicht
  z.gaben.push(gabeErfassen(um(9, 0, 19), ['vig']));
  assert.equal(gabenAm(z.gaben, um(0)).length, 3);
  assert.equal(mittelText(p, ['vig', 'salbe']), 'Vigamox, Salbe');

  const text = tagesText(z, um(0), um(23));
  assert.match(text, / 8:00  Vigamox, Poly, Salbe, Dexa, Alt\n10:45  Vigamox, Poly\n20:00  Dexa/);
  assert.match(text, /Gezählt: Vigamox 2\/6, Poly 2\/6, Salbe 1\/5, Dexa 2\/2, Alt 1\/2/);

  // Runden-Modus bleibt unberührt
  assert.equal(letzteRunde(z.runden), null);
  assert.equal(migrieren(JSON.parse(exportErzeugen(z))).gaben.length, 4);
  assert.deepEqual(migrieren({ version: 1 }).gaben, []);
  assert.equal(migrieren({ version: 1 }).einstellungen.modus, 'zeiten');
});
