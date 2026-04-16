const orderForm = document.getElementById("orderForm");
const photosInput = document.getElementById("photosInput");
const proofInput = document.getElementById("proofInput");
const photoPreview = document.getElementById("photoPreview");
const previewCounter = document.getElementById("previewCounter");
const proofPreviewText = document.getElementById("proofPreviewText");
const formStatus = document.getElementById("formStatus");
const submitButton = document.getElementById("submitButton");
const resultCard = document.getElementById("resultCard");
const resultUrl = document.getElementById("resultUrl");
const resultQr = document.getElementById("resultQr");
const templateRadios = document.querySelectorAll('input[name="template"]');
const samplePreviewCards = document.querySelectorAll("[data-template-preview]");

function setStatus(message, type = "") {
  formStatus.textContent = message;
  formStatus.className = `form-status ${type}`.trim();
}

function renderPhotoPreview(files) {
  photoPreview.innerHTML = "";

  if (!files.length) {
    previewCounter.textContent = "Nenhuma foto selecionada.";
    return;
  }

  previewCounter.textContent = `${files.length} foto(s) pronta(s) para envio.`;

  files.forEach((file) => {
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    const caption = document.createElement("figcaption");

    image.src = URL.createObjectURL(file);
    image.alt = file.name;
    image.onload = () => URL.revokeObjectURL(image.src);

    caption.textContent = file.name;

    figure.append(image, caption);
    photoPreview.appendChild(figure);
  });
}

function syncTemplatePreview() {
  const selected = document.querySelector('input[name="template"]:checked')?.value;

  samplePreviewCards.forEach((card) => {
    card.classList.toggle("hidden", card.dataset.templatePreview !== selected);
  });
}

templateRadios.forEach((radio) => {
  radio.addEventListener("change", syncTemplatePreview);
});

photosInput.addEventListener("change", () => {
  const files = Array.from(photosInput.files || []);

  if (files.length > 10) {
    setStatus("Selecione no máximo 10 fotos.", "error");
    photosInput.value = "";
    renderPhotoPreview([]);
    return;
  }

  setStatus("");
  renderPhotoPreview(files);
});

proofInput.addEventListener("change", () => {
  const file = proofInput.files?.[0];
  proofPreviewText.textContent = file
    ? `Comprovante pronto para envio: ${file.name}`
    : "Nenhum comprovante enviado ainda.";
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  resultCard.classList.add("hidden");

  const photos = Array.from(photosInput.files || []);
  const proof = proofInput.files?.[0];
  const message = orderForm.elements.message.value.trim();

  if (photos.length === 0) {
    setStatus("Envie pelo menos uma foto.", "error");
    return;
  }

  if (photos.length > 10) {
    setStatus("Você pode enviar no máximo 10 fotos.", "error");
    return;
  }

  if (!proof) {
    setStatus("Envie o comprovante de pagamento Pix.", "error");
    return;
  }

  if (message.length < 20) {
    setStatus("A mensagem precisa ter no mínimo 20 caracteres.", "error");
    return;
  }

  const formData = new FormData(orderForm);

  submitButton.disabled = true;
  submitButton.textContent = "Gerando seu Momentto...";
  setStatus("Estamos montando a página, publicando no Netlify e preparando o QR Code.");

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      body: formData
    });

    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Não foi possível concluir seu pedido.");
    }

    resultUrl.href = payload.url;
    resultUrl.textContent = payload.url;
    resultQr.src = payload.qrBase64;
    resultCard.classList.remove("hidden");
    setStatus("Pedido concluído com sucesso. Seu link também foi enviado por e-mail.", "success");
    orderForm.reset();
    renderPhotoPreview([]);
    proofPreviewText.textContent = "Nenhum comprovante enviado ainda.";
    syncTemplatePreview();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Criar meu Momentto";
  }
});

syncTemplatePreview();
