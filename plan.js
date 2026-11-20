// Beispielplan. Der eigene Plan wird in der App über Einstellungen → „Plan importieren“ geladen
// und bleibt nur auf dem Gerät. Format siehe README.
//
// art:        'tropfen' | 'salbe'
// stunden:    volle Stunden 0–23, zu denen das Mittel fällig ist
// nachholbar: true → fehlt es in einer Runde, erscheint es unter „Offen“

const ALLE_STUNDEN = Array.from({ length: 24 }, (_, h) => h);

export const BEISPIELPLAN = Object.freeze({
  beispiel: true,
  mittel: [
    { id: 'stuendlich', name: 'Tropfen A', kurz: 'Tropfen A', art: 'tropfen', stunden: ALLE_STUNDEN, nachholbar: false },
    { id: 'zweimal', name: 'Tropfen B', kurz: 'Tropfen B', art: 'tropfen', stunden: [8, 20], nachholbar: true },
    { id: 'salbe', name: 'Salbe', kurz: 'Salbe', art: 'salbe', stunden: [8, 14, 20], nachholbar: true }
  ]
});
