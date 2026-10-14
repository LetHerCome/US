# US Privacy Policy — DRAFT

> English version of `PRIVACY_POLICY_DRAFT.md`, updated on 14/10/2026. The Italian draft is the reference: change both together. To be reviewed by a legal adviser (D-10) and proofread by a native English speaker before publication. Fields in square brackets are filled in by Francesco. Parts marked [DEPENDS …] apply only once the named PR is on `main`: [DEPENDS #190] account deletion; [DEPENDS #196] leaving the couple, reports and data copy; [DEPENDS LOCATION] approximate location (option A, decided on 14/10).

Last updated: [DATE]

## 1. Who we are
US is an app for couples. Data controller: [NAME OR BUSINESS NAME], [ADDRESS], email [SUPPORT EMAIL].

## 2. What data we process and why

| Data | Why | Legal basis |
|---|---|---|
| Email and password (the password is never stored in plain text: the authentication provider only stores a hash) | creating and protecting your account | performance of a contract |
| Name, couple name, date your relationship started | running your shared space | performance of a contract |
| Photos, voice notes, messages, answers, moods, calendar events, lists, games; videos only in "Left for you", up to 30 seconds or 20 MB | showing them to your partner, which is what the app is for | performance of a contract |
| Approximate location of this phone, only if you turn the feature on and only while the app is open [DEPENDS LOCATION] | working out the distance between you | consent, which you can withdraw at any time in the app (Settings › Location › Stop and delete) or in your phone settings |
| Device notification token and installation identifier | sending you the notifications you turned on | performance of a contract |
| Progress and activity in the app (for example games completed) | making the app's features work | performance of a contract |
| Text you type in the music search | finding the song on Spotify | performance of a contract |
| Reports you send us: the reason you pick and the text you write [DEPENDS #196] | looking into the problem and, if needed, removing content or suspending an account | legitimate interest in keeping the service safe, and legal obligations |

We do not use your data for advertising, we do not sell it, and we do not use analytics or tracking tools. Fingerprint or face unlock happens on your phone: we never receive biometric data.

**Location** [DEPENDS LOCATION]. Before asking for permission, the app explains what location is for. We only use approximate location: your phone rounds it before sending it, and our server only stores it at that precision. The distance between you is worked out by the server. Your partner only sees the distance, in the app and in the Us widget on the home screen (under 3 km just "close by"), never where you are. "Stop and delete" stops sharing and deletes your saved location straight away.

## 3. Who sees your data
- **Your partner** sees what you post in your shared space and, if you turn on location, only the distance between you.
- **Providers** that process data on our behalf:
  - Supabase (database, authentication, file storage), region [SUPABASE REGION];
  - Google Firebase Cloud Messaging (notifications);
  - Cloudflare (delivery of the web app).
- **Spotify** receives the text you search for, sent by our server without anything that identifies you. When you open a song, the player is loaded directly from Spotify and Spotify's privacy policy applies.
- Public authorities, only where the law requires it.

Some providers may process data outside the European Economic Area, with the safeguards required by the GDPR (standard contractual clauses or adequacy decisions). [TO BE CHECKED against provider regions and contracts]

## 4. Security
Connections are encrypted (HTTPS). Database rules limit access to your data to your couple. Files are served through temporary links.

## 5. How long we keep data
For as long as your account is active, with these exceptions:
- "Left for you" items that have been opened are deleted 30 days after opening, unless they were kept in Memories;
- your location is only stored while you share it: "Stop and delete" deletes it straight away [DEPENDS LOCATION];
- reports are deleted 12 months after they are sent [DEPENDS #196];
- the copy of your data we send you on request is deleted after 7 days [DEPENDS #196].

[DEPENDS #190] When you ask to delete your account, once you confirm your password, the account is deleted straight away and cannot be recovered. File removal is completed within 30 days. For 12 months we keep only a technical deletion receipt (account and couple identifiers, dates, outcome), with no content.

[DEPENDS SUPABASE PLAN, D-8] We do not currently keep database backups. If we turn them on, this paragraph will say how long backups are kept before being overwritten.

## 6. Deleting your account [DEPENDS #190]
You can ask for deletion in the app (Settings › Privacy and data › Delete account), on the page https://[DOMAIN]/elimina-account, or by writing to [SUPPORT EMAIL].

We delete your profile and your personal data: answers, moods, quizzes, location, devices and notifications, stories, personal appointments, and scheduled messages not yet delivered. What you shared in your couple space (Moments and photos, messages already delivered, shared appointments and events, wishes, the "Left for you" items your partner kept, your couple's story) stays with your partner, without your name; your partner can delete it. If you were the last member of the couple, the whole space is deleted. You can ask for a copy of your data before deletion (see section 9).

## 7. Leaving the couple [DEPENDS #196]
You can leave the couple without deleting your account (Settings › You two › Leave the couple), confirming with your password. The couple space closes straight away and neither of you can get back into it. The same rules as for deletion apply: we delete your personal data from that couple, while what you shared in the couple space stays with your partner, without your name. Your account stays: you can create a new space or accept a new invitation. If you were the last member of the couple, the whole space is deleted.

## 8. Reports [DEPENDS #196]
You can report a problem or a piece of content from Settings › App and support › Report a problem or content, by picking a reason and writing what happened, or by writing to [SUPPORT EMAIL]. Only the US team reads reports, never your partner. We read every report and, if content or an account breaks the terms, we may remove the content or suspend the account. We keep a report for 12 months after it is sent; if you delete your account in the meantime, it stays without your name.

## 9. Your rights
You have the right to access, rectify, erase, restrict and port your data and to object to its processing, and you can withdraw your consent to location at any time. To get a copy of your data, or to exercise any other right, write to [SUPPORT EMAIL]: we reply within 30 days. The copy comes by email: a file with your data and links to your photos, valid for 7 days, without anything your partner wrote [DEPENDS #196]. You can lodge a complaint with the Italian data protection authority, the Garante per la protezione dei dati personali (garanteprivacy.it), or with the authority where you live.

## 10. Minors
US is for adults only: when you sign up you confirm that you are at least 18. We do not knowingly collect data from anyone under 18; if we find out an account belongs to a minor, we close it.

## 11. Changes
If we change this policy, we update the date at the top and, for important changes, we tell you in the app.
