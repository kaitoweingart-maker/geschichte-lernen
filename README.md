# Atlas Historica

Interaktive Web-App zum **Lernen von Weltgeschichte – Land für Land**.

## Features

- 🗺️ **Leaflet-Weltkarte** mit anklickbaren Ländern, Hover-Highlight, Nachbarn farblich markiert
- 📚 **23 kuratierte Länder** mit Tiefen-Inhalten:
  - Wichtigste Ereignisse (Timeline)
  - Kriege & Konflikte
  - Historische Personen
  - Beziehungen zu Nachbarn (klickbar)
  - Wohlstand, aktuelle Lage, Mentalität
  - Interessante Fakten
- 🌐 **Wikipedia-Fallback** für alle ~100 anderen Länder
- 🔍 Suche, Zufallsland-Button

## Kuratierte Länder

CH, DE, AT, FR, IT, ES, PT, GB, IE, NL, PL, GR, RU, UA, TR, IL, IR, SA, EG, ZA, US, CA, MX, BR, IN, CN, JP, KR, AU

## Lokal ausführen

```
cd ~/geschichte-lernen
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

## Deployment

Statische Site, läuft auf GitHub Pages.

```
git init && git add . && git commit -m "Initial"
git remote add origin git@github.com:kaitoweingart-maker/geschichte-lernen.git
git push -u origin main
```

Dann in GitHub: Settings → Pages → Source: `main` / root.

Live unter: `https://kaitoweingart-maker.github.io/geschichte-lernen/`

## Datenquellen

- Karten-Tiles: [Carto Dark Matter](https://carto.com/attribution/) (CC-BY)
- Länder-Geometrien: [datasets/geo-countries](https://github.com/datasets/geo-countries) (Natural Earth, public domain)
- Fallback-Texte: deutsche/englische Wikipedia REST API
