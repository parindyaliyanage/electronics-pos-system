import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../database/pool';
import { authenticate, authorize, validate, AppError } from '../middleware';

const router = Router();
router.use(authenticate);

// GET /api/interest-rates
router.get('/', async (_req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT * FROM interest_rates WHERE is_active = true ORDER BY duration_months ASC`
  );
  res.json(rows);
});

// GET /api/interest-rates/all (admin - includes inactive)
router.get('/all', authorize('admin'), async (_req: Request, res: Response) => {
  const { rows } = await query(`SELECT * FROM interest_rates ORDER BY duration_months ASC, created_at DESC`);
  res.json(rows);
});

// POST /api/interest-rates (admin - create or update rate for a duration)
const rateSchema = z.object({
  durationMonths: z.number().int().min(1),
  rate: z.number().min(0).max(100),
});

router.post('/', authorize('admin'), validate(rateSchema), async (req: Request, res: Response) => {
  const { durationMonths, rate } = req.body;

  // Deactivate existing rate for this duration
  await query(
    `UPDATE interest_rates SET is_active = false WHERE duration_months = $1 AND is_active = true`,
    [durationMonths]
  );

  // Insert new active rate
  const { rows } = await query(
    `INSERT INTO interest_rates (duration_months, rate, is_active) VALUES ($1, $2, true) RETURNING *`,
    [durationMonths, rate]
  );

  res.status(201).json(rows[0]);
});

// DELETE /api/interest-rates/:id (admin - deactivate)
router.delete('/:id', authorize('admin'), async (req: Request, res: Response) => {
  const { rows } = await query(
    `UPDATE interest_rates SET is_active = false WHERE id = $1 AND is_active = true RETURNING *`,
    [req.params.id]
  );
  if (rows.length === 0) throw new AppError('Rate not found or already inactive', 404);
  res.json({ message: 'Rate deactivated', rate: rows[0] });
});

export default router;
