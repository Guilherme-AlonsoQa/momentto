/* =============================================
   MOMENTTO — Order Page JS
   ============================================= */

// ---- Plano selecionado ----
let selectedPlan = "basico";

const PLAN_CONFIG = {
  basico:  { maxPhotos: 3,  price: "R$ 29,90",  label: "Básico"  },
  premium: { maxPhotos: 10, price: "R$ 59,90",  label: "Premium" }
};

// ---- Elementos base ----
const orderForm        = document.getElementById("orderForm");
const planInput        = document.getElementById("planInput");
const photosInput      = document.getElementById("photosInput");
const proofInput       = document.getElementById("proofInput");
const photoPreview     = document.getElementById("photoPreview");
const previewCounter   = document.getElementById("previewCounter");
const proofPreviewText = document.getElementById("proofPreviewText");
const formStatus       = document.getElementById("formStatus");
const submitButton     = document.getElementById("submitButton");
const submitLabel      = document.getElementById("submitLabel");
const submitSpinner    = document.getElementById("submitSpinner");
const resultCard       = document.getElementById("resultCard");
const resultUrl        = document.getElementById("resultUrl");
const resultQr         = document.getElementById("resultQr");
const templateRadios   = document.querySelectorAll('input[name="template"]');
const samplePreviewCards = document.querySelectorAll("[data-template-preview]");

// ---- Step indicator ----
const stepIndicator = document.getElementById("stepIndicator");
const formSteps     = document.querySelectorAll(".form-step");
let currentStep = 1;
const TOTAL_STEPS = 4;

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

  // Atualizar cards de plano
  document.querySelectorAll(".plan-option").forEach((el) => {
    el.classList.toggle("plan-option-active", el.dataset.plan === plan);
  });

  const cfg = PLAN_CONFIG[plan];

  // Atualizar hints na sidebar
  const sidePhotoHint = document.getElementById("sidePhotoHint");
  const sidePriceHint = document.getElementById("sidePriceHint");
  if (sidePhotoHint) sidePhotoHint.textContent = `até ${cfg.maxPhotos} foto${cfg.maxPhotos > 1 ? "s" : ""}`;
  if (sidePriceHint) sidePriceHint.textContent = cfg.price;

  // Atualizar hint no step 3
  const photoStepHint = document.getElementById("photoStepHint");
  if (photoStepHint) {
    photoStepHint.textContent = `Envie até ${cfg.maxPhotos} foto${cfg.maxPhotos > 1 ? "s" : ""}. ${
      plan === "premium"
        ? "Elas vão aparecer em slideshow animado e na galeria da página gerada."
        : "Elas vão aparecer centralizadas na galeria da página gerada."
    }`;
  }

  // Atualizar hint no drop zone
  const photoDropHint = document.getElementById("photoDropHint");
  if (photoDropHint) {
    photoDropHint.textContent = `JPG, PNG, WEBP — até ${cfg.maxPhotos} foto${cfg.maxPhotos > 1 ? "s" : ""}, 10MB cada`;
  }

  // Atualizar valores no pagamento
  const paymentAmountLabel = document.getElementById("paymentAmountLabel");
  const pixAmountLabel     = document.getElementById("pixAmountLabel");
  const pixMockAmount      = document.getElementById("pixMockAmount");
  if (paymentAmountLabel) paymentAmountLabel.textContent = cfg.price;
  if (pixAmountLabel)     pixAmountLabel.textContent     = cfg.price;
  if (pixMockAmount)      pixMockAmount.textContent      = cfg.price;

  // Se já há fotos selecionadas, revalidar
  if (photosInput?.files?.length) {
    const files = Array.from(photosInput.files);
    if (files.length > cfg.maxPhotos) {
      setStatus(`O ${cfg.label} aceita no máximo ${cfg.maxPhotos} foto${cfg.maxPhotos > 1 ? "s" : ""}. Selecione novamente.`, "error");
      photosInput.value = "";
      renderPhotoPreview([]);
    }
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

  // Rola até o step indicator para manter o contexto visível
  const target = document.getElementById("stepIndicator") || document.querySelector(".order-shell");
  if (target) {
    const offset = target.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
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
  const photos    = Array.from(photosInput?.files || []);
  const maxPhotos = PLAN_CONFIG[selectedPlan].maxPhotos;

  if (photos.length === 0) {
    setStatus("Envie pelo menos uma foto.", "error");
    return;
  }

  if (photos.length > maxPhotos) {
    setStatus(
      `O Plano ${PLAN_CONFIG[selectedPlan].label} aceita no máximo ${maxPhotos} foto${maxPhotos > 1 ? "s" : ""}. Selecione novamente.`,
      "error"
    );
    return;
  }

  setStatus("");
  goToStep(4);
});

document.querySelectorAll(".step-back-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setStatus("");
    goToStep(parseInt(btn.dataset.back, 10));
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

// ---- Preview de fotos ----
function renderPhotoPreview(files) {
  photoPreview.innerHTML = "";

  if (!files.length) {
    previewCounter.textContent = "Nenhuma foto selecionada.";
    return;
  }

  const maxPhotos = PLAN_CONFIG[selectedPlan].maxPhotos;
  previewCounter.textContent = `${files.length} de ${maxPhotos} foto${maxPhotos > 1 ? "s" : ""} — pronta${files.length > 1 ? "s" : ""} para envio.`;

  files.forEach((file) => {
    const figure  = document.createElement("figure");
    const image   = document.createElement("img");
    const caption = document.createElement("figcaption");

    image.src = URL.createObjectURL(file);
    image.alt = file.name;
    image.onload = () => URL.revokeObjectURL(image.src);
    caption.textContent = file.name;

    figure.append(image, caption);
    photoPreview.appendChild(figure);
  });
}

photosInput?.addEventListener("change", () => {
  const files     = Array.from(photosInput.files || []);
  const maxPhotos = PLAN_CONFIG[selectedPlan].maxPhotos;

  if (files.length > maxPhotos) {
    setStatus(
      `O Plano ${PLAN_CONFIG[selectedPlan].label} aceita no máximo ${maxPhotos} foto${maxPhotos > 1 ? "s" : ""}. Selecione novamente.`,
      "error"
    );
    photosInput.value = "";
    renderPhotoPreview([]);
    return;
  }

  setStatus("");
  renderPhotoPreview(files);
});

// ---- Preview do comprovante ----
proofInput?.addEventListener("change", () => {
  const file = proofInput.files?.[0];
  if (proofPreviewText) {
    proofPreviewText.textContent = file
      ? `Comprovante selecionado: ${file.name}`
      : "Nenhum comprovante enviado ainda.";
  }
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

// ---- Copiar chave Pix ----
document.getElementById("pixCopyBtn")?.addEventListener("click", () => {
  const key = document.getElementById("pixKeyText")?.textContent || "";
  navigator.clipboard.writeText(key).then(() => {
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
    const keyEl = document.getElementById("pixKeyText");
    if (keyEl) {
      const range = document.createRange();
      range.selectNode(keyEl);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }
  });
});

// ---- Status ----
function setStatus(message, type = "") {
  if (formStatus) {
    formStatus.textContent = message;
    formStatus.className = `form-status ${type}`.trim();
  }
}

// ---- Loading state ----
function setLoading(loading) {
  submitButton.disabled = loading;
  if (submitLabel) submitLabel.textContent = loading ? "Gerando seu Momentto..." : "Criar meu Momentto agora";
  if (submitSpinner) submitSpinner.classList.toggle("hidden", !loading);
}

// ---- Submit ----
orderForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  resultCard?.classList.add("hidden");

  const photos    = Array.from(photosInput?.files || []);
  const proof     = proofInput?.files?.[0];
  const message   = orderForm.elements.message?.value.trim();
  const maxPhotos = PLAN_CONFIG[selectedPlan].maxPhotos;

  if (photos.length === 0)          { setStatus("Envie pelo menos uma foto.", "error"); return; }
  if (photos.length > maxPhotos)    { setStatus(`Máximo ${maxPhotos} foto${maxPhotos > 1 ? "s" : ""} para o Plano ${PLAN_CONFIG[selectedPlan].label}.`, "error"); return; }
  if (!proof)                       { setStatus("Envie o comprovante de pagamento Pix.", "error"); return; }
  if (message.length < 20)          { setStatus("A mensagem precisa ter no mínimo 20 caracteres.", "error"); return; }

  const formData = new FormData(orderForm);

  setLoading(true);
  setStatus("Montando sua página, publicando e gerando o QR Code… aguarde alguns instantes.");

  try {
    const response = await fetch("/api/orders", { method: "POST", body: formData });
    const payload  = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Não foi possível concluir seu pedido.");
    }

    if (resultUrl) { resultUrl.href = payload.url; resultUrl.textContent = payload.url; }
    if (resultQr)  resultQr.src = payload.qrBase64;
    resultCard?.classList.remove("hidden");

    setStatus("Pedido concluído! Seu link também foi enviado por e-mail.", "success");
    resultCard?.scrollIntoView({ behavior: "smooth", block: "start" });

    setupDownloadQr(payload.qrBase64);
    setupShareButtons(payload.url);

  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
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

  const files     = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
  const maxPhotos = PLAN_CONFIG[selectedPlan].maxPhotos;

  if (!files.length) { setStatus("Apenas imagens são aceitas.", "error"); return; }
  if (files.length > maxPhotos) {
    setStatus(
      `O Plano ${PLAN_CONFIG[selectedPlan].label} aceita no máximo ${maxPhotos} foto${maxPhotos > 1 ? "s" : ""}. Selecione até ${maxPhotos}.`,
      "error"
    );
    return;
  }

  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  photosInput.files = dt.files;

  setStatus("");
  renderPhotoPreview(files);
});

photoDropZone?.addEventListener("click", () => photosInput?.click());

// ---- Init ----
initPlanFromUrl();
syncTemplatePreview();
goToStep(1);
