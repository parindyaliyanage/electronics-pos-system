import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 4000;

app.use(cors({
  origin: true,
  credentials: true,
}));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});