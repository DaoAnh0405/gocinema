const fs = require('fs');
const path = require('path');

// SVG filenames correspond to the original Figma layers requested for export.
const files = {
  plus: 'plus.svg', edit: 'edit-16.svg', delete: 'delete.svg',
  avatar: 'generic-avatar.svg', 'account-arrow': 'arrow-drop-up.svg',
};

module.exports = function getPriceAssets() {
  return Object.fromEntries(Object.entries(files).map(([name, file]) => {
    const exists = fs.existsSync(path.join(__dirname, '../../public/images/prices', file));
    return [name, exists ? `/images/prices/${file}` : null];
  }));
};
