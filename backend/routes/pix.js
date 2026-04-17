/* =============================================
   MOMENTTO — Rotas de pagamento Pix (Mercado Pago)
   POST /api/pix/create   → gera cobrança Pix e salva pedido pendente
   GET  /api/pix/status/:paymentId → verifica pagamento e, se aprovado, processa o pedido
   POST /api/pix/webhook  → recebe notificação do Mercado Pago (apenas acusa recibo)
   ============================================= */

const express = require("express");
const multer  = require("multer");
const fs      = require("fs");
const path    = require("path");
const os      = require("os");

const { createPixPayment, getPaymentStatus } = require("../services/mercadopago");
const { savePendingOrder, getPendingOrder, deletePendingOrder } = require("../services/pendingOrders");
const { renderTemplate }          = require("../services/templateEngine");
const { deployDirectoryToNetlify } = require("../services/netlifyDeploy");
const { generateQrCodeDataUrl }   = require("../services/qrcode");
const { sendMomenttoMail, sendAdminNotification } = require("../services/mailer");

const router = express.Router();

const isNetlifyRuntime =
  Boolean(process.env.NETLIFY) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT);

const uploadsRoot = isNetlifyRuntime
  ? path.join(os.tmpdir(), "momentto-pix-uploads")
  : path.join(__dirname, "..", "uploads");

const generatedRoot = isNetlifyRuntime
  ? path.join(os.tmpdir(), "momentto-generated")
  : path.join(__dirname, "..", "generated");

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PLAN_PHOTO_LIMITS   = { basico: 3, premium: 10 };

// MODO TESTE: cobrar R$0,01 em qualquer plano para testar o fluxo Pix
const PLAN_AMOUNTS = { basico: 0.01, premium: 0.01 };

function normalizeText(v) { return String(v || "").trim(); }

function slugify(v) {
  return normalizeText(v)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 50);
}

// Multer: salva fotos em /tmp/<orderSlug>/
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // req.body está disponível aqui pois multer processa campos de texto antes de arquivos
      if (!req.pixOrderId) {
        req.pixOrderId = `${slugify(req.body.recipientName || "momentto")}-${Date.now()}`;
      }
      const dir = path.join(uploadsRoot, req.pixOrderId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase() || ".jpg";
      const base = slugify(path.basename(file.originalname, path.extname(file.originalname))) || "foto";
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  }),
  limits: { files: 10, fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_IMAGE_TYPES.has(file.mimetype))
});

// Controle de pagamentos já processados (evita deploy duplo)
const processedPayments = new Set();

// ─────────────────────────────────────────────
// POST /api/pix/create
// ─────────────────────────────────────────────
router.post("/create", upload.array("photos", 10), async (req, res) => {
  const uploadDir = req.pixOrderId ? path.join(uploadsRoot, req.pixOrderId) : null;

  try {
    const template      = normalizeText(req.body.template);
    const plan          = normalizeText(req.body.plan) || "basico";
    const recipientName = normalizeText(req.body.recipientName);
    const senderName    = normalizeText(req.body.senderName);
    const email         = normalizeText(req.body.email);
    const message       = normalizeText(req.body.message);
    const specialDate   = normalizeText(req.body.specialDate);
    const photos        = req.files || [];

    // Validações
    if (!["namorados", "pais", "maes", "amizade", "aniversario"].includes(template)) {
      return res.status(400).json({ ok: false, error: "Selecione um template válido." });
    }
    if (!["basico", "premium"].includes(plan)) {
      return res.status(400).json({ ok: false, error: "Plano inválido." });
    }
    if (!recipientName || !senderName || !email) {
      return res.status(400).json({ ok: false, error: "Preencha todos os campos obrigatórios." });
    }
    if (!email.includes("@")) {
      return res.status(400).json({ ok: false, error: "E-mail inválido." });
    }
    if (message.length < 20) {
      return res.status(400).json({ ok: false, error: "A mensagem precisa ter pelo menos 20 caracteres." });
    }
    if (!photos.length) {
      return res.status(400).json({ ok: false, error: "Envie pelo menos uma foto." });
    }
    if (photos.length > PLAN_PHOTO_LIMITS[plan]) {
      return res.status(400).json({
        ok: false,
        error: `O plano ${plan} aceita no máximo ${PLAN_PHOTO_LIMITS[plan]} foto(s).`
      });
    }

    const orderSlug = req.pixOrderId || `${slugify(recipientName)}-${Date.now()}`;

    // Criar cobrança Pix no Mercado Pago
    const { paymentId, pixQrCode, pixQrCodeBase64 } = await createPixPayment({
      amount: PLAN_AMOUNTS[plan],
      description: `Momentto — Plano ${plan === "premium" ? "Premium" : "Básico"} para ${recipientName}`,
      email,
      externalRef: orderSlug
    });

    // Salvar pedido pendente até o pagamento ser confirmado
    await savePendingOrder(paymentId, {
      meta: { template, plan, recipientName, senderName, email, message, specialDate, orderSlug },
      photos: photos.map((f) => ({ path: f.path, filename: f.filename, mimetype: f.mimetype }))
    });

    res.json({
      ok: true,
      paymentId,
      pixQrCode,
      pixQrCodeBase64: pixQrCodeBase64 ? `data:image/png;base64,${pixQrCodeBase64}` : null
    });

  } catch (error) {
    console.error("[PIX create]", error);
    if (uploadDir) fs.promises.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ ok: false, error: error.message || "Erro ao gerar o Pix. Tente novamente." });
  }
});

// ─────────────────────────────────────────────
// GET /api/pix/status/:paymentId
// Chamado pelo frontend via polling a cada ~3s
// ─────────────────────────────────────────────
router.get("/status/:paymentId", async (req, res) => {
  const { paymentId } = req.params;

  try {
    const mpStatus = await getPaymentStatus(paymentId);

    // Pagamento ainda não confirmado — retorna o status atual
    if (mpStatus !== "approved") {
      return res.json({ ok: true, status: mpStatus });
    }

    // Já foi processado neste container (evita deploy duplo)
    if (processedPayments.has(paymentId)) {
      return res.json({ ok: true, status: "processing" });
    }

    processedPayments.add(paymentId);

    // Recuperar dados do pedido pendente
    let pending;
    try {
      pending = await getPendingOrder(paymentId);
    } catch {
      processedPayments.delete(paymentId);
      return res.status(404).json({
        ok: false,
        error: "Dados do pedido não encontrados. Entre em contato pelo WhatsApp para finalizar."
      });
    }

    const { meta, photosData } = pending;
    const outputDir  = path.join(generatedRoot, meta.orderSlug);
    const photosDir  = path.join(outputDir, "photos");

    await fs.promises.mkdir(photosDir, { recursive: true });

    // Restaurar fotos do base64 salvo
    const photoRelPaths = [];
    for (const p of photosData) {
      const destFile = path.join(photosDir, p.filename);
      await fs.promises.writeFile(destFile, Buffer.from(p.data, "base64"));
      photoRelPaths.push(`photos/${p.filename}`);
    }

    // Gerar HTML do Momentto
    const html = await renderTemplate(meta.template, {
      recipientName: meta.recipientName,
      senderName:    meta.senderName,
      date:          meta.specialDate,
      message:       meta.message,
      photos:        photoRelPaths,
      plan:          meta.plan
    });

    await fs.promises.writeFile(path.join(outputDir, "index.html"), html, "utf8");

    // Publicar no Netlify e gerar QR Code
    const publicUrl = await deployDirectoryToNetlify(outputDir, meta.orderSlug);
    const qrBase64  = await generateQrCodeDataUrl(publicUrl);

    // Enviar e-mail com link e QR Code
    await sendMomenttoMail({
      to:            meta.email,
      recipientName: meta.recipientName,
      senderName:    meta.senderName,
      publicUrl,
      qrBase64
    });

    sendAdminNotification({
      recipientName: meta.recipientName,
      senderName:    meta.senderName,
      email:         meta.email,
      template:      meta.template,
      publicUrl
    }).catch(() => {});

    // Limpar dados temporários
    await deletePendingOrder(paymentId);
    fs.promises.rm(outputDir, { recursive: true, force: true }).catch(() => {});

    res.json({ ok: true, status: "approved", url: publicUrl, qrBase64 });

  } catch (error) {
    console.error("[PIX status]", error);
    processedPayments.delete(paymentId);
    res.status(500).json({ ok: false, error: error.message || "Erro ao processar pedido." });
  }
});

// ─────────────────────────────────────────────
// POST /api/pix/webhook
// Mercado Pago envia notificações aqui — apenas acusamos recibo.
// O processamento real ocorre via polling (/status).
// ─────────────────────────────────────────────
router.post("/webhook", (_req, res) => {
  res.sendStatus(200);
});

module.exports = router;
