function pairCoupleSeats(cells, coupleType, existingPairs = []) {
  if (!coupleType) return [];
  const pairs = [];
  const occupied = new Set();
  for (const [row, column] of existingPairs) {
    const first = `${row}:${column}`;
    const second = `${row}:${column + 1}`;
    if (cells[row]?.[column] !== coupleType || cells[row]?.[column + 1] !== coupleType ||
        occupied.has(first) || occupied.has(second)) continue;
    pairs.push([row, column]);
    occupied.add(first);
    occupied.add(second);
  }
  for (let row = 0; row < cells.length; row++) {
    for (let column = 0; column < cells[row].length - 1; column++) {
      const first = `${row}:${column}`;
      const second = `${row}:${column + 1}`;
      if (cells[row][column] !== coupleType || cells[row][column + 1] !== coupleType ||
          occupied.has(first) || occupied.has(second)) continue;
      pairs.push([row, column]);
      occupied.add(first);
      occupied.add(second);
    }
  }
  return pairs.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
}

if (typeof module !== 'undefined' && module.exports) module.exports = pairCoupleSeats;
