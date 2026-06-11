const router = require('express').Router();
const db     = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/mining/pool-info
router.get('/pool-info', requireAuth, async (req, res) => {
  try {
    // Bloklangan akkaunt mining qila olmaydi
    const u = await db.query('SELECT is_active FROM users WHERE id = ?', [req.user.id]);
    if (u.rows[0] && !u.rows[0].is_active) {
      return res.status(403).json({ error: 'Akkaunt bloklangan', blocked: true });
    }

    const { rows } = await db.query('SELECT * FROM pool_config WHERE id = 1');
    const cfg = rows[0];
    if (!cfg) return res.status(503).json({ error: 'Pool sozlanmagan' });

    res.json({
      pool:     cfg.pool_url,
      wallet:   cfg.wallet,
      worker:   req.user.username,
      password: cfg.password,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/mining/stats
router.post('/stats', requireAuth, async (req, res) => {
  const { hashrate_mhs = 0, temperature = 0, shares_ok = 0, power_draw = 0 } = req.body;
  try {
    await db.query(
      `INSERT INTO mining_stats (user_id, hashrate_mhs, temperature, shares_ok, power_draw)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, hashrate_mhs, temperature, shares_ok, power_draw]
    );

    // 1 MH/s * 1 chaqiruv = 0.000001 ETC (taxminiy model)
    const earned = parseFloat(hashrate_mhs) * 0.000001;
    if (earned > 0) {
      await db.query(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [earned, req.user.id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/mining/heartbeat
router.post('/heartbeat', requireAuth, async (req, res) => {
  try {
    const u = await db.query('SELECT is_active FROM users WHERE id = ?', [req.user.id]);
    const active = u.rows[0] ? !!u.rows[0].is_active : true;
    // Faqat faol akkaunt online sanaladi
    if (active) {
      await db.query("UPDATE users SET last_seen = datetime('now') WHERE id = ?", [req.user.id]);
    }
    res.json({ ok: true, active });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/mining/my-stats
router.get('/my-stats', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT hashrate_mhs, temperature, shares_ok, power_draw, recorded_at
       FROM mining_stats WHERE user_id = ?
       ORDER BY recorded_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ stats: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
