# US — English glossary

The terms the English version uses (`i18n-en.js`). Keep them the same
everywhere: on screen, in aria labels, in notifications and in docs.

## Voice

- Warm, short, natural US English. Second person.
- "la tua persona" is "your person". "voi" / "voi due" is "you two" when it
  has to be clear that both are meant; otherwise "you".
- Typographic apostrophes and quotes in English (’ “ ”).
- Never say or imply "no subscription".
- "Eccoti di nuovo" and "Bentornato/a" are both "Welcome back".
- Maudit and US never change.

## Tabs and places

| Italian | English |
|---|---|
| Oggi | Today |
| Noi | Us |
| Ricordi | Memories |
| Gioca | Play |
| Impostazioni | Settings |
| Momenti | Moments |
| Conservati | Kept |
| Calendario | Calendar |
| Da vivere | To do together |
| Missioni | This week’s missions |
| Il punto della settimana | Weekly check-in |
| Quest, Quest di coppia (current UI wording) | quests, Couple quests |
| Il nostro giorno | Our day |
| Mese per mese | Month by month |

## Rituals

| Italian | English |
|---|---|
| Ti penso | Thinking of you |
| Lasciato per te | Left for you |
| Domanda del giorno | Question of the day |
| Sfida di oggi / Daily Challenge | Today’s challenge |

## Sync (progression)

| Italian | English |
|---|---|
| Sintonia (also "Bond" in older copy) | Sync |
| Punti Sintonia | Sync points |
| livello | level |
| Ritmo | Rhythm |
| Atmosfere | Moods |
| Atmosfera US | US mood |
| Accenti | Accents |
| Effetti di Oggi | Today effects |
| Cornici | Frames |
| Sblocco / Sbloccato | Unlock / Unlocked |
| In uso | In use |
| Incluso | Included |

Levels: Primo legame = First bond, Complici = Partners in crime,
In sintonia = In sync, Stessa frequenza = Same wavelength,
Intesa rara = Rare connection, Indivisibili = Inseparable,
Legame leggendario = Legendary bond, Noi senza limite = Us, no limits.

`fix4.js` still paints an older set of level names over these (Squadra
formata = Team formed, Risonanza = Resonance, Anime sincronizzate = Souls in
sync, Legame profondo = Deep bond, Duo leggendario = Legendary duo, Legame
mitico = Mythic bond, Legame eterno = Eternal bond). Both sets are in the
dictionary until the product picks one.

## Games

| Italian | English |
|---|---|
| Quanto mi conosci | How well do you know me |
| Scopritevi | Get to know each other |
| Ridete | Laugh together |
| Confrontatevi | Compare notes |
| Rivivete | Relive |
| E se…? | What if…? |
| Questo o quello / Swipe | This or that |
| Per voi | For you two |
| partita | round |

## Other choices

| Italian | English |
|---|---|
| impegno (calendar entry) | plan |
| Vissuta insieme / Vissuto insieme | Done together |
| Conserva | Keep |
| Mesiversario | Monthiversary |
| Promemoria | Reminder |
| Posizione | Location |
| Sincronizzazione | Data sync |
| Proteggi US | Protect US |

## How the dictionary works

- Keys are the Italian text exactly as one DOM text node or one attribute
  shows it, with spaces collapsed. Markup inside a sentence splits it into
  several nodes, and each node needs its own key.
- `{name}` keys are patterns. A captured value is translated only when it is
  itself an exact key; patterns are never applied inside a captured value, so
  plural and "1 hour / n hours" variants are written out one by one.
- The pattern with the most fixed text wins, and exact keys always win over
  patterns. Avoid short patterns like `{n} di {m}` that would also match
  Italian content from the server.
- Never add entries for what people write (names, captions, notes, answers,
  event titles): that text lives under `translate="no"`.
- Dates come from `toLocaleDateString` / month arrays and should be formatted
  in code with the active locale, not translated by the dictionary.
