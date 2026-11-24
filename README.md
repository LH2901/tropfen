# Tropfen

Kleine Web-App für das iPhone zum Abhaken von Augentropfen, entweder nach festem Plan (stündlich, alle 2 Stunden oder beliebige Stunden) oder nur nach Anzahl pro Tag, mit Offen-Liste, Tageszeitleiste sowie Essen und Visite (mit Notizen zur Visite).
Läuft offline. Alle Daten bleiben auf dem Gerät.

Persönliche Gedächtnisstütze, kein Medizinprodukt. Es gelten immer die Anweisungen von Station und Ärzten.

## Installation auf dem iPhone

1. Die Adresse der App in **Safari** öffnen (nicht in Chrome oder einer anderen App).
2. Unten auf **Teilen** tippen, dann **„Zum Home-Bildschirm“** und **Hinzufügen**.
3. Ab jetzt **nur noch die App vom Home-Bildschirm** benutzen. Sie hat einen eigenen Speicher, getrennt von Safari. Was du in Safari einträgst, siehst du in der App nicht.
4. Eigenen Plan laden: Einstellungen (Zahnrad oben rechts) → **Plan importieren** → Plan-Datei auswählen.

## Backup

Einstellungen → **Backup exportieren**. Im Teilen-Menü „In Dateien sichern“ wählen, zum Beispiel in iCloud Drive.
Zurückholen mit Einstellungen → **Backup importieren**. Das ersetzt alle Daten auf dem Gerät.

Exportiere regelmäßig ein Backup. Wenn die Website-Daten gelöscht werden oder die App vom Home-Bildschirm entfernt wird, sind die Einträge sonst weg.

## Updates

App schließen (vom unteren Rand nach oben wischen und die App wegschieben) und neu öffnen. Die neue Version lädt beim Öffnen, wenn eine Internetverbindung besteht. Die Versionsnummer steht unten in den Einstellungen.

## Erinnerungen

Einstellungen → **Erinnerungen in Kalender übernehmen** erzeugt für jede Runde laut Plan im gewählten Zeitraum einen täglichen 5-Minuten-Termin „Augentropfen“ mit Hinweis.
Im Teilen-Menü „Kalender“ wählen. Falls es dort fehlt: „In Dateien sichern“, die Datei in der Dateien-App antippen und „Alle hinzufügen“ wählen.
Am besten einen eigenen Kalender „Tropfen“ wählen. Zum Entfernen löschst du später diesen Kalender (Kalender-App → Kalender → Info → Kalender löschen).

Falls der Kalender-Import nicht klappt: In der Erinnerungen-App eine Erinnerung „Augentropfen“ anlegen, Uhrzeit setzen und „Wiederholen: Stündlich“ wählen.

## Plan-Datei

Der Plan wird als JSON-Datei importiert und steht nicht im Code:

```json
{
  "format": "tropfen-plan",
  "version": 1,
  "plan": {
    "mittel": [
      { "id": "a", "name": "Tropfen A", "kurz": "A", "art": "tropfen", "stunden": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], "nachholbar": false },
      { "id": "salbe", "name": "Salbe", "kurz": "Salbe", "art": "salbe", "stunden": [8, 20], "nachholbar": true }
    ]
  }
}
```

- `art`: `tropfen` oder `salbe`
- `stunden`: volle Stunden, zu denen das Mittel fällig ist (Modus „Feste Uhrzeiten“)
- `proTag` (optional): wie oft am Tag (Modus „Nach Anzahl“); ohne Angabe die Anzahl der `stunden`
- `nachholbar`: Fehlt das Mittel in einer Runde, erscheint es unter „Offen“

## Feste Uhrzeiten oder nach Anzahl

Einstellungen → **Tropfen** schaltet um:

- **Feste Uhrzeiten**: Runden zu den Stunden laut Plan; ein Tipp trägt die ganze Runde ein.
- **Nach Anzahl**: keine festen Runden. Du trägst ein, wann du was getropft hast. Die App zeigt je Mittel, wie oft es heute schon war, und schlägt die nächste Gabe gleichmäßig verteilt vor (Abstand höchstens 24 h geteilt durch die Anzahl, aber so, dass der Rest bis zur eingestellten letzten Gabe passt; mindestens 1 Stunde). Was fällig ist, trägt der große Knopf mit einem Tipp ein; „Auswahl …“ für eine andere Auswahl oder Uhrzeit.

## Entwicklung

Kein Build-Schritt, keine Abhängigkeiten.

```bash
node --test                      # Tests der Zuordnungslogik und Ableitungen
python -m http.server 8765       # lokal starten, dann http://localhost:8765
node tools/icons.mjs             # App-Icons neu erzeugen
```

- `zuordnung.js`: ordnet einen Tipp einer Runde zu (reine Funktion)
- `logik.js`: Datenmodell, Migration, Zeitleiste, Offen-Liste, übliche Zeiten, Kalenderdatei
- `app.js`: Oberfläche
- `sw.js`: Offline-Cache. **Bei jeder Änderung `VERSION` in `sw.js` erhöhen** (und `APP_VERSION` in `app.js`), sonst kommt das Update nicht an.
