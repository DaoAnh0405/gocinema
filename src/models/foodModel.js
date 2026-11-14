const db = require('../config/db');

class FoodModel {
  static async findAll({ search, status }) {
    let sql = 'SELECT * FROM foods WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY id DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.query('SELECT * FROM foods WHERE id = ?', [id]);
    return rows[0];
  }

  static async create({ name, description, price, status, image_url }) {
    const [result] = await db.query(
      'INSERT INTO foods (name, description, price, status, image_url) VALUES (?, ?, ?, ?, ?)',
      [name, description, price, status, image_url]
    );
    return result.insertId;
  }

  static async update(id, { name, description, price, status, image_url }) {
    const [result] = await db.query(
      'UPDATE foods SET name = ?, description = ?, price = ?, status = ?, image_url = ? WHERE id = ?',
      [name, description, price, status, image_url, id]
    );
    return result.affectedRows;
  }

  static async delete(id) {
    const [result] = await db.query('DELETE FROM foods WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

module.exports = FoodModel;