// Ausführen im Ordner tropfen: node --test   (keine Abhängigkeiten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zuordnen, gerundeteRunde } from '../zuordnung.js';

// Fester Beispieltag in Gerätezeit
const um = (h, m = 0, tag = 20) => new Date(2026, 10, tag, h, m);
const stunden = (liste) => liste.map((d) => d.getHours());

// HANDOFF 4: 9-Uhr-Runde wurde um 9:08 eingetragen → letzteRunde = 9:00
const neunUhr = um(9);

test('9:29 → 10-Uhr-Runde', () => {
  const r = zuordnen(um(9, 29), neunUhr);
  assert.equal(r.art, 'normal');
  assert.deepEqual(r.runde, um(10));
});

test('10:30 → 10-Uhr-Runde', () => {
  const r = zuordnen(um(10, 30), neunUhr);
  assert.equal(r.art, 'normal');
  assert.deepEqual(r.runde, um(10));
});

test('10:44 → 10-Uhr-Runde', () => {
  const r = zuordnen(um(10, 44), neunUhr);
  assert.equal(r.art, 'normal');
  assert.deepEqual(r.runde, um(10));
});

test('10:55 → 11-Uhr-Runde, Lückenfrage für 10 Uhr', () => {
  const r = zuordnen(um(10, 55), neunUhr);
  assert.equal(r.art, 'spaet');
  assert.deepEqual(r.runde, um(11));
  assert.deepEqual(stunden(r.luecken), [10]);
});

test('12:20 → 12-Uhr-Runde, Lückenfragen für 10 und 11 Uhr', () => {
  const r = zuordnen(um(12, 20), neunUhr);
  assert.equal(r.art, 'spaet');
  assert.deepEqual(r.runde, um(12));
  assert.deepEqual(stunden(r.luecken), [10, 11]);
});

test('9:12 → Nachfrage „Trotzdem eintragen?“, 10-Uhr-Runde in 48 min', () => {
  const r = zuordnen(um(9, 12), neunUhr);
  assert.equal(r.art, 'frueh');
  assert.deepEqual(r.runde, um(10));
  assert.equal(r.minutenBisFaellig, 48);
});

test('9:25 → 10-Uhr-Runde (35 min vorher, im Fenster)', () => {
  const r = zuordnen(um(9, 25), neunUhr);
  assert.equal(r.art, 'normal');
  assert.deepEqual(r.runde, um(10));
});

test('Mitternacht: 23-Uhr-Runde erledigt, Tipp um 0:10 → 0-Uhr-Runde des neuen Tages', () => {
  const r = zuordnen(um(0, 10, 21), um(23, 0, 20));
  assert.equal(r.art, 'normal');
  assert.deepEqual(r.runde, um(0, 0, 21));
});

test('Erste Nutzung um 14:50 → 15-Uhr-Runde', () => {
  const r = zuordnen(um(14, 50), null);
  assert.equal(r.art, 'neu');
  assert.deepEqual(r.runde, um(15));
});

test('Erste Nutzung um 14:40 → 14-Uhr-Runde', () => {
  const r = zuordnen(um(14, 40), null);
  assert.equal(r.art, 'neu');
  assert.deepEqual(r.runde, um(14));
});

// Grenzen und Zusatzregeln aus der Abstimmung

test('Grenzen sind minutengenau eingeschlossen: 9:20 und 10:45 → 10-Uhr-Runde', () => {
  assert.equal(zuordnen(um(9, 20), neunUhr).art, 'normal');
  assert.equal(zuordnen(um(9, 19), neunUhr).art, 'frueh');
  assert.equal(zuordnen(um(10, 45), neunUhr).art, 'normal');
  assert.equal(zuordnen(new Date(2026, 10, 20, 10, 45, 59), neunUhr).art, 'normal');
  assert.equal(zuordnen(um(10, 46), neunUhr).art, 'spaet');
});

test('Lücke über 6 Stunden gilt als Neuanfang ohne Lückenfragen', () => {
  // erwartet 10:00; 16:00 ist genau 6 h → noch Lückenfragen (10–15)
  const genau = zuordnen(um(16, 0), neunUhr);
  assert.equal(genau.art, 'spaet');
  assert.deepEqual(stunden(genau.luecken), [10, 11, 12, 13, 14, 15]);

  const mehr = zuordnen(um(16, 30), neunUhr);
  assert.equal(mehr.art, 'neu');
  assert.deepEqual(mehr.runde, um(16));
  assert.deepEqual(mehr.luecken, []);
});

test('Späte Toleranz steuert auch die Rundungsregel', () => {
  const tol = { spaet: 30 };
  const r = zuordnen(um(10, 35), neunUhr, tol);
  assert.equal(r.art, 'spaet');
  assert.deepEqual(r.runde, um(11));
  assert.deepEqual(stunden(r.luecken), [10]);
  assert.deepEqual(gerundeteRunde(um(14, 31), 30), um(15));
  assert.deepEqual(gerundeteRunde(um(14, 30), 30), um(14));
});

test('Frühe Toleranz ist einstellbar', () => {
  assert.equal(zuordnen(um(9, 25), neunUhr, { frueh: 30 }).art, 'frueh');
  assert.equal(zuordnen(um(9, 30), neunUhr, { frueh: 30 }).art, 'normal');
});

// Plan alle 2 Stunden: Runden nur zu geraden Stunden
const GERADE = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
const vierzehn = um(14);

test('2 Stunden: nach der 14-Uhr-Runde ist 16 Uhr dran, nicht 15 Uhr', () => {
  const r = zuordnen(um(15, 50), vierzehn, {}, GERADE);
  assert.equal(r.art, 'normal');
  assert.deepEqual(r.runde, um(16));
});

test('2 Stunden: zu früh gilt relativ zur 16-Uhr-Runde', () => {
  const r = zuordnen(um(15, 10), vierzehn, {}, GERADE);
  assert.equal(r.art, 'frueh');
  assert.deepEqual(r.runde, um(16));
  assert.equal(r.minutenBisFaellig, 50);
  assert.equal(zuordnen(um(15, 20), vierzehn, {}, GERADE).art, 'normal');
});

test('2 Stunden: auch eine Stunde zu spät zählt noch zur erwarteten Runde, ohne Lücke', () => {
  const r = zuordnen(um(17, 0), vierzehn, {}, GERADE);
  assert.equal(r.art, 'normal');
  assert.deepEqual(r.runde, um(16));
  // Die letzten 15 Minuten vor 18 Uhr gehören schon zur 18-Uhr-Runde
  assert.deepEqual(zuordnen(um(17, 45), vierzehn, {}, GERADE).runde, um(16));
  const spaet = zuordnen(um(17, 46), vierzehn, {}, GERADE);
  assert.equal(spaet.art, 'spaet');
  assert.deepEqual(spaet.runde, um(18));
  assert.deepEqual(stunden(spaet.luecken), [16]);
});

test('2 Stunden: Lücken nur zu Plan-Stunden, auch über Mitternacht', () => {
  const r = zuordnen(um(2, 5, 21), um(20, 0, 20), {}, GERADE);
  assert.equal(r.art, 'spaet');
  assert.deepEqual(r.runde, um(2, 0, 21));
  assert.deepEqual(r.luecken, [um(22, 0, 20), um(0, 0, 21)]);
});

test('2 Stunden: erste Nutzung und alte Runde zu ungerader Stunde', () => {
  assert.deepEqual(zuordnen(um(15, 0), null, {}, GERADE).runde, um(14));
  assert.deepEqual(zuordnen(um(15, 50), null, {}, GERADE).runde, um(16));
  // Letzter Eintrag stammt noch aus dem stündlichen Plan (13 Uhr) → als Nächstes 14 Uhr
  const r = zuordnen(um(14, 5), um(13), {}, GERADE);
  assert.equal(r.art, 'normal');
  assert.deepEqual(r.runde, um(14));
});

test('Lücken über Mitternacht werden korrekt aufgezählt', () => {
  const r = zuordnen(um(1, 10, 21), um(22, 0, 20));
  assert.equal(r.art, 'spaet');
  assert.deepEqual(r.runde, um(1, 0, 21));
  assert.deepEqual(r.luecken, [um(23, 0, 20), um(0, 0, 21)]);
});
