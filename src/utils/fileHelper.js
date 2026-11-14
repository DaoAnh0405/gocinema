const fs = require('fs');
const path = require('path');

exports.deletePublicFile = (relativePath) => {
  if (!relativePath) return;
  const fullPath = path.join(__dirname, '../../public', relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};