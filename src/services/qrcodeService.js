const QRCode = require('qrcode');

// trả về chuỗi data:image/png;base64,... để nhúng thẳng vào thẻ <img>
const toDataUrl = (text) => QRCode.toDataURL(text, { margin: 1, width: 200, errorCorrectionLevel: 'M' });
const toBuffer = (text) => QRCode.toBuffer(text, { margin: 1, width: 280, errorCorrectionLevel: 'M' });

module.exports = { toDataUrl, toBuffer };