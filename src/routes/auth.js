const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email va parol kiriting' });

  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('[Auth] Login xatosi:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, email, role, balance, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Barcha maydonlarni to\'ldiring' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Parol kamida 6 ta belgi bo\'lishi kerak' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password) VALUES (?, ?, ?) RETURNING id, username, email, role`,
      [username.trim(), email.toLowerCase().trim(), hash]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email yoki username allaqachon mavjud' });
    }
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
