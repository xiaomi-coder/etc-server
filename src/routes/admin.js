const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [users, active, totalHash, payoutSum] = await Promise.all([
      db.query("SELECT COUNT(*) as count FROM users WHERE role = 'user'"),
      db.query(`
        SELECT COUNT(DISTINCT user_id) as count FROM mining_stats
        WHERE recorded_at > datetime('now', '-10 minutes')
      `),
      db.query(`
        SELECT COALESCE(SUM(hashrate_mhs), 0) as total
        FROM mining_stats WHERE recorded_at > datetime('now', '-10 minutes')
      `),
      db.query("SELECT COALESCE(SUM(amount), 0) as total FROM payouts WHERE status = 'sent'"),
    ]);

    res.json({
      total_users:   parseInt(users.rows[0].count),
      active_miners: parseInt(active.rows[0].count),
      pool_hashrate: parseFloat(totalHash.rows[0].total),
      total_paid:    parseFloat(payoutSum.rows[0].total),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        u.id, u.username, u.email, u.is_active, u.balance, u.created_at,
        (SELECT hashrate_mhs FROM mining_stats
         WHERE user_id = u.id ORDER BY recorded_at DESC LIMIT 1) AS last_hashrate,
        (SELECT recorded_at FROM mining_stats
         WHERE user_id = u.id ORDER BY recorded_at DESC LIMIT 1) AS last_seen
      FROM users u WHERE u.role = 'user'
      ORDER BY u.created_at DESC
    `);
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Barcha maydonlarni to\'ldiring' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password) VALUES (?, ?, ?) RETURNING id, username, email, role, created_at`,
      [username.trim(), email.toLowerCase().trim(), hash]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Bu email/username band' });
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', async (req, res) => {
  const { is_active, balance } = req.body;
  const updates = [];
  const vals    = [];
  if (is_active !== undefined) { updates.push('is_active = ?'); vals.push(is_active ? 1 : 0); }
  if (balance   !== undefined) { updates.push('balance = ?');   vals.push(balance); }
  if (!updates.length) return res.status(400).json({ error: 'Hech narsa o\'zgartirilmadi' });

  vals.push(req.params.id);
  try {
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    await db.query("DELETE FROM users WHERE id = ? AND role != 'admin'", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/admin/pool
router.get('/pool', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM pool_config WHERE id = 1');
  res.json(rows[0] || {});
});

// PUT /api/admin/pool
router.put('/pool', async (req, res) => {
  const { pool_url, wallet, password, fee_pct } = req.body;
  try {
    await db.query(`
      INSERT INTO pool_config (id, pool_url, wallet, password, fee_pct, updated_at)
      VALUES (1, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (id) DO UPDATE
        SET pool_url = excluded.pool_url, wallet = excluded.wallet,
            password = excluded.password, fee_pct = excluded.fee_pct,
            updated_at = datetime('now')
    `, [pool_url, wallet, password || 'x', fee_pct || 1.0]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/admin/stats/hashrate
router.get('/stats/hashrate', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        strftime('%Y-%m-%d %H:00:00', recorded_at) AS hour,
        ROUND(AVG(hashrate_mhs), 2) AS avg_hashrate,
        COUNT(DISTINCT user_id) AS miners
      FROM mining_stats
      WHERE recorded_at > datetime('now', '-24 hours')
      GROUP BY 1 ORDER BY 1
    `);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/admin/payouts
router.get('/payouts', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*, u.username, u.email FROM payouts p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC LIMIT 100
    `);
    res.json({ payouts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/admin/payouts
router.post('/payouts', async (req, res) => {
  const { user_id, amount, tx_hash } = req.body;
  if (!user_id || !amount) return res.status(400).json({ error: 'user_id va amount kerak' });
  try {
    const { rows } = await db.query(
      `INSERT INTO payouts (user_id, amount, tx_hash, status) VALUES (?, ?, ?, 'sent') RETURNING *`,
      [user_id, amount, tx_hash || null]
    );
    await db.query('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, user_id]);
    res.status(201).json({ payout: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── Real pool daromadi (2miners API) ─────────────────────────────────
const POOL_API    = 'https://etc.2miners.com/api/accounts/';
const ETC_DIVISOR = 1e9; // 2miners ETC base unit → ETC

async function fetchPool(wallet) {
  const r = await fetch(POOL_API + wallet, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('Pool API ' + r.status);
  return r.json();
}

// GET /api/admin/earnings — haqiqiy pool balansi
router.get('/earnings', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT wallet FROM pool_config WHERE id = 1');
    const wallet = rows[0]?.wallet;
    if (!wallet) return res.status(400).json({ error: 'Wallet sozlanmagan' });

    const d = await fetchPool(wallet);
    const reward = i => ((d.sumrewards || []).find(s => s.inverval === i)?.reward || 0) / ETC_DIVISOR;

    res.json({
      wallet,
      currentHashrate: (d.currentHashrate || 0) / 1e6, // MH/s
      balance:       (d.stats?.balance  || 0) / ETC_DIVISOR,
      immature:      (d.stats?.immature || 0) / ETC_DIVISOR,
      reward24h:     reward(86400),
      reward7d:      reward(604800),
      sharesValid:   d.sharesValid   || 0,
      sharesInvalid: d.sharesInvalid || 0,
    });
  } catch (err) {
    res.status(502).json({ error: 'Pool API xatosi: ' + err.message });
  }
});

// GET /api/admin/distribution — har userning hissasi va hisoblangan ulushi
router.get('/distribution', async (req, res) => {
  try {
    // 24 soatlik hissa (hashrate yig'indisi = ish hajmi proxy)
    const { rows: contrib } = await db.query(`
      SELECT u.id, u.username, u.balance,
             COALESCE(SUM(m.hashrate_mhs), 0) AS work
      FROM users u
      LEFT JOIN mining_stats m ON m.user_id = u.id
        AND m.recorded_at > datetime('now', '-24 hours')
      WHERE u.role = 'user'
      GROUP BY u.id, u.username, u.balance
      ORDER BY work DESC
    `);
    const totalWork = contrib.reduce((s, u) => s + Number(u.work), 0) || 1;

    const { rows: cfg } = await db.query('SELECT wallet, fee_pct FROM pool_config WHERE id = 1');
    const wallet = cfg[0]?.wallet;
    const feePct = cfg[0]?.fee_pct ?? 1;

    let reward24h = 0, balance = 0;
    if (wallet) {
      try {
        const d = await fetchPool(wallet);
        reward24h = ((d.sumrewards || []).find(s => s.inverval === 86400)?.reward || 0) / ETC_DIVISOR;
        balance   = (d.stats?.balance || 0) / ETC_DIVISOR;
      } catch (_) {}
    }
    const distributable = reward24h * (1 - feePct / 100);

    const users = contrib.map(u => {
      const share = Number(u.work) / totalWork;
      return {
        id:         u.id,
        username:   u.username,
        work:       Math.round(Number(u.work)),
        share_pct:  +(share * 100).toFixed(2),
        owed_etc:   +(distributable * share).toFixed(8),
        balance:    u.balance,
      };
    });

    res.json({ reward24h, balance, fee_pct: feePct, distributable, total_work: Math.round(totalWork), users });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi: ' + err.message });
  }
});

module.exports = router;
