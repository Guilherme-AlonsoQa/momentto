const QRCode = require("qrcode");

async function generateQrCodeDataUrl(url) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 360,
    color: {
      dark: "#2C2C2A",
      light: "#FAFAF7"
    }
  });
}

module.exports = {
  generateQrCodeDataUrl
};
