# Raccoglitore

Il portfolio delle carte Pokémon, con **lingua** e **condizione** di ogni copia.
Web app installabile sul telefono: cerca una carta nel catalogo, scegli com'è la tua copia e il valore si calcola dai prezzi Cardmarket.

**App online: <https://pokebndr.github.io/Raccoglitore/>**

## Cosa fa

- Catalogo completo con immagini: internazionale (nomi in italiano e inglese), giapponese, coreano, cinese.
- Ricerca per nome, per `nome numero/totale` (es. `pikachu 58/102`) o solo `numero/totale`; sfoglia per set, con il conteggio di quante carte hai.
- Prezzi Cardmarket (tendenza, media di 1, 7 e 30 giorni, minimo) per ogni versione della carta: normale, reverse, 1ª edizione, shadowless…
- Ogni copia ha lingua, condizione (MT → PO) o gradazione, quantità, prezzo pagato.
  Valore = prezzo Cardmarket × moltiplicatore condizione × moltiplicatore lingua; un «Prezzo tuo» sostituisce il calcolo.
- Prodotti sigillati di ogni espansione (buste, display, ETB, tin, collezioni, mazzi): si trovano nella pagina del set,
  sotto «Sigillati», o cercandoli per nome; entrano nel portfolio con lingua, quantità e prezzo pagato.
- Dalla copia, un tocco apre le offerte Cardmarket filtrate per quella lingua e condizione, e i venduti eBay di quella carta.
- Andamento del valore giorno per giorno, guadagno sul pagato, copia di sicurezza su file.
- Funziona anche senza rete con gli ultimi prezzi salvati.

## Aspetto

Tela nera con una griglia di puntini, pannelli «in vetro» illuminati da un bordo in un solo colore, numeri principali disegnati a punti (matrice 5×7), comandi a cerchio e a pillola, barra di navigazione flottante in basso. Carattere: Urbanist.
Il tema è uno solo, scuro. Gli angoli a «squircle» dei pannelli si vedono nei browser che li supportano; negli altri sono normali angoli arrotondati.

## Da dove arrivano i dati

| Cosa | Fonte |
| --- | --- |
| Catalogo e immagini | [TCGdex](https://tcgdex.dev), database aperto |
| Prezzi | il listino che Cardmarket pubblica ogni giorno, letto tramite TCGdex |
| Prodotti sigillati | elenco prodotti e listino pubblici di Cardmarket, riletti una volta al giorno |
| Venduti eBay | per ora un link alla ricerca dei venduti su eBay |

Cardmarket pubblica un solo listino per carta e per prodotto, senza distinguere lingua e condizione: per questo esistono i moltiplicatori e il «Prezzo tuo».
Le carte giapponesi, coreane e cinesi sono invece prodotti a sé, con un loro listino: vanno prese dal loro catalogo.

Una pagina web non può leggere i file di Cardmarket direttamente. Li legge `scripts/build-sealed.mjs` quando il sito viene
costruito (a ogni modifica e ogni mattina) e ne ricava `data/sealed.json`, che l'app carica dal proprio indirizzo.
Le espansioni di Cardmarket sono collegate ai set del catalogo con `scripts/expansions-seed.json` e, per i set che lì
mancano, guardando a quale espansione appartengono le loro carte. Quanto è completo il risultato (quanti set hanno i loro
sigillati, quali no e perché) è scritto in `data/sealed-report.json`, pubblicato accanto all'elenco.

### Prezzi per lingua: prova con CardTrader

Per far pesare la lingua da sola servono prezzi distinti per lingua, e Cardmarket non li pubblica. Li ha
[CardTrader](https://www.cardtrader.com), che li dà a chi ha un account tramite un token personale.
`scripts/cardtrader-probe.mjs` è una prova: fa qualche decina di domande a CardTrader e scrive le risposte in
`data/cardtrader-*.json` (solo numeri e nomi dei campi: niente venditori, niente dati dell'account), per decidere su
dati veri come usarli. Non fa nulla finché nel repository non c'è il segreto `CARDTRADER_TOKEN`
(**Settings → Secrets and variables → Actions → New repository secret**). Il token non va mai scritto nei file.
La collezione è salvata nel browser del dispositivo (IndexedDB); non c'è ancora un account né la sincronizzazione.

## Comandi

```bash
npm install
npm run dev            # sviluppo
npm run build          # app da pubblicare → dist/
npm run build:single   # un solo file HTML da aprire sul computer → dist-single/index.html
npm run data           # prodotti sigillati e prezzi da Cardmarket → public/data/sealed.json
npm run data:test      # lo stesso, ma dai dati di prova in tests/fixtures
npm test               # controlli su prezzi, link, ricerca, prodotti sigillati e prova di CardTrader
npm run test:live      # interroga le fonti vere e verifica che rispondano come l'app si aspetta
```

`tests/e2e.mjs` e `tests/pwa.mjs` provano l'app in un browser grande come un telefono.
Hanno bisogno di una copia locale del server TCGdex (`REPLICA_URL`), che risponde al posto del catalogo pubblico.

## Pubblicazione

La cartella `dist/` è un sito statico: va bene qualsiasi hosting (GitHub Pages, Netlify, Cloudflare Pages, Vercel).
Con GitHub Pages basta il flusso già pronto in `.github/workflows/pubblica.yml`:

1. carica il progetto in un repository, ramo `main`;
2. nel repository: **Settings → Pages → Source: GitHub Actions**;
3. a ogni modifica del ramo `main`, e ogni mattina per i prezzi dei sigillati, il sito si ripubblica da solo.

Serve HTTPS (lo danno tutti gli hosting citati) perché l'app sia installabile e funzioni offline.

## Struttura

```
src/lib/tcgdex.ts    catalogo: ricerca, set, carte, immagini
src/lib/sealed.ts    prodotti sigillati: elenco, ricerca, collegamento ai set
src/lib/pricing.ts   dal listino Cardmarket al valore di una copia
src/lib/store.ts     collezione, impostazioni, storico, aggiornamento prezzi, backup
src/lib/links.ts     link a Cardmarket e ai venduti eBay
src/views/           le pagine: Portfolio, Cerca, Set, carta, copia, Altro
src/components/      modulo della copia, grafico, numeri a punti, pannelli a scorrimento…
src/styles.css       tutto l'aspetto: colori dei pannelli, griglia, comandi
```

Progetto personale, non affiliato a The Pokémon Company, Nintendo, Cardmarket o eBay.
