# Lagkompassen

En sökbar hemsida som listar centrala **svenska lagar och förordningar inom
miljö och hållbarhet som berör företag**. Varje lag kan generera en konkret
**checklista** för vad som behöver göras för att uppfylla kraven.

## Funktioner

- 🔎 **Sök** fritt på lagnamn, SFS-nummer, ämne eller nyckelord (t.ex. *avfall*,
  *köldmedier*, *CSRD*, *REACH*).
- 🏷️ **Filtrera** på kategori (Avfall, Kemikalier, Producentansvar,
  Hållbarhetsrapportering m.fl.).
- 📋 **Checklista per lag** – varje lag har en steg-för-steg-checklista för
  efterlevnad. Bocka av punkter; status sparas lokalt i webbläsaren.
- 🔖 **Mina listor** – skapa egna listor (t.ex. per verksamhet, projekt eller
  ansvarsområde) och spara lagar i dem via bokmärkesikonen på varje lag eller
  i lagvyn. Filtrera rutnätet till en vald lista. Listorna sparas lokalt.
- 📊 **Progressindikator** som visar hur långt du kommit per lag.
- 🖨️ **Skriv ut / spara som PDF** för en enskild lags checklista.
- 🔗 Länk till lagtexten på riksdagen.se / ansvarig myndighet.

## Köra lokalt

Det är en statisk sida utan byggsteg. Öppna `index.html` direkt, eller starta
en enkel lokal server:

```bash
python3 -m http.server 8000
# besök http://localhost:8000
```

## Struktur

| Fil | Beskrivning |
| --- | --- |
| `index.html` | Sidans struktur och layout |
| `styles.css` | All formgivning |
| `app.js` | Sök, filtrering, detaljvy och checklistlogik |
| `data.js` | Datasetet över lagar, metadata och checklistor |

## Lägga till eller uppdatera en lag

Redigera `data.js` och lägg till ett objekt i `LAWS`-listan:

```js
{
  id: "unikt-id",
  title: "Lagens namn",
  sfs: "SFS 0000:000",
  category: "Avfall",
  authority: "Tillsynsmyndighet",
  updated: "Senast ändrad 2024",
  link: "https://...",
  summary: "Kort sammanfattning...",
  appliesTo: "Vilka verksamheter som berörs...",
  keywords: ["nyckelord", "synonymer"],
  checklist: ["Punkt 1", "Punkt 2", "..."]
}
```

## Viktigt – ansvarsfriskrivning

Lagkompassen är ett **informations- och vägledningsverktyg** och utgör **inte
juridisk rådgivning**. Checklistorna är ett stöd för egenkontroll och är inte
uttömmande. Kontrollera alltid den senaste lydelsen på
[riksdagen.se](https://www.riksdagen.se) / [lagrummet.se](https://lagrummet.se)
och stäm av med din tillsynsmyndighet.
