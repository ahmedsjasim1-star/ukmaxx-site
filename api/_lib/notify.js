async function sendTelegramMessage({ text, token, chatId, logPrefix }) {
  if (!token || !chatId) {
    console.error(`${logPrefix}-env-missing`, {
      hasToken: Boolean(token),
      hasChatId: Boolean(chatId),
    });
    throw new Error(`${logPrefix}_env_missing`);
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) {
    console.error(`${logPrefix}-send-failed`, {
      status: r.status,
      ok: data?.ok,
      description: data?.description,
      errorCode: data?.error_code,
      chatIdSuffix: String(chatId).slice(-4),
    });
    throw new Error(`${logPrefix}_send_failed:${data.description || r.status}`);
  }

  console.log(`${logPrefix}-send-ok`, {
    chatIdSuffix: String(chatId).slice(-4),
    messageId: data?.result?.message_id,
  });
}

async function sendTelegramOrderAlert(text) {
  const token = process.env.TELEGRAM_ORDER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ORDER_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  return sendTelegramMessage({
    text,
    token,
    chatId,
    logPrefix: 'telegram-order',
  });
}

async function sendTelegramAdminAlert(text) {
  const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  return sendTelegramMessage({
    text,
    token,
    chatId,
    logPrefix: 'telegram-admin',
  });
}

async function sendTelegramAdminPhoto(photo, caption = '') {
  const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('telegram-admin-env-missing');

  const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo, caption, parse_mode: 'HTML' }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) {
    console.error('telegram-admin-photo-send-failed', {
      status: r.status,
      description: data?.description,
      chatIdSuffix: String(chatId).slice(-4),
    });
    throw new Error(`telegram_admin_photo_send_failed:${data.description || r.status}`);
  }
}

module.exports = { sendTelegramAdminAlert, sendTelegramAdminPhoto, sendTelegramOrderAlert };
