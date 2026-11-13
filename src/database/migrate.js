const fs = require('fs/promises');
const path = require('path');
const { query } = require('../config/db');

module.exports = async function migrate() {
  const sql = await fs.readFile(path.join(__dirname, 'migrations/001-room-layouts.sql'), 'utf8');
  await query(sql);
  const columns = await query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'room_layouts' AND COLUMN_NAME = 'couple_pairs'`);
  if (!columns.length) {
    const pairsSql = await fs.readFile(path.join(__dirname, 'migrations/002-couple-pairs.sql'), 'utf8');
    try { await query(pairsSql); }
    catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
};
