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

test('Lücken über Mitternacht werden korrekt aufgezählt', () => {
  const r = zuordnen(um(1, 10, 21), um(22, 0, 20));
  assert.equal(r.art, 'spaet');
  assert.deepEqual(r.runde, um(1, 0, 21));
  assert.deepEqual(r.luecken, [um(23, 0, 20), um(0, 0, 21)]);
});
