// ---------------------------------------------------------------------------
// FRG Fight Club — minimal Telegram bot (no dependencies, Node 18+).
//
// Does two things:
//   1. Sets the bot's menu button to open the game (Mini App).
//   2. Answers /start with a big "Play" button that opens the game.
//
// Run:  BOT_TOKEN=123:abc WEBAPP_URL=https://your-game.vercel.app node bot.js
// Get BOT_TOKEN from @BotFather (/newbot). WEBAPP_URL must be HTTPS.
// ---------------------------------------------------------------------------

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!BOT_TOKEN || !WEBAPP_URL) {
  console.error('Set BOT_TOKEN and WEBAPP_URL env vars first.');
  process.exit(1);
}
if (!WEBAPP_URL.startsWith('https://')) {
  console.error('WEBAPP_URL must be HTTPS — Telegram requires it for Mini Apps.');
  process.exit(1);
}

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then((r) => r.json());

async function main() {
  const me = await api('getMe');
  console.log(`Bot: @${me.result.username}`);

  // Menu button (the button next to the message box in the bot chat)
  const menu = await api('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: '🥊 Play FRG Boxing',
      web_app: { url: WEBAPP_URL },
    },
  });
  console.log('Menu button set:', menu.ok ? 'OK' : JSON.stringify(menu));

  console.log('Listening for /start … (Ctrl+C to stop)');
  let offset = 0;
  for (;;) {
    try {
      const res = await api('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message'],
      });
      for (const update of res.result || []) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text?.startsWith('/start')) continue;
        await api('sendMessage', {
          chat_id: msg.chat.id,
          text: '🐸 Welcome to FRG Fight Club!\n\nPay the entry in FRG, beat the Champ at boxing, and the treasury pays the winner. Tap below to play:',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🥊 Play FRG Boxing',
                  web_app: { url: WEBAPP_URL },
                },
              ],
            ],
          },
        });
      }
    } catch (e) {
      console.error('poll error:', e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main();
