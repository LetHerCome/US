// US — outgoing email, pluggable. PURE module (fetch injected).
//
// The provider is not chosen yet (founder: support address and domain come
// later). Until US_EMAIL_PROVIDER is set, createEmailSender returns null and
// callers fall back to a manual hand-off by the operator. Adding a provider
// means adding one branch here; callers only see send({to, subject, text}).

const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;

export function isEmailAddress(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL.test(value.trim());
}

export function createEmailSender(env, fetchImpl) {
  const provider = String(env?.US_EMAIL_PROVIDER || '').trim().toLowerCase();
  if (!provider || provider === 'manual') return null;
  const from = String(env?.US_EMAIL_FROM || '').trim();
  const key = String(env?.US_EMAIL_API_KEY || '').trim();
  if (!key || !from || typeof fetchImpl !== 'function') return null;
  if (provider === 'resend') {
    return async ({ to, subject, text }) => {
      if (!isEmailAddress(to)) return { ok: false, code: 'recipient_invalid' };
      let response;
      try {
        response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to.trim()], subject, text }),
        });
      } catch {
        return { ok: false, code: 'email_network' };
      }
      return response && response.status >= 200 && response.status < 300
        ? { ok: true }
        : { ok: false, code: `email_http_${Number(response?.status) || 0}` };
    };
  }
  return null;
}

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
  } catch {
    return String(iso).slice(0, 10);
  }
};

// User-facing text (Italian; the design thread translates it with the app).
export function exportEmail({ link, expiresAt, supportEmail }) {
  return {
    subject: 'La copia dei tuoi dati di US',
    text: [
      'Ciao,',
      '',
      `ecco la copia dei tuoi dati di US che ci hai chiesto: ${link}`,
      '',
      `Il link funziona fino al ${formatDate(expiresAt)}. Dentro trovi un file con le tue risposte, il tuo umore, i tuoi impegni e quello che hai creato nello spazio di coppia, con i link per scaricare le tue foto.`,
      'Non contiene quello che ha scritto la tua persona: sono dati suoi.',
      '',
      `Se non hai chiesto tu questa copia, scrivici subito a ${supportEmail}.`,
      '',
      'US',
    ].join('\n'),
  };
}
