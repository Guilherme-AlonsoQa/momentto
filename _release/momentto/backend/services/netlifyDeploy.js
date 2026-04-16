const fs = require("fs");
const path = require("path");
const os = require("os");
const archiver = require("archiver");

async function zipDirectory(sourceDir, destinationZip) {
  await fs.promises.mkdir(path.dirname(destinationZip), { recursive: true });

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destinationZip);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeployReady(deployId, token) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Falha ao consultar o status do deploy no Netlify: ${response.status} ${errorText}`);
    }

    const payload = await response.json();

    if (payload.state === "ready") {
      return payload;
    }

    if (payload.state === "error") {
      throw new Error("O Netlify retornou erro ao finalizar o deploy.");
    }

    await sleep(1500);
  }

  throw new Error("O deploy no Netlify demorou além do esperado para ficar pronto.");
}

async function deployDirectoryToNetlify(directoryPath, deployName) {
  const token = process.env.NETLIFY_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  const accountSlug = process.env.NETLIFY_ACCOUNT_SLUG;
  const deployMode = process.env.NETLIFY_ORDER_DEPLOY_MODE || "create_site";

  if (!token || !siteId) {
    throw new Error("As variáveis NETLIFY_TOKEN e NETLIFY_SITE_ID precisam estar definidas.");
  }

  let targetSiteId = siteId;

  if (deployMode === "create_site") {
    if (!accountSlug) {
      throw new Error("Defina NETLIFY_ACCOUNT_SLUG para criar um novo site por pedido no Netlify.");
    }

    const generatedName = `momentto-${deployName}`.slice(0, 63);
    const createResponse = await fetch(`https://api.netlify.com/api/v1/${accountSlug}/sites`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: generatedName,
        processing_settings: {
          html: { pretty_urls: true }
        }
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Falha ao criar site do pedido no Netlify: ${createResponse.status} ${errorText}`);
    }

    const createdSite = await createResponse.json();
    targetSiteId = createdSite.id;
  }

  const zipPath = path.join(os.tmpdir(), `${deployName}.zip`);
  await zipDirectory(directoryPath, zipPath);

  const zipBuffer = await fs.promises.readFile(zipPath);

  const response = await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}/deploys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/zip"
    },
    body: zipBuffer
  });

  await fs.promises.rm(zipPath, { force: true }).catch(() => {});

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao publicar no Netlify: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const readyDeploy = payload.id ? await waitForDeployReady(payload.id, token) : payload;

  return readyDeploy.ssl_url || readyDeploy.url || readyDeploy.deploy_ssl_url;
}

module.exports = {
  deployDirectoryToNetlify
};
