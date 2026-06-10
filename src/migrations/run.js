require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs     = require('fs');
const path   = require('path');
const db     = require('../db');
const bcrypt = require('bcryptjs');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, '001_init.sql'), 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    db.raw.exec(stmt + ';');
  }
  console.log('[Migrate] Jadvallar yaratildi ✅');

  // 002 migration — last_seen ustuni (mavjud bo'lsa xatolik chiqmasin)
  try {
    const sql2 = fs.readFileSync(path.join(__dirname, '002_last_seen.sql'), 'utf8');
    db.raw.exec(sql2);
    console.log('[Migrate] 002_last_seen ✅');
  } catch (e) {
    if (!e.message?.includes('duplicate column')) console.warn('[Migrate] 002:', e.message);
  }

  const { POOL_URL, POOL_WALLET } = process.env;
  db.raw.prepare(`
    INSERT OR IGNORE INTO pool_config (id, pool_url, wallet)
    VALUES (1, ?, ?)
  `).run(POOL_URL || 'stratum+tcp://etc.2miners.com:1010', POOL_WALLET || '0x0000000000000000000000000000000000000000');

  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
  db.raw.prepare(`
    INSERT OR IGNORE INTO users (username, email, password, role)
    VALUES ('admin', ?, ?, 'admin')
  `).run(process.env.ADMIN_EMAIL || 'admin@etcmine.io', hash);

  console.log('[Migrate] Admin yaratildi ✅');
  console.log(`[Migrate] Login: ${process.env.ADMIN_EMAIL || 'admin@etcmine.io'} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
