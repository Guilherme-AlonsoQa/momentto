/* =============================================
   MOMENTTO — Armazenamento de pedidos pendentes
   Usa memória + /tmp para a fase de testes.
   Em produção com alto volume: migrar para Netlify Blobs ou Supabase.
   ============================================= */

const fs   = require("fs");
const path = require("path");
const os   = require("os");

// Cache em memória (válido enquanto o container Lambda estiver ativo)
const CACHE = new Map();

const PENDING_DIR = path.join(os.tmpdir(), "momentto-pending");

function ensureDir() {
  try { fs.mkdirSync(PENDING_DIR, { recursive: true }); } catch (_) { /* ok */ }
}

/**
 * Salva os dados do pedido pendente (antes do pagamento ser confirmado).
 * As fotos são salvas como base64 para sobreviver à serialização JSON.
 *
 * @param {string} paymentId  - ID do pagamento no Mercado Pago
 * @param {{ meta: object, photos: Array<{path, filename, mimetype}> }} order
 */
async function savePendingOrder(paymentId, { meta, photos }) {
  ensureDir();

  const photosData = await Promise.all(
    photos.map(async (photo) => ({
      filename: photo.filename,
      mimetype: photo.mimetype,
      data: (await fs.promises.readFile(photo.path)).toString("base64")
    }))
  );

  const record = { meta, photosData, createdAt: Date.now() };

  CACHE.set(paymentId, record);

  const filePath = path.join(PENDING_DIR, `${paymentId}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(record), "utf8").catch(() => {});
}

/**
 * Recupera os dados de um pedido pendente.
 * Tenta memória primeiro, depois /tmp.
 */
async function getPendingOrder(paymentId) {
  if (CACHE.has(paymentId)) return CACHE.get(paymentId);

  const filePath = path.join(PENDING_DIR, `${paymentId}.json`);
  const raw = await fs.promises.readFile(filePath, "utf8");
  const record = JSON.parse(raw);
  CACHE.set(paymentId, record);
  return record;
}

/**
 * Remove um pedido pendente após processamento.
 */
async function deletePendingOrder(paymentId) {
  CACHE.delete(paymentId);
  const filePath = path.join(PENDING_DIR, `${paymentId}.json`);
  await fs.promises.unlink(filePath).catch(() => {});
}

module.exports = { savePendingOrder, getPendingOrder, deletePendingOrder };
