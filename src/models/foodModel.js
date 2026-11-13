const { query } = require('../config/db');

async function listActive() {
  return query(
    `SELECT food_id, food_name, category, price, image_url
       FROM food_items WHERE status = 1
      ORDER BY FIELD(category, 'COMBO', 'POPCORN', 'DRINK'), price`,
  );
}

async function findActiveByIds(ids) {
  if (!ids.length) return [];
  return query(
    `SELECT food_id, food_name, price FROM food_items WHERE status = 1 AND food_id IN (?)`,
    [ids],
  );
}

module.exports = { listActive, findActiveByIds };