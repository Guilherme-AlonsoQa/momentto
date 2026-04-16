const nodemailer = require("nodemailer");

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("As credenciais SMTP precisam estar definidas no arquivo .env.");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

async function sendMomenttoMail({ to, recipientName, senderName, publicUrl, qrBase64 }) {
  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const qrContent = qrBase64.replace(/^data:image\/png;base64,/, "");

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#fafaf7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;">

          <!-- HEADER -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;font-weight:700;">
                — Momentto —
              </p>
            </td>
          </tr>

          <!-- CARD PRINCIPAL -->
          <tr>
            <td style="background:#fffdf8;border:1px solid rgba(201,168,76,0.26);border-radius:28px;padding:40px 36px;">

              <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;font-weight:700;">
                Seu presente está pronto
              </p>

              <h1 style="margin:0 0 20px;font-size:32px;font-weight:400;line-height:1.15;color:#2c2c2a;letter-spacing:-0.02em;">
                A página de <strong style="font-weight:600;">${recipientName}</strong><br>foi criada com sucesso.
              </h1>

              <p style="margin:0 0 8px;font-size:15px;line-height:1.75;color:#6d6659;font-family:Arial,sans-serif;">
                O presente digital de <strong style="color:#2c2c2a;">${senderName}</strong> para <strong style="color:#2c2c2a;">${recipientName}</strong> já está publicado e disponível online.
              </p>

              <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#6d6659;font-family:Arial,sans-serif;">
                Abra o link abaixo ou escaneie o QR Code para acessar:
              </p>

              <!-- LINK -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
                <tr>
                  <td style="background:rgba(201,168,76,0.08);border:1.5px solid rgba(201,168,76,0.28);border-radius:14px;padding:16px 20px;">
                    <a href="${publicUrl}" style="color:#a8842c;font-weight:700;font-size:14px;font-family:Arial,sans-serif;word-break:break-all;text-decoration:none;">${publicUrl}</a>
                  </td>
                </tr>
              </table>

              <!-- BOTÃO -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <a href="${publicUrl}" style="display:inline-block;padding:16px 32px;background:linear-gradient(135deg,#d9bb67,#c9a84c,#b98b28);color:#fffdf8;font-family:Arial,sans-serif;font-weight:700;font-size:15px;border-radius:999px;text-decoration:none;letter-spacing:0.02em;">
                      Abrir meu Momentto
                    </a>
                  </td>
                </tr>
              </table>

              <!-- DIVIDER -->
              <hr style="border:none;border-top:1px solid rgba(201,168,76,0.18);margin:0 0 28px;">

              <!-- QR CODE -->
              <p style="margin:0 0 14px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;font-weight:700;text-align:center;">
                QR Code para compartilhar
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <img src="cid:momentto-qr" alt="QR Code do Momentto" width="200" style="border:1px solid rgba(201,168,76,0.24);border-radius:16px;padding:10px;background:#fff;display:block;">
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#6d6659;text-align:center;line-height:1.65;font-family:Arial,sans-serif;">
                Escaneie com a câmera do celular para abrir a página diretamente.<br>
                Você pode imprimir esse QR Code em cartões ou molduras.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#9a9080;font-family:Arial,sans-serif;">
                Guarde este e-mail. O link não expira e pode ser aberto a qualquer momento.
              </p>
              <p style="margin:0;font-size:11px;color:#b0a090;font-family:Arial,sans-serif;">
                Momentto · momentto.netlify.app
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await transporter.sendMail({
    from,
    to,
    subject: `✦ Seu Momentto para ${recipientName} está pronto`,
    html,
    attachments: [
      {
        filename: "momentto-qrcode.png",
        content: qrContent,
        encoding: "base64",
        cid: "momentto-qr"
      }
    ]
  });
}

async function sendAdminNotification({ recipientName, senderName, email, template, publicUrl }) {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  if (!adminEmail) return;

  let transporter;
  try {
    transporter = createTransporter();
  } catch {
    return;
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const templateLabels = { namorados: "Namorados", pais: "Dia dos Pais", maes: "Dia das Mães" };

  await transporter.sendMail({
    from,
    to: adminEmail,
    subject: `[Momentto] Novo pedido — ${recipientName} (${templateLabels[template] || template})`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#f5f5f0;padding:24px;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e0d8c8;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a84c;font-weight:700;">Momentto Admin</p>
          <h2 style="margin:0 0 20px;font-size:22px;color:#2c2c2a;">Novo pedido recebido</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#4a4540;">
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ebe0;font-weight:700;width:40%;">Template</td><td style="padding:8px 0;border-bottom:1px solid #f0ebe0;">${templateLabels[template] || template}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ebe0;font-weight:700;">Para</td><td style="padding:8px 0;border-bottom:1px solid #f0ebe0;">${recipientName}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ebe0;font-weight:700;">De</td><td style="padding:8px 0;border-bottom:1px solid #f0ebe0;">${senderName}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ebe0;font-weight:700;">E-mail</td><td style="padding:8px 0;border-bottom:1px solid #f0ebe0;">${email}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Link</td><td style="padding:8px 0;"><a href="${publicUrl}" style="color:#a8842c;">${publicUrl}</a></td></tr>
          </table>
        </div>
      </div>
    `
  }).catch(() => {});
}

module.exports = {
  sendMomenttoMail,
  sendAdminNotification
};
