// Node.js 22.5+ built-in SQLite — native compilation shart emas
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'etcmine.db');
const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// PostgreSQL $1,$2... → SQLite ?
function pgToSqlite(sql) {
  return sql.replace(/\$\d+/g, '?');
}

// PostgreSQL datetime funksiyalari → SQLite
function fixDatetime(sql) {
  return sql
    .replace(/NOW\(\)/gi, "datetime('now')")
    .replace(/INTERVAL\s+'(\d+)\s+minutes?'/gi, "'-$1 minutes'")
    .replace(/INTERVAL\s+'(\d+)\s+hours?'/gi,   "'-$1 hours'")
    .replace(/INTERVAL\s+'(\d+)\s+days?'/gi,    "'-$1 days'")
    .replace(/date_trunc\('hour',\s*([^)]+)\)/gi, "strftime('%Y-%m-%d %H:00:00', $1)")
    .replace(/::numeric/gi, '')
    .replace(/::text/gi, '');
}

function convertSql(sql) {
  return fixDatetime(pgToSqlite(sql));
}

const dbModule = {
  async query(sql, params = []) {
    const converted = convertSql(sql.trim());

    if (/RETURNING/i.test(converted)) {
      const mainSql = converted.replace(/\s+RETURNING[\s\S]*/i, '');
      const stmt = db.prepare(mainSql);
      const info = stmt.run(...params);

      const tableMatch = mainSql.match(/(?:INSERT\s+INTO|UPDATE)\s+(\w+)/i);
      const tableName = tableMatch?.[1];
      if (tableName && info.lastInsertRowid) {
        const row = db.prepare(`SELECT * FROM ${tableName} WHERE rowid = ?`).get(info.lastInsertRowid);
        return { rows: row ? [row] : [] };
      }
      return { rows: [] };
    }

    const upper = converted.toUpperCase().trimStart();
    if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
      const rows = db.prepare(converted).all(...params);
      return { rows };
    }

    db.prepare(converted).run(...params);
    return { rows: [], rowCount: 0 };
  },

  raw: db,
};

module.exports = dbModule;
