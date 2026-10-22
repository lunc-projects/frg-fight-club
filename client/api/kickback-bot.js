// LUNC Kickback bot — Telegram webhook handler (Vercel serverless function).
// Telegram POSTs each update here; we answer /start in private chats with the
// welcome message + Open App button. Everything else is ignored.
// Env (Vercel project settings): KICKBACK_BOT_TOKEN, KICKBACK_WEBHOOK_SECRET.
const APP_URL = process.env.KICKBACK_APP_URL || 'https://frg-fight-club.vercel.app/kickback/';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (!process.env.KICKBACK_WEBHOOK_SECRET || secret !== process.env.KICKBACK_WEBHOOK_SECRET) {
    res.status(403).json({ ok: false });
    return;
  }
  const token = process.env.KICKBACK_BOT_TOKEN;
  if (!token) { res.status(200).json({ ok: true }); return; }

  const update = req.body || {};
  const msg = update.message;
  if (msg && typeof msg.text === 'string' && msg.text.startsWith('/start') && msg.chat && msg.chat.type === 'private') {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: msg.chat.id,
          text:
            '🥇 LUNC Kickback\n\nStake LUNC with the validator that shares its commission back. ' +
            'Check the live reward pool, see the top delegators, and find your kickback share.',
          reply_markup: { inline_keyboard: [[{ text: 'Open App', web_app: { url: APP_URL } }]] },
        }),
      });
    } catch (e) {
      // Never fail the webhook on a send error — Telegram would retry-storm.
      console.error('sendMessage failed', e && e.message);
    }
  }
  res.status(200).json({ ok: true });
}
