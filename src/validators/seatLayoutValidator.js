const AppError = require('../utils/AppError');

module.exports = function parseLayout(value) {
  let layout = value;
  if (typeof value === 'string') {
    try { layout = JSON.parse(value); }
    catch { throw new AppError('Dữ liệu sơ đồ ghế không hợp lệ.', 400); }
  }
  if (!layout || !Number.isInteger(layout.rows) || layout.rows < 1 || layout.rows > 702 ||
      !Number.isInteger(layout.columns) || layout.columns < 1 || layout.columns > 100 ||
      !Array.isArray(layout.cells) || layout.cells.length !== layout.rows) {
    throw new AppError('Số hàng phải từ 1–702 và số cột phải từ 1–100.', 400);
  }
  if (layout.cells.some((row) => !Array.isArray(row) || row.length !== layout.columns ||
      row.some((type) => !Number.isInteger(type) || type < 0 || type > 2147483647))) {
    throw new AppError('Vị trí hoặc loại ghế trong sơ đồ không hợp lệ.', 400);
  }
  if (layout.pairs !== undefined) {
    if (!Array.isArray(layout.pairs) || layout.pairs.length > Math.floor(layout.rows * layout.columns / 2)) {
      throw new AppError('Danh sách ghế đôi không hợp lệ.', 400);
    }
    const occupied = new Set();
    for (const pair of layout.pairs) {
      if (!Array.isArray(pair) || pair.length !== 2 || !Number.isInteger(pair[0]) ||
          !Number.isInteger(pair[1]) || pair[0] < 0 || pair[0] >= layout.rows ||
          pair[1] < 0 || pair[1] + 1 >= layout.columns) {
        throw new AppError('Ghế đôi phải gồm hai vị trí liền nhau trong cùng hàng.', 400);
      }
      const first = `${pair[0]}:${pair[1]}`;
      const second = `${pair[0]}:${pair[1] + 1}`;
      if (occupied.has(first) || occupied.has(second)) throw new AppError('Một vị trí không thể thuộc nhiều ghế đôi.', 400);
      occupied.add(first);
      occupied.add(second);
    }
  }
  return { rows: layout.rows, columns: layout.columns, cells: layout.cells, pairs: layout.pairs };
};
