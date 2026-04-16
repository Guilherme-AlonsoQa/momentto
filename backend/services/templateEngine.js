const fs = require("fs");
const path = require("path");

// Em Lambda (Netlify Functions), LAMBDA_TASK_ROOT aponta para a raiz do bundle da function.
// O Netlify inclui os templates via included_files = ["frontend/templates/**"],
// então eles ficam em LAMBDA_TASK_ROOT/frontend/templates/.
// Localmente, os templates ficam em frontend/templates/ (dois níveis acima de backend/services/).
const templatesRoot = process.env.LAMBDA_TASK_ROOT
  ? path.join(process.env.LAMBDA_TASK_ROOT, "frontend", "templates")
  : path.join(__dirname, "..", "..", "frontend", "templates");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Plano Básico: até 3 fotos em grade centrada com imagens grandes.
 */
function renderPhotosBasic(photos) {
  if (!Array.isArray(photos) || photos.length === 0) {
    return '<p class="gallery-empty">As lembranças visuais deste Momentto serão adicionadas em breve.</p>';
  }

  const count = photos.length;

  // Layout centrado dependendo da quantidade de fotos
  let gridStyle;
  if (count === 1) {
    gridStyle = "grid-template-columns:1fr;max-width:520px;margin:0 auto;";
  } else if (count === 2) {
    gridStyle = "grid-template-columns:repeat(2,1fr);max-width:640px;margin:0 auto;";
  } else {
    gridStyle = "grid-template-columns:repeat(3,1fr);";
  }

  const imgHeight = count === 1 ? "360px" : count === 2 ? "300px" : "260px";

  const figures = photos
    .map(
      (photo, i) =>
        `<figure class="gallery-card" style="margin:0;">` +
        `<img src="${escapeHtml(photo)}" alt="Foto ${i + 1} do Momentto" loading="lazy" ` +
        `style="width:100%;height:${imgHeight};object-fit:cover;object-position:center;border-radius:18px;display:block;"></figure>`
    )
    .join("\n");

  return `<div class="gallery-grid" style="display:grid;gap:14px;${gridStyle}">${figures}</div>`;
}

/**
 * Plano Premium: slideshow animado Ken Burns + grade de thumbnails.
 */
function renderPhotosSlideshow(photos) {
  if (!Array.isArray(photos) || photos.length === 0) {
    return '<p class="gallery-empty">As lembranças visuais deste Momentto serão adicionadas em breve.</p>';
  }

  const N = photos.length;
  const perSlide = 5; // segundos por foto
  const total = N * perSlide;
  const step = 100 / N;
  const fade = Math.min(1.5, step * 0.08);

  const css = `<style>
.mm-slideshow{position:relative;width:100%;border-radius:20px;overflow:hidden;margin-bottom:20px;background:#111;}
.mm-slideshow-inner{position:relative;width:100%;padding-bottom:56.25%;/* 16:9 */}
.mm-slide{position:absolute;inset:0;opacity:0;animation:mmFade ${total.toFixed(1)}s linear infinite;}
.mm-slide img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;}
@keyframes mmFade{
  0%{opacity:0;transform:scale(1.06);}
  ${fade.toFixed(2)}%{opacity:1;transform:scale(1.08);}
  ${(step - fade).toFixed(2)}%{opacity:1;transform:scale(1.0);}
  ${step.toFixed(2)}%{opacity:0;transform:scale(0.97);}
  100%{opacity:0;}
}
.mm-dots{display:flex;justify-content:center;gap:8px;margin-top:12px;margin-bottom:20px;}
.mm-dot{width:8px;height:8px;border-radius:50%;background:rgba(0,0,0,0.18);}
</style>`;

  const slides = photos
    .map((photo, i) => {
      const delay = -(total - i * perSlide);
      return (
        `<div class="mm-slide" style="animation-delay:${delay.toFixed(1)}s">` +
        `<img src="${escapeHtml(photo)}" alt="Foto ${i + 1}" loading="${i === 0 ? "eager" : "lazy"}">` +
        `</div>`
      );
    })
    .join("\n");

  const dots = photos.map(() => `<div class="mm-dot"></div>`).join("\n");

  const thumbs = photos
    .map(
      (photo, i) =>
        `<figure class="gallery-card" style="margin:0;">` +
        `<img src="${escapeHtml(photo)}" alt="Foto ${i + 1}" loading="lazy" ` +
        `style="width:100%;height:200px;object-fit:cover;object-position:center;border-radius:16px;display:block;"></figure>`
    )
    .join("\n");

  const thumbCols =
    N <= 4 ? `repeat(${N},1fr)` : N <= 6 ? "repeat(3,1fr)" : "repeat(auto-fill,minmax(180px,1fr))";

  return (
    `${css}\n` +
    `<div class="mm-slideshow"><div class="mm-slideshow-inner">${slides}</div></div>\n` +
    `<div class="mm-dots">${dots}</div>\n` +
    `<div class="gallery-grid" style="display:grid;gap:12px;grid-template-columns:${thumbCols};">${thumbs}</div>`
  );
}

async function renderTemplate(templateName, data) {
  const templatePath = path.join(templatesRoot, templateName, "template.html");
  const rawTemplate = await fs.promises.readFile(templatePath, "utf8");

  const isPremium = data.plan === "premium";
  const photosHtml = isPremium
    ? renderPhotosSlideshow(data.photos)
    : renderPhotosBasic(data.photos);

  const replacements = {
    "{{recipientName}}": escapeHtml(data.recipientName),
    "{{senderName}}": escapeHtml(data.senderName),
    "{{date}}": escapeHtml(data.date || "Um dia inesquecível"),
    "{{message}}": escapeHtml(data.message).replace(/\n/g, "<br>"),
    "{{photos}}": photosHtml
  };

  return Object.entries(replacements).reduce(
    (html, [token, replacement]) => html.replaceAll(token, replacement),
    rawTemplate
  );
}

module.exports = {
  renderTemplate
};
