const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth',   require('./routes/auth'));
app.use('/api/mining', require('./routes/mining'));
app.use('/api/admin',  require('./routes/admin'));

app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

app.get('/health', (req, res) => res.json({ ok: true, time: new Date() }));

module.exports = app;
