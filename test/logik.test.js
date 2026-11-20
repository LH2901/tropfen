import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  leererZustand, migrieren, importLesen, exportErzeugen, schluessel, ausSchluessel, letzteRunde,
  rundeErfassen, rundeAusgefallen, rundeUnklar, rundenStatus, tagesZeitleiste, offenePunkte,
  ueblicheZeit, ueblichText, icsErzeugen, rundenDetail, ereignisVerlauf, notizSetzen, visiten, tagesText
} from '../logik.js';

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
