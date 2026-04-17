/* =============================================
   MOMENTTO — Order Page JS
   ============================================= */

// ---- Plano selecionado ----
let selectedPlan = "basico";

// ---- Fotos acumuladas ----
let collectedFiles = [];

const PLAN_CONFIG = {
  basico:  { maxPhotos: 3,  price: "R$ 29,90",  label: "Básico"  },
  premium: { maxPhotos: 10, price: "R$ 59,90",  label: "Premium" }
};

// ---- Elementos base ----
const orderForm      = document.getElementById("orderForm");
const planInput      = document.getElementById("planInput");
const photosInput    = document.getElementById("photosInput");
const photoPreview   = document.getElementById("photoPreview");
const previewCounter = document.getElementById("previewCounter");
const formStatus     = document.getElementById("formStatus");
const resultCard     = document.getElementById("resultCard");
const resultUrl      = document.getElementById("resultUrl");
const resultQr       = document.getElementById("resultQr");
const templateRadios     = document.querySelectorAll('input[name="template"]');
const samplePreviewCards = document.querySelectorAll("[data-template-preview]");

// ---- Elementos do fluxo Pix ----
const pixLoading      = document.getElementById("pixLoading");
const pixPaymentPanel = document.getElementById("pixPaymentPanel");
const pixErrorPanel   = document.getElementById("pixErrorPanel");
const pixErrorMsg     = document.getElementById("pixErrorMsg");
const pixPollingBar   = document.getElementById("pixPollingBar");
const pixPollingText  = document.getElementById("pixPollingText");
const pixCheckBtn     = document.getElementById("pixCheckBtn");
const pixRetryBtn     = document.getElementById("pixRetryBtn");
const pixCopiaCola    = document.getElementById("pixCopiaCola");
const pixQrCodeImg    = document.getElementById("pixQrCodeImg");

// ---- Step indicator ----
const stepIndicator = document.getElementById("stepIndicator");
const formSteps     = document.querySelectorAll(".form-step");
let currentStep = 1;
const TOTAL_STEPS = 4;

// ---- Estado do Pix ----
let pixPaymentId  = null;
let pixPollTimer  = null;
let pixPollActive = false;

// ---- Inicialização do plano via URL param ----
function initPlanFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const urlPlan = params.get("plano");
  if (urlPlan === "premium" || urlPlan === "basico") {
    applyPlan(urlPlan);
  }
}

// ---- Aplicar plano ----
function applyPlan(plan) {
  if (!PLAN_CONFIG[plan]) return;
  selectedPlan = plan;

  if (planInput) planInput.value = plan;

  document.querySelectorAll(".plan-option").forEach((el) => {
    el.classList.toggle("plan-option-active", el.dataset.plan === plan);
  });

  const cfg = PLAN_CONFIG[plan];

  const sidePhotoHint = document.getElementById("sidePhotoHint");
  const sidePriceHint = document.getElementById("sidePriceHint");
  if (sidePhotoHint) sidePhotoHint.textContent = `até ${cfg.maxPhotos} foto${cfg.maxPhotos > 1 ? "s" : ""}`;
  if (sidePriceHint) sidePriceHint.textContent = cfg.price;

  const photoStepHint = document.getElementById("photoStepHint");
  if (photoStepHint) {
    photoStepHint.textContent = `Envie até ${cfg.maxPhotos} foto${cfg.maxPhotos > 1 ? "s" : ""}. ${
      plan === "premium"
        ? "Elas vão aparecer em slideshow animado e na galeria da página gerada."
        : "Elas vão aparecer centralizadas na galeria da página gerada."
    }`;
  }

  const photoDropHint = document.getElementById("photoDropHint");
  if (photoDropHint) {
    photoDropHint.textContent = `JPG, PNG, WEBP — até ${cfg.maxPhotos} foto${cfg.maxPhotos > 1 ? "s" : ""}, 10MB cada`;
  }

  const paymentAmountLabel = document.getElementById("paymentAmountLabel");
  const pixAmountLabel     = document.getElementById("pixAmountLabel");
  if (paymentAmountLabel) paymentAmountLabel.textContent = cfg.price;
  if (pixAmountLabel)     pixAmountLabel.textContent     = cfg.price;

  if (collectedFiles.length > cfg.maxPhotos) {
    setStatus(`O ${cfg.label} aceita no máximo ${cfg.maxPhotos} foto${cfg.maxPhotos > 1 ? "s" : ""}. As fotos excedentes foram removidas.`, "error");
    collectedFiles = collectedFiles.slice(0, cfg.maxPhotos);
    syncInputFiles();
    renderPhotoPreview(collectedFiles);
  }
}

// ---- Seleção de plano ----
document.querySelectorAll(".plan-option").forEach((card) => {
  function selectPlan() {
    applyPlan(card.dataset.plan);
    setStatus("");
  }
  card.addEventListener("click", selectPlan);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectPlan(); }
  });
});

// ---- Navegação entre passos ----
function goToStep(n) {
  currentStep = Math.max(1, Math.min(TOTAL_STEPS, n));

  formSteps.forEach((step) => {
    const stepNum = parseInt(step.id.replace("step", ""), 10);
    step.classList.toggle("hidden", stepNum !== currentStep);
  });

  if (stepIndicator) {
    stepIndicator.querySelectorAll(".step-item").forEach((item) => {
      const num = parseInt(item.dataset.step, 10);
      item.classList.toggle("step-active", num === currentStep);
      item.classList.toggle("step-done", num < currentStep);
    });
  }

  const target = document.getElementById("stepIndicator") || document.querySelector(".order-shell");
  if (target) {
    const offset = target.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
  }

  if (currentStep === 4) {
    initPixPayment();
  }
}

document.getElementById("step1Next")?.addEventListener("click", () => goToStep(2));

document.getElementById("step2Next")?.addEventListener("click", () => {
  const recipientName = orderForm.elements.recipientName?.value.trim();
  const senderName    = orderForm.elements.senderName?.value.trim();
  const email         = orderForm.elements.email?.value.trim();
  const message       = orderForm.elements.message?.value.trim();

  if (!recipientName || !senderName || !email) {
    setStatus("Preencha nome de quem recebe, nome de quem envia e e-mail.", "error");
    return;
  }

  if (!email.includes("@")) {
    setStatus("Digite um e-mail válido.", "error");
    return;
  }

  if (message.length < 20) {
    setStatus("A mensagem precisa ter pelo menos 20 caracteres.", "error");
    return;
  }

  setStatus("");
  goToStep(3);
});

document.getElementById("step3Next")?.addEventListener("click", () => {
  const maxPhotos = PLAN_CONFIG[selectedPlan].maxPhotos;

  if (collectedFiles.length === 0) {
    setStatus("Envie pelo menos uma foto.", "error");
    return;
  }

  if (collectedFiles.length > maxPhotos) {
    setStatus(
      `O Plano ${PLAN_CONFIG[selectedPlan].label} aceita no máximo ${maxPhotos} foto${maxPhotos > 1 ? "s" : ""}. Remova as excedentes.`,
      "error"
    );
    return;
  }

  setStatus("");
  goToStep(4);
});

document.querySelectorAll(".step-back-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const backTo = parseInt(btn.dataset.back, 10);
    if (currentStep === 4) {
      stopPixPolling();
      resetPixState();
    }
    setStatus("");
    goToStep(backTo);
  });
});

// ---- Preview de template ----
function syncTemplatePreview() {
  const selected = document.querySelector('input[name="template"]:checked')?.value;
  samplePreviewCards.forEach((card) => {
    card.classList.toggle("hidden", card.dataset.templatePreview !== selected);
  });
}

templateRadios.forEach((radio) => radio.addEventListener("change", syncTemplatePreview));

// ---- Sincroniza o input com collectedFiles ----
function syncInputFiles() {
  const dt = new DataTransfer();
  collectedFiles.forEach((f) => dt.items.add(f));
  photosInput.files = dt.files;
}

// ---- Preview de fotos (com botão de remover) ----
function renderPhotoPreview(files) {
  photoPreview.innerHTML = "";

  if (!files.length) {
    previewCounter.textContent = "Nenhuma foto selecionada.";
    return;
  }

  const maxPhotos = PLAN_CONFIG[selectedPlan].maxPhotos;
  const remaining = maxPhotos - files.length;
  previewCounter.textContent = `${files.length} de ${maxPhotos} foto${maxPhotos > 1 ? "s" : ""} — pronta${files.length > 1 ? "s" : ""} para envio.${remaining > 0 ? ` Você ainda pode adicionar ${remaining} mais.` : ""}`;

  files.forEach((file, index) => {
    const figure    = document.createElement("figure");
    const removeBtn = document.createElement("button");
    const image     = document.createElement("img");
    const caption   = document.createElement("figcaption");

    removeBtn.type = "button";
    removeBtn.className = "photo-remove-btn";
    removeBtn.setAttribute("aria-label", `Remover ${file.name}`);
    removeBtn.textContent = "×";
    removeBtn.onclick = () => {
      collectedFiles.splice(index, 1);
      syncInputFiles();
      setStatus("");
      renderPhotoPreview(collectedFiles);
    };

    image.src = URL.createObjectURL(file);
    image.alt = file.name;
    image.onload = () => URL.revokeObjectURL(image.src);
    caption.textContent = file.name;

    figure.classList.add("photo-preview-figure");
    figure.append(removeBtn, image, caption);
    photoPreview.appendChild(figure);
  });
}

// ---- Mescla novos arquivos com os já selecionados ----
function mergeIntoCollected(newFiles) {
  const maxPhotos = PLAN_CONFIG[selectedPlan].maxPhotos;

  const toAdd = newFiles.filter(
    (nf) => !collectedFiles.some((ef) => ef.name === nf.name && ef.size === nf.size)
  );

  const merged = [...collectedFiles, ...toAdd];

  if (merged.length > maxPhotos) {
    setStatus(
      `O Plano ${PLAN_CONFIG[selectedPlan].label} aceita no máximo ${maxPhotos} foto${maxPhotos > 1 ? "s" : ""}. As excedentes foram ignoradas.`,
      "error"
    );
    return merged.slice(0, maxPhotos);
  }

  setStatus("");
  return merged;
}

photosInput?.addEventListener("change", () => {
  const newFiles = Array.from(photosInput.files || []);
  if (!newFiles.length) return;

  collectedFiles = mergeIntoCollected(newFiles);
  syncInputFiles();
  renderPhotoPreview(collectedFiles);
});

// ---- Contador de caracteres da mensagem ----
const msgArea    = orderForm?.elements.message;
const msgCounter = document.getElementById("msgCounter");

msgArea?.addEventListener("input", () => {
  const len = msgArea.value.length;
  if (msgCounter) {
    msgCounter.textContent = `${len} caractere${len !== 1 ? "s" : ""}`;
    msgCounter.style.color = len < 20 ? "#9c3d3d" : "#406638";
  }
});

// ---- Status ----
function setStatus(message, type = "") {
  if (formStatus) {
    formStatus.textContent = message;
    formStatus.className = `form-status ${type}`.trim();
  }
}

// ====== FLUXO PIX ======

// ---- Resetar painel Pix para estado inicial ----
function resetPixState() {
  pixPaymentId = null;
  if (pixLoading)      pixLoading.classList.remove("hidden");
  if (pixPaymentPanel) pixPaymentPanel.classList.add("hidden");
  if (pixErrorPanel)   pixErrorPanel.classList.add("hidden");
  if (pixQrCodeImg)    { pixQrCodeImg.src = ""; pixQrCodeImg.style.display = "none"; }
  if (pixCopiaCola)    pixCopiaCola.textContent = "";
  if (pixPollingText)  pixPollingText.textContent = "Aguardando confirmação do pagamento…";
  if (pixPollingBar) {
    pixPollingBar.style.background  = "";
    pixPollingBar.style.borderColor = "";
  }
}

// ---- Parar polling ----
function stopPixPolling() {
  pixPollActive = false;
  if (pixPollTimer) {
    clearTimeout(pixPollTimer);
    pixPollTimer = null;
  }
}

// ---- Verificar status do pagamento (chamado em loop) ----
async function checkPixStatus() {
  if (!pixPaymentId || !pixPollActive) return;

  try {
    const res  = await fetch(`/api/pix/status/${pixPaymentId}`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Erro ao verificar pagamento.");
    }

    const status = data.status;

    if (status === "approved") {
      stopPixPolling();

      if (pixPollingBar) {
        pixPollingBar.style.background  = "rgba(64,102,56,0.12)";
        pixPollingBar.style.borderColor = "rgba(64,102,56,0.4)";
      }
      if (pixPollingText) pixPollingText.textContent = "Pagamento confirmado! Gerando seu Momentto…";

      if (resultUrl) { resultUrl.href = data.url; resultUrl.textContent = data.url; }
      if (resultQr)  resultQr.src = data.qrBase64;
      resultCard?.classList.remove("hidden");

      setStatus("Pedido concluído! Seu link também foi enviado por e-mail.", "success");
      resultCard?.scrollIntoView({ behavior: "smooth", block: "start" });

      setupDownloadQr(data.qrBase64);
      setupShareButtons(data.url);
      return;
    }

    if (status === "rejected" || status === "cancelled") {
      stopPixPolling();
      setStatus("Pagamento não aprovado. Clique em 'Tentar novamente' para gerar um novo Pix.", "error");
      return;
    }

    // Ainda pendente — re-agendar
    if (pixPollActive) {
      pixPollTimer = setTimeout(checkPixStatus, 3000);
    }

  } catch (error) {
    if (pixPollActive) {
      pixPollTimer = setTimeout(checkPixStatus, 5000);
    }
    setStatus(error.message, "error");
  }
}

// ---- Iniciar polling automático ----
function startPixPolling() {
  stopPixPolling();
  pixPollActive = true;
  pixPollTimer  = setTimeout(checkPixStatus, 3000);
}

// ---- Montar FormData com dados atuais do formulário ----
function buildPixFormData() {
  const fd = new FormData();
  fd.append("plan",          selectedPlan);
  fd.append("template",      document.querySelector('input[name="template"]:checked')?.value || "");
  fd.append("recipientName", orderForm.elements.recipientName?.value.trim() || "");
  fd.append("senderName",    orderForm.elements.senderName?.value.trim()    || "");
  fd.append("email",         orderForm.elements.email?.value.trim()         || "");
  fd.append("specialDate",   orderForm.elements.specialDate?.value.trim()   || "");
  fd.append("message",       orderForm.elements.message?.value.trim()       || "");
  collectedFiles.forEach((f) => fd.append("photos", f));
  return fd;
}

// ---- Iniciar pagamento Pix ----
async function initPixPayment() {
  stopPixPolling();
  resetPixState();
  setStatus("");

  try {
    const res  = await fetch("/api/pix/create", { method: "POST", body: buildPixFormData() });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Não foi possível gerar o Pix.");
    }

    pixPaymentId = data.paymentId;

    if (pixCopiaCola) pixCopiaCola.textContent = data.pixQrCode;
    if (pixQrCodeImg) {
      pixQrCodeImg.src = data.pixQrCodeBase64;
      pixQrCodeImg.style.display = "block";
    }

    if (pixLoading)      pixLoading.classList.add("hidden");
    if (pixPaymentPanel) pixPaymentPanel.classList.remove("hidden");

    startPixPolling();

  } catch (error) {
    if (pixLoading)    pixLoading.classList.add("hidden");
    if (pixErrorPanel) pixErrorPanel.classList.remove("hidden");
    if (pixErrorMsg)   pixErrorMsg.textContent = error.message;
  }
}

// ---- Botão: copiar código Pix Copia e Cola ----
document.getElementById("pixCopyBtn")?.addEventListener("click", () => {
  const code = pixCopiaCola?.textContent || "";
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById("pixCopyBtn");
    if (btn) {
      const original = btn.innerHTML;
      btn.textContent = "Copiado!";
      btn.style.background = "rgba(64,102,56,0.15)";
      btn.style.color = "#406638";
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.background = "";
        btn.style.color = "";
      }, 2000);
    }
  }).catch(() => {
    if (pixCopiaCola) {
      const range = document.createRange();
      range.selectNode(pixCopiaCola);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }
  });
});

// ---- Botão: verificar pagamento manualmente ----
pixCheckBtn?.addEventListener("click", () => {
  stopPixPolling();
  if (pixPollingText) pixPollingText.textContent = "Verificando…";
  pixPollActive = true;
  checkPixStatus();
});

// ---- Botão: tentar novamente após erro ----
pixRetryBtn?.addEventListener("click", () => {
  initPixPayment();
});

// ---- Download QR ----
function setupDownloadQr(qrBase64) {
  const btn = document.getElementById("downloadQrBtn");
  if (!btn) return;
  btn.onclick = () => {
    const a = document.createElement("a");
    a.href = qrBase64;
    a.download = "momentto-qrcode.png";
    a.click();
  };
}

// ---- Compartilhamento ----
function setupShareButtons(url) {
  const whatsappBtn = document.getElementById("shareWhatsapp");
  const copyBtn     = document.getElementById("shareCopy");

  if (whatsappBtn) {
    whatsappBtn.onclick = () => {
      const text = encodeURIComponent(`Acesse meu Momentto: ${url}`);
      window.open(`https://wa.me/?text=${text}`, "_blank", "noreferrer");
    };
  }

  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.textContent = "Link copiado!";
        setTimeout(() => { copyBtn.textContent = "Copiar link"; }, 2000);
      });
    };
  }
}

// ---- Drag & drop nas fotos ----
const photoDropZone = document.getElementById("photoDropZone");

photoDropZone?.addEventListener("dragover", (e) => {
  e.preventDefault();
  photoDropZone.style.borderColor = "rgba(201,168,76,0.85)";
  photoDropZone.style.background  = "rgba(255,249,236,0.95)";
});

photoDropZone?.addEventListener("dragleave", () => {
  photoDropZone.style.borderColor = "";
  photoDropZone.style.background  = "";
});

photoDropZone?.addEventListener("drop", (e) => {
  e.preventDefault();
  photoDropZone.style.borderColor = "";
  photoDropZone.style.background  = "";

  const newFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
  if (!newFiles.length) { setStatus("Apenas imagens são aceitas.", "error"); return; }

  collectedFiles = mergeIntoCollected(newFiles);
  syncInputFiles();
  renderPhotoPreview(collectedFiles);
});

// ---- Init ----
initPlanFromUrl();
syncTemplatePreview();
goToStep(1);
