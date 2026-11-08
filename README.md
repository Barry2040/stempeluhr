# Stempeluhr

Einfache Arbeitszeiterfassung fürs Handy – ohne Abo, ohne Konto, Daten bleiben auf dem Gerät.

- Ein-/Ausstempeln, Pausen starten/beenden
- Einträge nachtragen und bearbeiten (auch über Mitternacht)
- Tages-, Wochen- und Monatsübersicht mit Soll/Ist und Überstundensaldo
- Optional: gesetzliche Mindestpause (30/45 Min.) automatisch abziehen
- Stundenzettel (Bon) fotografieren → Zeiten und Pausen werden automatisch erkannt (offline, Google ML Kit)
- Monatsexport als CSV (Excel), Backup/Wiederherstellung als JSON

## Installieren (Android)

1. Im Repo unter **Releases → latest** die Datei `Stempeluhr.apk` aufs Handy laden.
2. Öffnen und „Installation aus unbekannten Quellen“ für den Browser/Dateimanager erlauben.
3. Updates: neue APK genauso installieren – die Daten bleiben erhalten.

Jeder Push auf `main` baut die APK automatisch neu (GitHub Actions).

## Aufbau

Die ganze App steckt in `www/index.html` (HTML/CSS/JS, Speicherung in `localStorage`).
Capacitor verpackt sie als Android-App. Lokal testen: `npx http-server www`.
