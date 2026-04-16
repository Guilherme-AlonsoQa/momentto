const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { renderTemplate } = require("../services/templateEngine");
const { deployDirectoryToNetlify } = require("../services/netlifyDeploy");
const { generateQrCodeDataUrl } = require("../services/qrcode");
const { sendMomenttoMail, sendAdminNotification } = require("../services/mailer");

const router = express.Router();
const isNetlifyRuntime =
  Boolean(process.env.NETLIFY) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT);
const uploadsRoot = isNetlifyRuntime
  ? path.join(os.tmpdir(), "momentto-uploads")
  : path.join(__dirname, "..", "uploads");
const generatedRoot = isNetlifyRuntime
  ? path.join(os.tmpdir(), "momentto-generated")
  : path.join(__dirname, "..", "generated");

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

const allowedProofTypes = new Set([
  "application/pdf",
  ...allowedImageTypes
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function createOrderSlug(recipientName) {
  const base = slugify(recipientName) || "momentto";
  return `${base}-${Date.now()}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.orderSlug) {
      req.orderSlug = createOrderSlug(req.body.recipientName);
    }

    const targetDir = path.join(uploadsRoot, req.orderSlug);
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const safeBase = slugify(path.basename(file.originalname, ext)) || "arquivo";
    cb(null, `${safeBase}-${Date.now()}${ext.toLowerCase()}`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: 11,
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "photos") {
      if (!allowedImageTypes.has(file.mimetype)) {
        return cb(new Error("As fotos devem ser imagens JPG, PNG, WEBP ou GIF."));
      }

      return cb(null, true);
    }

    if (file.fieldname === "paymentProof") {
      if (!allowedProofTypes.has(file.mimetype)) {
        return cb(new Error("O comprovante deve ser uma imagem ou PDF."));
      }

      return cb(null, true);
    }

    cb(new Error("Campo de upload inválido."));
  }
});

const PLAN_PHOTO_LIMITS = { basico: 3, premium: 10 };

function ensureOrderData(body, files) {
  const template = normalizeText(body.template);
  const plan = normalizeText(body.plan) || "basico";
  const recipientName = normalizeText(body.recipientName);
  const senderName = normalizeText(body.senderName);
  const specialDate = normalizeText(body.specialDate);
  const message = normalizeText(body.message);
  const email = normalizeText(body.email);

  if (!["namorados", "pais", "maes", "amizade", "aniversario"].includes(template)) {
    throw new Error("Selecione um template válido.");
  }

  if (!["basico", "premium"].includes(plan)) {
    throw new Error("Selecione um plano válido.");
  }

  if (!recipientName || !senderName || !email) {
    throw new Error("Preencha os campos obrigatórios do formulário.");
  }

  if (message.length < 20) {
    throw new Error("A mensagem precisa ter pelo menos 20 caracteres.");
  }

  if (!files.photos || files.photos.length === 0) {
    throw new Error("Envie pelo menos uma foto.");
  }

  const maxPhotos = PLAN_PHOTO_LIMITS[plan];
  if (files.photos.length > maxPhotos) {
    throw new Error(
      plan === "basico"
        ? "O Plano Básico aceita no máximo 3 fotos. Faça upgrade para o Plano Premium para enviar até 10 fotos."
        : "Você pode enviar no máximo 10 fotos."
    );
  }

  if (!files.paymentProof || files.paymentProof.length === 0) {
    throw new Error("Envie o comprovante de pagamento Pix.");
  }

  return {
    template,
    plan,
    recipientName,
    senderName,
    specialDate,
    message,
    email
  };
}

async function safeRemoveDirectory(dirPath) {
  await fs.promises.rm(dirPath, { recursive: true, force: true });
}

router.post(
  "/",
  upload.fields([
    { name: "photos", maxCount: 10 },
    { name: "paymentProof", maxCount: 1 }
  ]),
  async (req, res, next) => {
    const orderSlug = req.orderSlug || createOrderSlug(req.body.recipientName);
    const uploadDir = path.join(uploadsRoot, orderSlug);
    const outputDir = path.join(generatedRoot, orderSlug);

    try {
      const files = req.files || {};
      const data = ensureOrderData(req.body, files);

      await fs.promises.mkdir(outputDir, { recursive: true });
      const photosDir = path.join(outputDir, "photos");
      await fs.promises.mkdir(photosDir, { recursive: true });

      const photoFiles = [];

      for (const photo of files.photos) {
        const destination = path.join(photosDir, photo.filename);
        await fs.promises.copyFile(photo.path, destination);
        photoFiles.push(`photos/${photo.filename}`);
      }

      const html = await renderTemplate(data.template, {
        recipientName: data.recipientName,
        senderName: data.senderName,
        date: data.specialDate,
        message: data.message,
        photos: photoFiles,
        plan: data.plan
      });

      await fs.promises.writeFile(path.join(outputDir, "index.html"), html, "utf8");

      const publicUrl = await deployDirectoryToNetlify(outputDir, orderSlug);
      const qrBase64 = await generateQrCodeDataUrl(publicUrl);

      await sendMomenttoMail({
        to: data.email,
        recipientName: data.recipientName,
        senderName: data.senderName,
        publicUrl,
        qrBase64
      });

      sendAdminNotification({
        recipientName: data.recipientName,
        senderName: data.senderName,
        email: data.email,
        template: data.template,
        publicUrl
      }).catch(() => {});

      res.json({
        ok: true,
        url: publicUrl,
        qrBase64
      });
    } catch (error) {
      await safeRemoveDirectory(outputDir).catch(() => {});
      next(error);
    } finally {
      await safeRemoveDirectory(uploadDir).catch(() => {});
    }
  }
);

module.exports = router;
