# US 1.0 — Procedura per le segnalazioni

**Data:** 2026-10-14 · **Per:** chi gestisce il supporto di US · **Stato:** bozza da rivedere con il legale prima della pubblicazione.

Le segnalazioni arrivano da Impostazioni → Segnala un problema o un contenuto, oppure per email al supporto. Il partner della persona che segnala non le vede mai.

## 1. Controllare le segnalazioni

Almeno una volta al giorno lavorativo, dalla dashboard Supabase di **produzione** → SQL Editor:

```sql
select id, created_at, category, details, couple_id
from public.user_reports
where status = 'open'
order by (category = 'minor_safety') desc, created_at;
```

Prima `minor_safety`, poi `person`, poi `content`, poi `app_problem`.

Quando la prendi in carico: `update public.user_reports set status = 'in_review' where id = '…';`

## 2. Decidere

| Situazione | Cosa fare |
|---|---|
| Pericolo immediato per qualcuno | Rispondere indicando il **112**. Non aspettare altre verifiche. |
| Contenuto che riguarda un minore (abuso, sfruttamento) | Non aprire né copiare il file oltre il necessario. Segnalare subito alla **Polizia Postale** (commissariatodips.it), conservare id e data della segnalazione, rimuovere il contenuto (§3) e sospendere l'account (§4). |
| Contenuto illegale o offensivo, molestie, minacce | Rimuovere il contenuto (§3). Se si ripete o è grave: sospendere l'account (§4). |
| Problema dell'app | Aprire un issue sul repository, senza dati personali. |
| Nulla da fare | Chiudere come `dismissed`. |

Ricordare a chi segnala che può sempre uscire dalla coppia (Impostazioni → Voi → Esci dalla coppia) o eliminare l'account.

## 3. Rimuovere un contenuto

Dalla dashboard di produzione, SQL Editor, con l'id del contenuto indicato nella segnalazione o trovato nella coppia (`couple_id` della segnalazione):

| Contenuto | Tabella | File in Storage (bucket `us-media`) |
|---|---|---|
| Momento | `public.moments` (`storage_path`, `thumbnail_path`) | i due path |
| Foto di un album | `public.moment_photos` (`storage_path`) | il path |
| Storia | `public.stories` (`media_path`) | il path |
| Messaggio | `public.shared_messages` | — |
| Lasciato per te | `public.left_for_you` (`media_path`) | il path |

1. Annotare i path del file, poi `delete from public.<tabella> where id = '…' and couple_id = '…';`
2. Storage → `us-media` → cancellare i file annotati.
3. Mai cancellare righe di altre coppie: la condizione su `couple_id` è obbligatoria.

## 4. Sospendere un account

Dalla dashboard di produzione, SQL Editor:

```sql
update auth.users set banned_until = '2999-01-01' where id = '…';
```

La persona non può più accedere; i suoi dati restano finché non chiede l'eliminazione o finché il legale non indica diversamente. Per togliere la sospensione: `banned_until = null`.

## 5. Chiudere

```sql
update public.user_reports
set status = 'actioned', resolved_at = now()   -- oppure 'dismissed'
where id = '…';
```

Rispondere a chi ha segnalato solo se ha scritto per email. Le segnalazioni vengono cancellate in automatico 12 mesi dopo l'invio.
