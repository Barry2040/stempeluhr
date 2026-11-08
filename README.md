<p align="center">
  <img src="docs/banner.svg" alt="Stempeluhr – Arbeitszeiten und Pausen erfassen, kostenlos, ohne Abo" width="100%">
</p>

<p align="center">
  <b>Arbeitszeiten und Pausen am Handy stempeln – ohne Abo, ohne Konto, ohne Werbung.</b><br>
  Alle Daten bleiben auf deinem Gerät. Stundenzettel vom Stempel-Terminal einfach abfotografieren.
</p>

<p align="center">
  <a href="https://github.com/Barry2040/stempeluhr/releases/latest/download/Stempeluhr.apk"><b>⬇ APK herunterladen (Android)</b></a>
</p>

> [!WARNING]
> **Vibe-coded:** Dieses Projekt ist mit KI-Unterstützung (Claude) im „Vibe Coding“ entstanden – im Gespräch,
> Schritt für Schritt, ohne klassische Code-Reviews. Es kann daher **Fehler enthalten**.
> Getestet wurde nur das, was unten unter [Teststatus](#-teststatus) als „getestet“ markiert ist. Mach regelmäßig ein Backup.
> Fehler und Ideen gerne als [Issue](https://github.com/Barry2040/stempeluhr/issues) melden.

<p align="center">
  <img src="docs/screenshot.png" alt="Stempeluhr: links die Heute-Ansicht mit Pause und Ausstempeln, in der Mitte der Monatsverlauf mit Soll, Ist und Saldo, rechts die Vorschau eines gescannten Stundenzettels" width="100%">
</p>

---

## ✨ Funktionen

| | |
|---|---|
| ⏱️ **Stempeln** | Ein großer Knopf: Einstempeln, Pause, Pause beenden, Ausstempeln – mit Live-Zeit für heute |
| 📷 **Zettel-Scan** | Stundenzettel (Bon vom Zeiterfassungs-Terminal) fotografieren – Arbeitsblöcke und Pausen werden **offline** erkannt und übernommen |
| ✅ **Gegencheck** | Die erkannte Tagessumme wird mit der gedruckten Summe verglichen; passt etwas nicht, ist der Tag gelb markiert |
| 🔁 **Täglich neu scannen** | Wächst dein Zettel jeden Tag um einen Tag, scannst du einfach den ganzen Zettel – vorhandene Tage werden übersprungen, geänderte ersetzt |
| ✏️ **Nachtragen & Bearbeiten** | Vergessene Tage eintragen, Zeiten und Pausen korrigieren, Notizen – auch für Schichten über Mitternacht |
| 📅 **Verlauf** | Monatsansicht mit Tagessummen, Pausen und allen Einträgen |
| ⚖️ **Soll / Ist / Saldo** | Sollstunden und Arbeitstage einstellen, Überstundenkonto über alle Monate, Startsaldo für alte Überstunden |
| ☕ **Mindestpause** | Optional: gesetzliche Pause (30 Min. ab 6 Std., 45 Min. ab 9 Std.) automatisch abziehen |
| 📤 **Export** | Monat als CSV (öffnet direkt in Excel), Backup und Wiederherstellung als JSON |
| 🔄 **Updates** | Die App meldet sich, wenn es eine neue Version gibt – ein Tipp lädt sie herunter |
| 🌙 **Hell & Dunkel** | Folgt automatisch dem Design deines Handys |

## 🚀 Loslegen

1. **[Stempeluhr.apk](https://github.com/Barry2040/stempeluhr/releases/latest/download/Stempeluhr.apk)** auf dem Handy herunterladen.
2. Datei öffnen und **„Installation aus unbekannten Quellen“** für Browser bzw. Dateimanager erlauben.
3. In den **Einstellungen** Sollstunden pro Tag und deine Arbeitstage eintragen – fertig.

> [!TIP]
> **Updates:** Gibt es eine neue Version, erscheint auf „Heute“ der Hinweis **„Update verfügbar“**. Auf **„Jetzt laden“** tippen,
> Download öffnen, **„Installieren“** – deine Daten bleiben erhalten. In den Einstellungen kannst du auch selbst nach Updates suchen.

## 📷 Stundenzettel scannen

Auf **„Heute“** → **📷 Zettel fotografieren** oder **🖼️ Zettel aus Galerie**. Die App erkennt Zettel in diesem Aufbau:

```
Montag, 2. November 2026 (06:48)
02.11. 09:53:10 - 02.11. 14:05:21
02.11. 14:29:05 - 02.11. 17:05:17
```

Jede Zeile ist ein Arbeitsblock, die Lücke dazwischen wird als Pause eingetragen. In der Vorschau siehst du jeden Tag mit
Status (**neu**, **schon vorhanden**, **ersetzt vorhandene …**) und wählst per Haken, was übernommen wird.

> [!NOTE]
> Für gute Ergebnisse: Zettel flach hinlegen, gerade von oben, gutes Licht, ganz im Bild. Angeschnittene Ziffern am Zeilenanfang
> sind kein Problem – das Datum kommt aus der Tagesüberschrift. Unter **„Erkannter Text“** siehst du, was die Texterkennung gelesen hat.
> Dein Zettel sieht anders aus? Lege ein [Issue](https://github.com/Barry2040/stempeluhr/issues) mit einem Foto an (persönliche Daten vorher schwärzen).

## 🧪 Teststatus

| Bereich | Status |
|---|---|
| Stempeln, Pausen, Nachtragen, Verlauf, Saldo | ✅ getestet (Browser) |
| Erkennung des Zettel-Formats inkl. typischer OCR-Fehler (O/0, l/1, ;/:) | ✅ getestet (mit Text eines echten Zettels) |
| Zettel-Scan mit Kamera auf dem Handy | ungetestet |
| CSV-Export, Backup und Update-Download in der App | ungetestet |

## 🔒 Datenschutz

Die App hat **kein Konto und keinen Server**. Einträge und Einstellungen liegen nur auf deinem Handy. Beim Deinstallieren
sind sie weg – darum gibt es das Backup unter **Einstellungen → Daten**.

- **Texterkennung:** Fotos werden mit **Google ML Kit direkt auf dem Gerät** gelesen und nicht hochgeladen. ML Kit sendet laut Google
  allerdings anonyme Nutzungs- und Leistungsdaten an Google.
- **Update-Prüfung:** Beim Start fragt die App bei der GitHub-API nach der neuesten Version; dabei sieht GitHub deine IP-Adresse.
  Lässt sich in den Einstellungen abschalten.

## 👩‍💻 Für Entwickler

<details>
<summary>Aufbau, lokal testen, Build</summary>

- Die ganze App ist eine Web-App: [`www/index.html`](www/index.html) (Oberfläche + Logik) und [`www/scan.js`](www/scan.js)
  (Zettel-Erkennung, ohne UI – auch in Node testbar). Gespeichert wird in `localStorage`.
- [Capacitor](https://capacitorjs.com) verpackt sie als Android-App; Kamera und Galerie laufen über ein normales `<input type="file">`.
- **Lokal testen:** `npx http-server www` – alles außer Scan und Export läuft im Browser.
- **Build:** Jeder Push auf `main` baut per GitHub Actions ([`android.yml`](.github/workflows/android.yml)) die APK, setzt die
  Build-Nummer (`www/version.js`, `versionCode`) und veröffentlicht sie als Release `build-N`. Die App vergleicht ihre Build-Nummer
  mit dem neuesten Release.
- **Signierung:** Der Schlüssel liegt als Secret `KEYSTORE_B64` im Repo, damit jede neue APK über die alte installiert werden kann.
  Ein Fork braucht einen eigenen Schlüssel (ohne Secret signiert Gradle mit einem zufälligen Debug-Schlüssel).

</details>

## 🙏 Quellen & Danke

| Projekt | Wofür | Lizenz |
|---|---|---|
| [Capacitor](https://capacitorjs.com) | Web-App als Android-App, Dateien & Teilen | MIT |
| [@capacitor-mlkit/text-recognition](https://github.com/capawesome-team/capacitor-mlkit) | Texterkennung in der App | Apache-2.0 |
| [Google ML Kit Text Recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2) | Texterkennung auf dem Gerät | [ML Kit Terms](https://developers.google.com/ml-kit/terms) |
