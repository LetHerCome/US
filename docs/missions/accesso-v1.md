# Mission — Accesso V1: registrazione con email e accesso con Google

**Status:** IN BRANCH
**Branch:** `claude/accesso-email-google` (da `main` dopo #228)
**Origine:** test chiuso su Play (12+ tester per 14 giorni). Il founder il 25/10/2026: «non possiamo sbloccare la registrazione in produzione prima di darla ai test? o collegare l'accesso con google»; poi «facciamo sia mail con gmail che accesso con google».

## 1. Registrazione con email (produzione)

- Il codice S3.1 era pronto dietro `PRODUCTION_SIGNUP_RELEASED` in `public-auth.js`: ora è `true`, e `supabase/config.toml` dichiara `enable_signup = true` con `[auth.email] enable_confirmations = true`.
- **Email:** conferma dell'indirizzo e recupero password partono dal Gmail di Moonee Lab (`moonee.team@gmail.com`) via SMTP: `smtp.gmail.com`, porta 587, con una password per le app. È il founder a inserirla in Supabase › Authentication › SMTP: non passa mai da GitHub, dalla chat o dai log. Non serve un dominio. Gmail regge circa 500 email al giorno.
- **Interruttore di emergenza:** «Allow new users to sign up» in Supabase. Se lo spegni, nessuno si registra più e chi ha già un account continua ad accedere.
- I link delle email aprono il web (`https://us-a33.pages.dev`). Chi conferma l'indirizzo poi accede dall'app con email e password.

## 2. Accesso con Google

- **Android:** `native-plugins/us-google-signin`, un plugin nostro sopra Android Credential Manager con «Accedi con Google» (`GetSignInWithGoogleOption`). Restituisce solo l'ID token di Google, legato al nonce che crea l'app. Niente pacchetti di terze parti: quello di Capgo includerebbe l'SDK di Facebook e quindi l'ID pubblicità, vietato dal controllo AAB e dichiarato assente su Play.
- **Supabase:** `google-auth.js` passa l'ID token a `signInWithIdToken({ provider: 'google', token, nonce })`. A Google va lo SHA-256 del nonce, a Supabase il nonce in chiaro.
- **Web:** il redirect Google di Supabase (`signInWithOAuth`), con ritorno a `https://us-a33.pages.dev/`.
- **Dove compare:** «Continua con Google» sotto «Accedi», solo se la registrazione è aperta (`usS31Auth`) e `WEB_CLIENT_ID` in `google-auth.js` è impostato. Il client ID è pubblico, non è un segreto.
- **18+ e Termini:** un account Google li conferma una volta, nella schermata «Prima di entrare», prima che l'app legga qualsiasi dato di coppia (controllo in `app.js` `initCloud`, prima di `usOnboarding.load`). Il consenso viene salvato come per la registrazione con email: `user_metadata.terms_accepted_at` e `locale`, scritti da `public-auth.js` `acceptTerms`. «Annulla ed esci» chiude la sessione.
- **Stessa email:** Supabase collega l'identità Google all'account email che ha lo stesso indirizzo verificato.
- **Eliminare l'account e uscire dalla coppia:** chi non ha una password conferma con Google, scegliendo lo **stesso** account Google. Un account diverso viene rifiutato prima di arrivare a Supabase. L'Edge accetta il metodo `amr` `oauth` (la grant `id_token` di Supabase) come la `password`, sempre entro 10 minuti. Sul web, per gli account Google, si usa l'app oppure si scrive al supporto. La pagina `/elimina-account` lo spiega.
- **Informativa** (IT/EN, 25/10): i dati che Google ci passa (email, nome, immagine, identificativo) e Google come fornitore. Nello stesso aggiornamento: i backup giornalieri di Supabase, conservati 7 giorni.

## 3. Cosa configura il founder

- **Google Cloud** (progetto US):
  - schermata del consenso OAuth;
  - un client **Web** con redirect `https://iiakdfsxpywdkxravqjh.supabase.co/auth/v1/callback`, più quello di staging;
  - client **Android** per `com.usapp.us`, con lo SHA-1 della chiave di firma di Play e della chiave di caricamento;
  - client **Android** per `com.usapp.us.staging`, con lo SHA-1 della chiave di staging.
- **Supabase** (staging, poi produzione), in Authentication › Providers › Google:
  - client ID e secret del client Web;
  - «Skip nonce check» spento.
- **Il client ID Web** va scritto in `google-auth.js` `WEB_CLIENT_ID`: finché resta vuoto il pulsante non compare.

## Acceptance

- `tests/google-auth-v1.test.js` verifica:
  - il nonce (hash a Google, valore in chiaro a Supabase);
  - un altro account Google rifiutato;
  - la conferma 18+ prima di qualsiasi lettura;
  - eliminazione e uscita confermate con Google.
- `tests/s32-account-deletion-core.test.mjs` verifica che `oauth` entro 10 minuti sia accettato, e che oltre quel limite, o con `token_refresh`, non lo sia.
- Il test JVM `UsGoogleSignInPolicyTest` verifica il client ID, il nonce e i codici d'errore brevi.
- Prima della produzione, su staging: registrazione con email ricevuta e confermata, recupero password, accesso con Google su Android, «Prima di entrare», eliminazione di un account Google.
