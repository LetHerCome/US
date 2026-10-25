# Accesso V1 — cosa configura il founder (Gmail, Supabase, Google Cloud)

Ordine: **prima staging** (`dugmhngrfkuieeletatb`), si prova sull'APK di staging, **poi produzione** (`iiakdfsxpywdkxravqjh`). Password e secret li inserisci solo tu, direttamente nei siti: non vanno in chat, su GitHub o nei log. Missione: [accesso-v1](../missions/accesso-v1.md).

## 1. Gmail: la password per le app (una volta)

1. Accedi a https://myaccount.google.com con **moonee.team@gmail.com** › **Sicurezza**.
2. Attiva la **Verifica in due passaggi**, se è spenta.
3. Cerca **«Password per le app»** (dalla barra di ricerca in alto). Crea una password chiamata `US Supabase`.
4. Google mostra 16 lettere: copiale e incollale subito al punto 2. Non salvarle altrove: se le perdi, ne crei un'altra.

## 2. Supabase: email (staging, poi produzione)

**Authentication › Emails › SMTP Settings** › attiva **Enable custom SMTP**:

| Campo | Valore |
|---|---|
| Sender email | `moonee.team@gmail.com` |
| Sender name | `US` |
| Host | `smtp.gmail.com` |
| Port | `587` |
| Username | `moonee.team@gmail.com` |
| Password | la password per le app del punto 1 |
| Minimum interval | 60 secondi (predefinito) |

**Authentication › Rate Limits:** «Rate limit for sending emails» a **30 all'ora**.

**Authentication › Sign In / Providers › Email:**
- «Allow new users to sign up» **acceso**;
- «Confirm email» **acceso**;
- «Minimum password length» **10**.

Prima di accendere «Confirm email» in produzione, controlla in Authentication › Users che tutti gli account che esistono già risultino *confermati*.

**Authentication › Emails › Templates**: usa questi testi al posto di quelli inglesi.

**Confirm signup.** Oggetto: `Conferma la tua email per US`

```html
<h2>Benvenuto in US</h2>
<p>Per attivare il tuo account conferma questo indirizzo email.</p>
<p><a href="{{ .ConfirmationURL }}">Conferma la mia email</a></p>
<p>Poi torna in US e accedi con email e password.</p>
<p>Se non hai creato tu un account US, ignora questo messaggio.</p>
```

**Reset password.** Oggetto: `Scegli una nuova password per US`

```html
<h2>Nuova password</h2>
<p>Hai chiesto di recuperare l'accesso a US.</p>
<p><a href="{{ .ConfirmationURL }}">Scegli una nuova password</a></p>
<p>Il link vale un'ora. Se non l'hai chiesto tu, ignora questo messaggio: la password resta quella di prima.</p>
```

## 3. Google Cloud: il progetto e i client (una volta)

1. Apri https://console.cloud.google.com con l'account Google di Moonee Lab › **Nuovo progetto** «US».
2. **Google Auth Platform › Branding:**
   - nome app «US»;
   - email di assistenza `moonee.team@gmail.com`;
   - nessun logo per ora: con il logo Google chiede una verifica;
   - link Privacy `https://us-a33.pages.dev/privacy` e Termini `https://us-a33.pages.dev/termini`;
   - domini autorizzati: `supabase.co`.
3. **Audience:** «Esterno», poi **Pubblica l'app**. Con i soli dati di base (email, nome, immagine) non serve la verifica di Google.
4. **Clients › Crea client › Applicazione web**, chiamato «US Supabase»:
   - URI di reindirizzamento autorizzati:
     - `https://dugmhngrfkuieeletatb.supabase.co/auth/v1/callback`
     - `https://iiakdfsxpywdkxravqjh.supabase.co/auth/v1/callback`
   - Origini JavaScript: `https://us-a33.pages.dev`
   - Copia **ID client** e **secret client**.
5. **Clients › Crea client › Android**, uno per ogni impronta:
   - **US Play (firma)**: pacchetto `com.usapp.us`, con lo SHA-1 di Play Console › Test e rilascio › Configurazione › **Firma dell'app** › «Certificato della chiave di firma dell'app».
   - **US Play (caricamento)**: pacchetto `com.usapp.us`, con lo SHA-1 del «Certificato della chiave di caricamento», nella stessa pagina.
   - **US Staging**: pacchetto `com.usapp.us.staging`, con lo SHA-1 della chiave di staging. Questo te lo ricavo io dal workflow di staging.

   I client Android non hanno un secret: servono solo a Google per riconoscere l'app.

## 4. Supabase: Google (staging, poi produzione)

**Authentication › Sign In / Providers › Google** › attiva:
- **Client IDs:** l'ID client **Web** del punto 3.4;
- **Client Secret:** il secret client Web;
- **Skip nonce check:** **spento**.

## 5. Cosa mandi a Claude

Solo l'**ID client Web**: finisce in `google-auth.js` (`WEB_CLIENT_ID`) ed è pubblico. Il secret resta solo in Supabase.

## 6. Dopo (Claude, ognuna con il tuo OK)

1. Client ID nel codice, branch di staging aggiornato, APK di staging, prova insieme.
2. In produzione:
   - Edge `delete-account` e `leave-couple` (accettano la conferma con Google);
   - punti 2 e 4 sulla produzione;
   - merge della PR (web);
   - AAB per il test interno, poi il test chiuso.
