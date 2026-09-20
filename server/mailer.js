// Sending email, kept behind one tiny interface so the provider can change:
//   mailer.enabled           can this server send mail at all?
//   mailer.send({ to, subject, text, html })   resolves, or throws
//
//   BREVO_API_KEY + EMAIL_FROM   send through Brevo (free plan, no domain needed to start)
//   otherwise, outside production   print the message to the console (local development)
//   otherwise                   disabled: the "Forgot password?" link is hidden

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const isProduction = (env) => env.NODE_ENV === 'production' || Boolean(env.VERCEL);

export function createMailer(env = process.env, fetchImpl = globalThis.fetch) {
  const apiKey = env.BREVO_API_KEY;
  const from = env.EMAIL_FROM;

  if (apiKey && from) {
    return {
      enabled: true,
      kind: 'brevo',
      async send({ to, subject, text, html }) {
        const res = await fetchImpl(BREVO_URL, {
          method: 'POST',
          headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            sender: { email: from, name: env.EMAIL_FROM_NAME || 'DevLog' },
            to: [{ email: to }],
            subject,
            textContent: text,
            htmlContent: html,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          // Never include the request (it carries the key); the provider's reply is enough to debug.
          const detail = await res.text().catch(() => '');
          throw new Error(`Brevo responded ${res.status}: ${detail.slice(0, 200)}`);
        }
      },
    };
  }

  if (!isProduction(env)) {
    return {
      enabled: true,
      kind: 'console',
      async send({ to, subject, text }) {
        console.log(`\n--- email (not sent: no provider configured) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---`);
      },
    };
  }

  return {
    enabled: false,
    kind: 'none',
    async send() {
      throw new Error('Email is not configured on this server.');
    },
  };
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function resetEmail({ link, minutes }) {
  const text = [
    'Someone asked to reset the password for your DevLog account.',
    '',
    'If that was you, choose a new password here:',
    link,
    '',
    `This link works once and expires in ${minutes} minutes.`,
    "If you didn't ask for this, ignore this email. Your password won't change.",
  ].join('\n');

  const html = `<p>Someone asked to reset the password for your DevLog account.</p>
<p>If that was you, <a href="${escapeHtml(link)}">choose a new password</a>.</p>
<p style="color:#666">This link works once and expires in ${minutes} minutes. If you didn't ask for this, ignore this email. Your password won't change.</p>`;

  return { subject: 'Reset your DevLog password', text, html };
}
