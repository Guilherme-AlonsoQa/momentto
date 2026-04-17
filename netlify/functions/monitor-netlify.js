/* =============================================
   AGENTE 2 — Monitor de uso do Netlify
   Roda toda manhã às 09h UTC (06h de Brasília).
   Verifica quantidade de sites, deploys recentes,
   e envia alerta se estiver se aproximando dos limites
   do plano gratuito.
   ============================================= */

const nodemailer = require("nodemailer");

const NETLIFY_TOKEN  = process.env.NETLIFY_TOKEN;
const MAIN_SITE_ID   = process.env.NETLIFY_SITE_ID;
const ACCOUNT_SLUG   = process.env.NETLIFY_ACCOUNT_SLUG;
const SMTP_HOST      = process.env.SMTP_HOST;
const SMTP_PORT      = process.env.SMTP_PORT;
const SMTP_USER      = process.env.SMTP_USER;
const SMTP_PASS      = process.env.SMTP_PASS;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || process.env.SMTP_USER;

// Limites do plano gratuito Netlify (Free)
const LIMITS = {
  sites:         500,   // sites ativos
  buildMinutes:  300,   // minutos de build por mês
};

const ALERT_THRESHOLD = 0.80; // alerta ao atingir 80%

// ---- Netlify API helpers ----

async function netlifyGet(path) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${NETLIFY_TOKEN}` }
  });
  if (!res.ok) throw new Error(`Netlify GET ${path} falhou: ${res.status}`);
  return res.json();
}

async function getStats() {
  // Buscar todos os sites
  const sites = await netlifyGet("/sites?filter=all&per_page=100");
  const siteCount = sites.length;
  const testSites = sites.filter(s => s.id !== MAIN_SITE_ID);

  // Buscar deploys recentes do site principal (últimos 30)
  let recentDeploys = [];
  let buildMinutesUsed = 0;
  try {
    const deploys = await netlifyGet(`/sites/${MAIN_SITE_ID}/deploys?per_page=30`);
    recentDeploys = deploys;
    // Estimar minutos de build somando deploy_time dos builds recentes do mês atual
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = deploys.filter(d => new Date(d.created_at) >= monthStart);
    buildMinutesUsed = Math.ceil(thisMonth.reduce((sum, d) => sum + (d.deploy_time || 0), 0) / 60);
  } catch (err) {
    console.warn("[monitor] Não foi possível buscar deploys:", err.message);
  }

  return {
    siteCount,
    testSiteCount: testSites.length,
    buildMinutesUsed,
    recentDeploys: recentDeploys.length,
  };
}

// ---- Verificar alertas ----

function checkAlerts(stats) {
  const alerts = [];

  const sitePct = stats.siteCount / LIMITS.sites;
  if (sitePct >= ALERT_THRESHOLD) {
    alerts.push({
      level: sitePct >= 0.95 ? "CRÍTICO" : "ATENÇÃO",
      msg: `Sites: ${stats.siteCount} de ${LIMITS.sites} (${Math.round(sitePct * 100)}%)`,
      detail: "Crie um novo site Netlify ou remova sites antigos para evitar bloqueio."
    });
  }

  const buildPct = stats.buildMinutesUsed / LIMITS.buildMinutes;
  if (buildPct >= ALERT_THRESHOLD) {
    alerts.push({
      level: buildPct >= 0.95 ? "CRÍTICO" : "ATENÇÃO",
      msg: `Build: ${stats.buildMinutesUsed} de ${LIMITS.buildMinutes} min/mês (${Math.round(buildPct * 100)}%)`,
      detail: "Aproximando-se do limite de minutos de build do plano gratuito."
    });
  }

  return alerts;
}

// ---- Barra de progresso em HTML ----

function progressBar(used, total, color) {
  const pct = Math.min(100, Math.round((used / total) * 100));
  const barColor = pct >= 95 ? "#c0392b" : pct >= 80 ? "#e67e22" : "#406638";
  return `
    <div style="background:#f0ebe0;border-radius:999px;height:10px;margin-top:6px;">
      <div style="background:${barColor};width:${pct}%;height:10px;border-radius:999px;transition:width 0.3s;"></div>
    </div>
    <p style="font-size:12px;color:#9a9080;margin:4px 0 0;">${used} / ${total} (${pct}%)</p>
  `;
}

// ---- E-mail de relatório ----

async function sendReport(stats, alerts) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  const hasAlert = alerts.length > 0;
  const alertBadge = hasAlert
    ? `<span style="background:#e67e22;color:#fff;border-radius:8px;padding:2px 10px;font-size:11px;font-weight:700;margin-left:8px;">⚠ ALERTA</span>`
    : `<span style="background:#406638;color:#fff;border-radius:8px;padding:2px 10px;font-size:11px;font-weight:700;margin-left:8px;">✓ OK</span>`;

  const alertRows = alerts.map(a => `
    <div style="background:${a.level === "CRÍTICO" ? "#fdf0ee" : "#fff8ee"};border-left:4px solid ${a.level === "CRÍTICO" ? "#c0392b" : "#e67e22"};border-radius:0 12px 12px 0;padding:12px 16px;margin-bottom:12px;">
      <p style="margin:0 0 4px;font-weight:700;font-size:13px;color:${a.level === "CRÍTICO" ? "#c0392b" : "#e67e22"};">${a.level}: ${a.msg}</p>
      <p style="margin:0;font-size:13px;color:#6d6659;">${a.detail}</p>
    </div>
  `).join("");

  await transporter.sendMail({
    from: SMTP_USER,
    to: ADMIN_EMAIL,
    subject: `[Momentto] 📊 Relatório diário Netlify${hasAlert ? " — ⚠ Alerta de limite" : ""}`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#f5f5f0;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e0d8c8;">

          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a84c;font-weight:700;">Momentto · Monitor Netlify</p>
          <h2 style="margin:0 0 6px;font-size:20px;color:#2c2c2a;display:flex;align-items:center;">
            Relatório diário ${alertBadge}
          </h2>
          <p style="margin:0 0 24px;font-size:13px;color:#9a9080;">${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>

          ${hasAlert ? `<div style="margin-bottom:24px;">${alertRows}</div>` : ""}

          <!-- MÉTRICAS -->
          <div style="background:#fafaf7;border-radius:14px;padding:20px;margin-bottom:20px;">

            <div style="margin-bottom:18px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#2c2c2a;">Sites ativos</p>
                <p style="margin:0;font-size:14px;color:#6d6659;">${stats.siteCount} de ${LIMITS.sites}</p>
              </div>
              ${progressBar(stats.siteCount, LIMITS.sites)}
            </div>

            <div style="margin-bottom:18px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#2c2c2a;">Build (min este mês)</p>
                <p style="margin:0;font-size:14px;color:#6d6659;">${stats.buildMinutesUsed} de ${LIMITS.buildMinutes}</p>
              </div>
              ${progressBar(stats.buildMinutesUsed, LIMITS.buildMinutes)}
            </div>

            <div style="display:flex;gap:12px;margin-top:4px;">
              <div style="flex:1;background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:14px;text-align:center;">
                <p style="margin:0;font-size:22px;font-weight:700;color:#c9a84c;">${stats.testSiteCount}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#9a9080;">Sites de pedidos</p>
              </div>
              <div style="flex:1;background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:14px;text-align:center;">
                <p style="margin:0;font-size:22px;font-weight:700;color:#c9a84c;">${stats.recentDeploys}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#9a9080;">Deploys recentes</p>
              </div>
            </div>
          </div>

          <p style="margin:0;font-size:12px;color:#9a9080;text-align:center;">
            Gerado automaticamente às ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Momentto Admin
          </p>
        </div>
      </div>
    `
  }).catch(err => console.error("[monitor] Erro ao enviar e-mail:", err.message));
}

// ---- Handler principal ----

exports.handler = async () => {
  console.log("[monitor-netlify] Verificando métricas...");

  if (!NETLIFY_TOKEN) {
    console.error("[monitor-netlify] NETLIFY_TOKEN não configurado.");
    return { statusCode: 500, body: "NETLIFY_TOKEN ausente." };
  }

  let stats;
  try {
    stats = await getStats();
  } catch (err) {
    console.error("[monitor-netlify] Erro ao buscar stats:", err.message);
    return { statusCode: 500, body: err.message };
  }

  const alerts = checkAlerts(stats);

  console.log("[monitor-netlify] Stats:", stats);
  console.log("[monitor-netlify] Alertas:", alerts.length);

  await sendReport(stats, alerts);

  return { statusCode: 200, body: JSON.stringify({ stats, alerts: alerts.length }) };
};
