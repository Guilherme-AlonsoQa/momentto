const fs = require("fs");
const path = require("path");

const templatesRoot = path.join(__dirname, "..", "..", "frontend", "templates");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) {
    return '<p class="gallery-empty">As lembranças visuais deste Momentto serão adicionadas em breve.</p>';
  }

  return photos
    .map(
      (photo, index) =>
        `<figure class="gallery-card"><img src="${escapeHtml(photo)}" alt="Foto ${index + 1} do Momentto" loading="lazy"></figure>`
    )
    .join("\n");
}

async function renderTemplate(templateName, data) {
  const templatePath = path.join(templatesRoot, templateName, "template.html");
  const rawTemplate = await fs.promises.readFile(templatePath, "utf8");

  const replacements = {
    "{{recipientName}}": escapeHtml(data.recipientName),
    "{{senderName}}": escapeHtml(data.senderName),
    "{{date}}": escapeHtml(data.date || "Um dia inesquecível"),
    "{{message}}": escapeHtml(data.message).replace(/\n/g, "<br>"),
    "{{photos}}": renderPhotos(data.photos)
  };

  return Object.entries(replacements).reduce(
    (html, [token, replacement]) => html.replaceAll(token, replacement),
    rawTemplate
  );
}

module.exports = {
  renderTemplate
};
