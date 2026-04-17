/* =============================================
   MOMENTTO — Mercado Pago PIX service
   Usa fetch nativo (Node 18+), sem dependência extra.
   ============================================= */

const MP_BASE = "https://api.mercadopago.com";

async function mpFetch(method, urlPath, body) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("MP_ACCESS_TOKEN não configurado no ambiente.");

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `momentto-${Date.now()}-${Math.random().toString(36).slice(2)}`
    }
  };

  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${MP_BASE}${urlPath}`, options);
  const data = await res.json();

  if (!res.ok) {
    const msg = data.message || data.error || `Mercado Pago erro ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

/**
 * Cria uma cobrança Pix no Mercado Pago.
 * @returns {{ paymentId, pixQrCode, pixQrCodeBase64 }}
 */
async function createPixPayment({ amount, description, email, externalRef }) {
  const body = {
    transaction_amount: amount,
    description: String(description).slice(0, 253),
    payment_method_id: "pix",
    payer: { email }
  };

  if (externalRef) body.external_reference = externalRef;

  const webhookUrl = process.env.MP_WEBHOOK_URL;
  if (webhookUrl) body.notification_url = webhookUrl;

  const data = await mpFetch("POST", "/v1/payments", body);

  return {
    paymentId: String(data.id),
    pixQrCode: data.point_of_interaction.transaction_data.qr_code,
    pixQrCodeBase64: data.point_of_interaction.transaction_data.qr_code_base64
  };
}

/**
 * Retorna o status atual de um pagamento.
 * Possíveis: "pending", "approved", "rejected", "cancelled", "in_process"
 */
async function getPaymentStatus(paymentId) {
  const data = await mpFetch("GET", `/v1/payments/${paymentId}`);
  return data.status;
}

module.exports = { createPixPayment, getPaymentStatus };
