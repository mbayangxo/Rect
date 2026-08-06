require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { supabase } = require('./lib/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      return res.status(503).json({
        ok: false,
        supabase: false,
        error: error.message,
      });
    }
    return res.status(200).json({
      ok: true,
      supabase: true,
    });
  } catch (err) {
    console.error(err);
    return res.status(503).json({
      ok: false,
      supabase: false,
      error: err.message || 'health_check_failed',
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
  });
}
