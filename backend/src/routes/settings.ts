import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../database/pool';
import { authenticate, authorize, validate, AppError } from '../middleware';

const router = Router();
router.use(authenticate);

// GET /api/settings
router.get('/', async (_req: Request, res: Response) => {
  const { rows } = await query(`SELECT * FROM settings ORDER BY key`);
  const settings: Record<string, string> = {};
  rows.forEach((r: any) => { settings[r.key] = r.value; });
  res.json(settings);
});

// PUT /api/settings (admin only)
const updateSettingsSchema = z.record(z.string(), z.string());

router.put('/', authorize('admin'), validate(updateSettingsSchema), async (req: Request, res: Response) => {
  const settings = req.body;
  for (const [key, value] of Object.entries(settings)) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, value as string]
    );
  }
  res.json({ message: 'Settings updated' });
});

export default router;
