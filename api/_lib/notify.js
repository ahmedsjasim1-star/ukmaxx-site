async function sendTelegramAdminAlert(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('telegram-env-missing', {
      hasToken: Boolean(token),
      hasChatId: Boolean(chatId),
    });
    throw new Error('telegram_env_missing');
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) {
    console.error('telegram-send-failed', {
      status: r.status,
      ok: data?.ok,
      description: data?.description,
      errorCode: data?.error_code,
      chatIdSuffix: String(chatId).slice(-4),
    });
    throw new Error(`telegram_send_failed:${data.description || r.status}`);
  }

  console.log('telegram-send-ok', {
    chatIdSuffix: String(chatId).slice(-4),
    messageId: data?.result?.message_id,
  });
}

module.exports = { sendTelegramAdminAlert };
