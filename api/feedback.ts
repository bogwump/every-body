import nodemailer from 'nodemailer';

// Server-side only: this address is never rendered in the UI.
const TO_EMAIL = 'b0gwump@outlook.com';

function safeString(v: unknown, max = 5000) {
  const s = typeof v === 'string' ? v : '';
  return s.trim().slice(0, max);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const subject = safeString((req.body as any)?.subject, 140) || 'Feedback';
  const message = safeString((req.body as any)?.message, 8000);
  const email = safeString((req.body as any)?.email, 200);
  const meta = (req.body as any)?.meta;

  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  // Configure SMTP via env vars (set in Vercel Project Settings -> Environment Variables)
  // Example (Office 365 / Outlook SMTP):
  // SMTP_HOST=smtp.office365.com
  // SMTP_PORT=587
  // SMTP_USER=<your SMTP username>
  // SMTP_PASS=<your SMTP password or app password>
  // SMTP_FROM="EveryBody Feedback" <SMTP_USER>
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || (user ? `EveryBody Feedback <${user}>` : undefined);

  if (!host || !user || !pass || !from) {
    res.status(500).json({
      error:
        'Feedback sending is not configured yet. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in your environment variables.',
    });
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const lines: string[] = [];
  if (email) lines.push(`Reply-to: ${email}`);
  lines.push('');
  lines.push(message);
  lines.push('');
  if (meta) {
    try {
      lines.push('---');
      lines.push('Meta');
      lines.push(JSON.stringify(meta, null, 2));
    } catch {
      // ignore
    }
  }

  await transporter.sendMail({
    from,
    to: TO_EMAIL,
    subject: `EveryBody: ${subject}`,
    text: lines.join('\n'),
    replyTo: email || undefined,
  });

  res.status(200).json({ ok: true });
}
