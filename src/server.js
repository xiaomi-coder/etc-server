require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const app = require('./app');
const db  = require('./db');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    db.raw.prepare('SELECT 1').get();
    console.log('[DB] SQLite ulandi ✅');
  } catch (err) {
    console.error('[DB] Xato:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[Server] http://localhost:${PORT} da ishlamoqda ✅`);
    console.log(`[Admin]  http://localhost:${PORT}/admin`);
    console.log(`\nDiqqat: Birinchi marta ishlatayotgan bo'lsangiz:\n  cd server && npm run migrate\n`);
  });
}

start();
