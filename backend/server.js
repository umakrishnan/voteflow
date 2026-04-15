require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { initSchema } = require('./db/database');
const authRoutes = require('./routes/auth');
const electionRoutes = require('./routes/elections');
const voteRoutes = require('./routes/votes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/vote', voteRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`VoTally API running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });

