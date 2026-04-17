/* =============================================
   AGENTE 1 — Limpeza automática de sites de teste
   Roda toda noite às 03h UTC (00h de Brasília).
   Deleta todos os sites Netlify EXCETO o site principal.
   Envia e-mail de relatório se algo foi deletado.
   ============================================= */

const nodemailer = require("nodemailer");

const NETLIFY_TOKEN   = process.env.NETLIFY_TOKEN;
const MAIN_SITE_ID    = process.env.NETLIFY_SITE_ID;   // ID do site principal (momentto-oficial)
const SMTP_HOST       = process.env.SMTP_HOST;
const SMTP_PORT       = process.env.SMTP_PORT;
const SMTP_USER       = process.env.SMTP_USER;
const SMTP_PASS       = process.env.SMTP_PASS;
const ADMIN_EMAIL     = process.env.ADMIN_EMAIL || process.env.SMTP_USER;

// ---- Netlify API helpers ----

async function listAllSites() {
  const res = await fetch(
    "https://api.netlify.com/api/v1/sites?filter=all&per_page=100",
    { headers: { Authorization: `Bearer ${NETLIFY_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Netlify list failed: ${res.status}`);
  return res.json();
}

async function deleteSite(siteId) {
  const res = await fetch(
    `https://api.netlify.com/api/v1/sites/${siteId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${NETLIFY_TOKEN}` } }
  );
  return res.ok || res.status === 404;
}

// ---- E-mail de relatório ----

async function sendReport({ deleted, errors, totalBefore }) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  const rows = deleted.map(name =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0ebe0;">${name}</td></tr>`
  ).join("");

  const errorRows = errors.map(e =>
    `<tr><td style="padding:6px 12px;color:#9c3d3d;">${e}</td></tr>`
  ).join("");

  await transporter.sendMail({
    from: SMTP_USER,
    to: ADMIN_EMAIL,
    subject: `[Momentto] 🧹 Limpeza automática — ${deleted.length} site(s) removidos`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#f5f5f0;padding:24px;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e0d8c8;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a84c;font-weight:700;">Momentto · Agente de Limpeza</p>
          <h2 style="margin:0 0 20px;font-size:20px;color:#2c2c2a;">Relatório de limpeza automática</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#4a4540;margin-bottom:20px;">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f0ebe0;font-weight:700;width:50%;">Sites antes da limpeza</td>
              <td style="padding:8px 0;border-bottom:1px solid #f0ebe0;">${totalBefore}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-weight:700;">Sites deletados</td>
              <td style="padding:8px 0;">${deleted.length}</td>
            </tr>
          </table>
          ${deleted.length > 0 ? `
            <p style="font-size:13px;font-weight:700;color:#2c2c2a;margin:0 0 8px;">Sites removidos:</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;color:#6d6659;">
              ${rows}
            </table>
          ` : ""}
          ${errors.length > 0 ? `
            <p style="font-size:13px;font-weight:700;color:#9c3d3d;margin:16px 0 8px;">Erros:</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              ${errorRows}
            </table>
          ` : ""}
          <p style="margin:20px 0 0;font-size:12px;color:#9a9080;">Executado automaticamente às ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília)</p>
        </div>
      </div>
    `
  }).catch(err => console.error("[cleanup] Erro ao enviar e-mail:", err.message));
}

// ---- Handler principal ----

exports.handler = async () => {
  console.log("[cleanup-sites] Iniciando limpeza...");

  if (!NETLIFY_TOKEN || !MAIN_SITE_ID) {
    console.error("[cleanup-sites] NETLIFY_TOKEN ou NETLIFY_SITE_ID não configurados.");
    return { statusCode: 500, body: "Configuração ausente." };
  }

  let sites;
  try {
    sites = await listAllSites();
  } catch (err) {
    console.error("[cleanup-sites] Erro ao listar sites:", err.message);
    return { statusCode: 500, body: err.message };
  }

  const totalBefore = sites.length;
  const toDelete = sites.filter(s => s.id !== MAIN_SITE_ID);

  console.log(`[cleanup-sites] ${totalBefore} site(s) encontrado(s), ${toDelete.length} para deletar.`);

  const deleted = [];
  const errors  = [];

  for (const site of toDelete) {
    try {
      const ok = await deleteSite(site.id);
      if (ok) {
        deleted.push(site.name);
        console.log(`[cleanup-sites] Deletado: ${site.name}`);
      } else {
        errors.push(`Falha ao deletar: ${site.name}`);
      }
    } catch (err) {
      errors.push(`${site.name}: ${err.message}`);
    }
  }

  if (deleted.length > 0 || errors.length > 0) {
    await sendReport({ deleted, errors, totalBefore });
  }

  const result = { deleted: deleted.length, errors: errors.length, totalBefore };
  console.log("[cleanup-sites] Concluído:", result);

  return { statusCode: 200, body: JSON.stringify(result) };
};
