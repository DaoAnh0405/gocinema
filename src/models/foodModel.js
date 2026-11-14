const db = require('../config/db');
const { FOOD_STATUS } = require('../constants/foodConstants');

class FoodModel {
  static normalizeStatus(status) {
    if (status === FOOD_STATUS.SELLING || status === 1 || status === '1') return 1;
    if (status === FOOD_STATUS.STOPPED || status === 0 || status === '0') return 0;
    return 1;
  }

  static mapRow(row) {
    if (!row) return null;

    return {
      id: row.id ?? row.food_id,
      name: row.name ?? row.food_name,
      description: row.description ?? row.category ?? '',
      price: Number(row.price),
      status: Number(row.status) === 1 ? FOOD_STATUS.SELLING : FOOD_STATUS.STOPPED,
      image_url: row.image_url || null
    };
  }

  static async findAll({ search, status }) {
    let sql = `
      SELECT
        food_id AS id,
        food_name AS name,
        category AS description,
        price,
        status,
        image_url
      FROM food_items
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (food_name LIKE ? OR category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      const normalizedStatus = status === FOOD_STATUS.SELLING ? 1 : status === FOOD_STATUS.STOPPED ? 0 : Number(status);
      sql += ' AND status = ?';
      params.push(normalizedStatus);
    }

    sql += ' ORDER BY food_id DESC';
    const rows = await db.query(sql, params);
    return rows.map((row) => this.mapRow(row));
  }

  static async findById(id) {
    const rows = await db.query(
      `
        SELECT
          food_id AS id,
          food_name AS name,
          category AS description,
          price,
          status,
          image_url
        FROM food_items
        WHERE food_id = ?
      `,
      [id]
    );
    return this.mapRow(rows[0]);
  }

  static async create({ name, description, price, status, image_url }) {
    const result = await db.query(
      'INSERT INTO food_items (food_name, category, price, status, image_url) VALUES (?, ?, ?, ?, ?)',
      [name, description?.trim() || null, Number(price), this.normalizeStatus(status), image_url]
    );
    return result.insertId;
  }

  static async update(id, { name, description, price, status, image_url }) {
    const result = await db.query(
      'UPDATE food_items SET food_name = ?, category = ?, price = ?, status = ?, image_url = ? WHERE food_id = ?',
      [name, description?.trim() || null, Number(price), this.normalizeStatus(status), image_url, id]
    );
    return result.affectedRows;
  }

  static async delete(id) {
    const result = await db.query('DELETE FROM food_items WHERE food_id = ?', [id]);
    return result.affectedRows;
  }
}

module.exports = FoodModel;