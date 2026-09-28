const QRCode = require('qrcode');

// El contenido del QR es el qr_token en crudo, sin prefijos ni URLs: es
// exactamente lo que el escáner del staff manda a POST /api/scan/validate.
const renderQrPng = (qrToken) =>
  QRCode.toBuffer(qrToken, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
  });

module.exports = { renderQrPng };
