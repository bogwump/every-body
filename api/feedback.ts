import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function safeString(v: unknown, max = 5000) {
  const s = typeof v === 'string' ? v : '';
  return s.trim().slice(0, max);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const subject = safeString(req.body?.subject, 140) || 'Feedback';
    const message = safeString(req.body?.message, 8000);
    const replyEmail = safeString(req.body?.email, 200);

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    await resend.emails.send({
      from: 'EveryBody <onboarding@resend.dev>', // safe default
      to: 'b0gwump@outlook.com',
      subject: `EveryBody feedback: ${subject}`,
      text: `
${message}

Reply email: ${replyEmail || 'Not provided'}
      `,
      reply_to: replyEmail || undefined,
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Feedback send error:', err);
    return res.status(500).json({ error: 'Could not send' });
  }
}