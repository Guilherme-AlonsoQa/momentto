/**
 * deploy.js — Momentto deploy to Netlify
 *
 * Faz dois uploads:
 * 1. Site estático (frontend) + netlify.toml com redirects
 * 2. Function ZIP (api.js + backend + node_modules) via /functions/api
 */

require("dotenv").config({ path: "./backend/.env" });

const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const os = require("os");

const TOKEN = process.env.NETLIFY_TOKEN;
const SITE_ID = process.env.NETLIFY_SITE_ID;

if (!TOKEN || !SITE_ID) {
  console.error("NETLIFY_TOKEN e NETLIFY_SITE_ID precisam estar no backend/.env");
  process.exit(1);
}

const BASE = __dirname;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Cria ZIP de um ou mais diretórios/arquivos */
async function createZip(buildFn) {
  const zipPath = path.join(os.tmpdir(), `momentto-${Date.now()}.zip`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 5 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err) => { if (err.code !== "ENOENT") throw err; });
    archive.pipe(output);
    buildFn(archive);
    archive.finalize();
  });
  return zipPath;
}

/** Upload ZIP para o Netlify (site estático) */
async function uploadSiteZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  console.log(`\nEnviando site estático (${(buf.length / 1024 / 1024).toFixed(1)} MB)...`);
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/deploys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/zip",
    },
    body: buf,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha no upload do site: ${res.status} ${txt}`);
  }
  return res.json();
}

/** Aguarda deploy ficar ready */
async function waitReady(deployId) {
  console.log("Aguardando deploy ficar pronto...");
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const d = await r.json();
    process.stdout.write(`  estado: ${d.state}    \r`);
    if (d.state === "ready") { console.log(""); return d; }
    if (d.state === "error") throw new Error(`Deploy com erro: ${d.error_message}`);
    await sleep(3000);
  }
  throw new Error("Timeout aguardando deploy.");
}

/** Upload do ZIP da Netlify Function via API de functions */
async function uploadFunction(zipPath) {
  const buf = fs.readFileSync(zipPath);
  console.log(`\nEnviando function ZIP (${(buf.length / 1024 / 1024).toFixed(1)} MB)...`);
  const res = await fetch(
    `https://api.netlify.com/api/v1/sites/${SITE_ID}/functions/api`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/zip",
      },
      body: buf,
    }
  );
  const txt = await res.text();
  if (!res.ok) throw new Error(`Falha no upload da function: ${res.status} ${txt}`);
  console.log("Function enviada:", res.status, txt.slice(0, 120));
}

async function deploy() {
  console.log(`\nMomentto Deploy → site ${SITE_ID}\n`);

  // ── 1. Site estático ────────────────────────────────────────────────────
  console.log("Empacotando site estático (frontend + netlify.toml)...");
  const siteZip = await createZip((archive) => {
    // Frontend na raiz do ZIP
    archive.directory(path.join(BASE, "frontend"), false);
    // Templates acessíveis pelas functions
    archive.directory(path.join(BASE, "frontend", "templates"), "templates");
    // netlify.toml com redirects
    archive.file(path.join(BASE, "netlify.toml"), { name: "netlify.toml" });
  });
  console.log(`ZIP do site: ${(fs.statSync(siteZip).size / 1024 / 1024).toFixed(1)} MB`);

  const payload = await uploadSiteZip(siteZip);
  fs.rmSync(siteZip, { force: true });
  console.log(`Deploy iniciado: ${payload.id} (${payload.state})`);
  const ready = await waitReady(payload.id);

  // ── 2. Function ZIP ──────────────────────────────────────────────────────
  console.log("\nEmpacotando function (api.js + backend + node_modules)...");
  const fnZip = await createZip((archive) => {
    // Handler: api.js na raiz do ZIP (requer ./backend/app)
    archive.append(
      `const serverless = require("serverless-http");\nconst { createApp } = require("./backend/app");\nconst app = createApp();\nmodule.exports.handler = serverless(app);\n`,
      { name: "api.js" }
    );
    // Backend
    const backendDir = path.join(BASE, "backend");
    archive.glob("**/*.js", {
      cwd: backendDir,
      ignore: ["uploads/**", "generated/**"],
    }, { prefix: "backend" });
    // Templates
    archive.directory(path.join(BASE, "frontend", "templates"), "templates");
    // node_modules
    archive.directory(path.join(BASE, "node_modules"), "node_modules");
    // package.json (necessário para resolução de módulos)
    archive.file(path.join(BASE, "package.json"), { name: "package.json" });
  });
  console.log(`ZIP da function: ${(fs.statSync(fnZip).size / 1024 / 1024).toFixed(1)} MB`);

  await uploadFunction(fnZip);
  fs.rmSync(fnZip, { force: true });

  const url = ready.ssl_url || ready.url;
  console.log(`\n✓ Deploy completo!`);
  console.log(`  Site: ${url}`);
  console.log(`  Admin: https://app.netlify.com/sites/${SITE_ID}/deploys/${ready.id}\n`);
}

deploy().catch((err) => {
  console.error("\nErro:", err.message);
  process.exit(1);
});
