import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware';
import { startScheduledJobs } from './jobs/overdueCheck';

const app = express();

// ── Middleware ──
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files (uploads) ──
app.use('/uploads', express.static(path.resolve(config.upload.dir)));

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ──
app.use('/api', routes);

// ── Error handling ──
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start server ──
const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`\n🚀 Electronics POS Backend running on port ${PORT}`);
  console.log(`   Environment: ${config.server.nodeEnv}`);
  console.log(`   API Base: http://localhost:${PORT}/api`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);

  // Start scheduled jobs
  startScheduledJobs();
});

export default app;
