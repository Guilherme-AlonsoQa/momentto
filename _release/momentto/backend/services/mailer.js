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

  await transporter.sendMail({
    from,
    to,
    subject: `Seu Momentto para ${recipientName} está pronto`,
    html: `
      <div style="font-family: Georgia, 'Times New Roman', serif; background: #FAFAF7; color: #2C2C2A; padding: 32px;">
        <div style="max-width: 640px; margin: 0 auto; background: #fffdf7; border: 1px solid rgba(201,168,76,0.28); border-radius: 24px; padding: 32px;">
          <p style="letter-spacing: .22em; text-transform: uppercase; font-size: 12px; color: #C9A84C; margin: 0 0 12px;">Momentto</p>
          <h1 style="font-weight: 400; margin: 0 0 16px;">Sua página personalizada foi criada com sucesso.</h1>
          <p style="margin: 0 0 18px; line-height: 1.7;">
            O presente digital de <strong>${senderName}</strong> para <strong>${recipientName}</strong> já está publicado.
          </p>
          <p style="margin: 0 0 22px; line-height: 1.7;">
            Abra o link abaixo ou escaneie o QR Code para acessar:
          </p>
          <p style="margin: 0 0 24px;">
            <a href="${publicUrl}" style="color: #2C2C2A; font-weight: 700;">${publicUrl}</a>
          </p>
          <img src="cid:momentto-qr" alt="QR Code do Momentto" style="display: block; width: 220px; max-width: 100%; margin: 0 auto 24px;">
          <p style="margin: 0; color: #6C6556; font-size: 14px;">
            Guarde este e-mail para acessar sua lembrança sempre que quiser.
          </p>
        </div>
      </div>
    `,
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

module.exports = {
  sendMomenttoMail
};
