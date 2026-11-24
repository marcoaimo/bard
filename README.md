# Fiati tascabili

Flauto di bambù, flauto dolce, cornamusa e tamburello da suonare sul telefono, con brani, editor di spartiti e sincronizzazione facoltativa.

È un sito statico: niente build sul server, niente dipendenze da installare. Funziona offline dopo la prima apertura e si può aggiungere alla schermata Home.

## Pubblicare su GitHub Pages

Il sito pubblicato è la cartella `docs/`.

1. Su GitHub apri **Settings → Pages**.
2. In **Build and deployment** scegli **Deploy from a branch**, ramo `main`, cartella `/docs`, poi **Save**.
3. Dopo un minuto il sito è su `https://marcoaimo.github.io/bard/`.

Sul telefono apri l’indirizzo e usa **Condividi → Aggiungi alla schermata Home** (iPhone) o **Installa app** (Android).

## Attivare la sincronizzazione (facoltativa)

Senza questi passaggi l’app salva gli spartiti solo sul dispositivo, con backup da esportare e reimportare.

1. Crea un progetto gratuito su [supabase.com](https://supabase.com).
2. Crea la tabella degli spartiti: **SQL Editor → New query**, incolla il contenuto di `supabase/schema.sql` ed esegui. Se il progetto è collegato al repository con l’integrazione GitHub di Supabase e il deploy in produzione è attivo, la stessa tabella arriva anche da `supabase/migrations/`; lo script si può eseguire più volte senza danni.
3. **Authentication → URL Configuration**: in **Site URL** e in **Redirect URLs** metti l’indirizzo del sito GitHub Pages.
4. **Authentication → Email Templates → Magic Link**: aggiungi al testo dell’email il codice `{{ .Token }}`, per esempio `Il tuo codice: {{ .Token }}`. Così puoi accedere scrivendo il codice nell’app, cosa indispensabile su iPhone quando l’app è installata nella Home.
5. **Project Settings → API**: copia **Project URL** e la chiave pubblica (**anon** o **publishable**) in `docs/config.js`.
6. Per riservare la sincronizzazione a te: esegui `supabase/allowlist.sql`, poi aggiungi la tua email con `insert into public.allowed_emails (email) values ('tua@email.it');`. Solo le email in elenco possono creare un account e leggere o scrivere spartiti. Per abilitare altre persone, aggiungi le loro email allo stesso elenco; per togliere l’accesso, cancella la riga. L’email non va nel repository, che è pubblico: si inserisce solo dal pannello di Supabase.

La chiave pubblica è pensata per stare nel browser: ogni utente vede e modifica solo i propri spartiti grazie alle regole di accesso dello script SQL. Non mettere mai in `docs/config.js` la chiave `service_role` o `secret`.

Il piano gratuito di Supabase mette in pausa i progetti con poca attività per una settimana. I dati restano e il progetto si riattiva dal pannello; nel frattempo l’app continua a funzionare sul dispositivo e sincronizza appena il cloud torna disponibile.

## Struttura

- `src/`: sorgenti dell’app (stile, markup, codice, archivio, editor, sincronizzazione, brani d’esempio)
- `build.py`: rigenera `docs/index.html`, `app.css`, `app.js`, `sw.js` e il manifest dai sorgenti; crea anche `artifact.html`, la versione a file unico
- `docs/`: il sito pubblicato
  - `config.js`: configurazione della sincronizzazione
  - `sounds/`: campioni audio, caricati solo quando scegli lo strumento
  - `vendor/`: lettore di spartiti ABC (abcjs, licenza MIT)
  - `icons/`: icone per la schermata Home
- `supabase/schema.sql`, `supabase/allowlist.sql` e `supabase/migrations/`: tabella, regole di accesso ed elenco delle email abilitate

Per modificare l’app: cambia i file in `src/`, esegui `python3 build.py`, poi commit e push.

## Crediti

Campioni audio dal progetto [FreePats](https://freepats.zenvoid.org/), in pubblico dominio (CC0): ocarina e percussioni di Xavimart con Gonzalo e Roberto, flauto dolce di Eugene Vlaskin, cornamusa di Gilles Sadowski. Brani d’esempio di pubblico dominio.
