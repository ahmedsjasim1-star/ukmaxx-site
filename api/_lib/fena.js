const FENA_API_BASE = process.env.FENA_API_BASE || 'https://epos.api.prod-gcp.fena.co';
const FENA_PAYMENT_METHOD = process.env.FENA_PAYMENT_METHOD || 'fena_ob';

function getFenaHeaders() {
  const terminalId = process.env.FENA_TERMINAL_ID;
  const terminalSecret = process.env.FENA_TERMINAL_SECRET;
  if (!terminalId || !terminalSecret) throw new Error('Missing Fena terminal env vars');
  return {
    'Content-Type': 'application/json',
    'terminal-id': terminalId,
    'terminal-secret': terminalSecret,
  };
}

async function fenaRequest(path, options = {}) {
  const res = await fetch(`${FENA_API_BASE}${path}`, {
    ...options,
    headers: {
      ...getFenaHeaders(),
      ...(options.headers || {}),
    },
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }
  if (!res.ok) {
    const message = data?.message || data?.error || raw || `Fena request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

function moneyToFenaAmount(value) {
  return Number(value || 0).toFixed(2);
}

async function createAndProcessPayment({
  reference,
  amount,
  customerName,
  customerEmail,
  description,
  customRedirectUrl,
}) {
  return fenaRequest('/open/payments/single/create-and-process', {
    method: 'POST',
    body: JSON.stringify({
      reference,
      amount: moneyToFenaAmount(amount),
      customerName,
      customerEmail,
      paymentMethod: FENA_PAYMENT_METHOD,
      description,
      customRedirectUrl,
    }),
  });
}

async function getPaymentById(paymentId) {
  return fenaRequest(`/open/payments/single/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
  });
}

module.exports = {
  createAndProcessPayment,
  getPaymentById,
};
