import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../database/pool';
import { authenticate, authorize, validate, AppError } from '../middleware';
import { getPaginationParams, buildPaginatedResponse } from '../utils/pagination';

const router = Router();

// All user management routes require admin
router.use(authenticate, authorize('admin'));

// ── Schemas ──
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  role: z.enum(['admin', 'worker']),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1).optional(),
  role: z.enum(['admin', 'worker']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

// ── GET /api/users ──
router.get('/', async (req: Request, res: Response) => {
  const { page, limit, offset, search } = getPaginationParams(req);

  let whereClause = '';
  const params: any[] = [];

  if (search) {
    whereClause = `WHERE full_name ILIKE $1 OR email ILIKE $1`;
    params.push(`%${search}%`);
  }

  const countResult = await query(
    `SELECT COUNT(*) FROM users ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const { rows } = await query(
    `SELECT id, email, full_name, role, is_active, created_at
     FROM users ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json(buildPaginatedResponse(rows, total, { page, limit, offset, search }));
});

// ── GET /api/users/:id ──
router.get('/:id', async (req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT id, email, full_name, role, is_active, created_at FROM users WHERE id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) throw new AppError('User not found', 404);
  res.json(rows[0]);
});

// ── POST /api/users ──
router.post('/', validate(createUserSchema), async (req: Request, res: Response) => {
  const { email, password, fullName, role } = req.body;

  // Check duplicate
  const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows.length > 0) throw new AppError('Email already in use', 409);

  const passwordHash = await bcrypt.hash(password, 12);

  const { rows } = await query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, full_name, role, is_active, created_at`,
    [email, passwordHash, fullName, role]
  );

  res.status(201).json(rows[0]);
});

// ── PUT /api/users/:id ──
router.put('/:id', validate(updateUserSchema), async (req: Request, res: Response) => {
  const { email, fullName, role, isActive, password } = req.body;
  const userId = req.params.id;

  // Check exists
  const existing = await query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (existing.rows.length === 0) throw new AppError('User not found', 404);

  // Check email uniqueness if changed
  if (email) {
    const dup = await query(`SELECT id FROM users WHERE email = $1 AND id != $2`, [email, userId]);
    if (dup.rows.length > 0) throw new AppError('Email already in use', 409);
  }

  const updates: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (email !== undefined) { updates.push(`email = $${paramIdx++}`); params.push(email); }
  if (fullName !== undefined) { updates.push(`full_name = $${paramIdx++}`); params.push(fullName); }
  if (role !== undefined) { updates.push(`role = $${paramIdx++}`); params.push(role); }
  if (isActive !== undefined) { updates.push(`is_active = $${paramIdx++}`); params.push(isActive); }
  if (password !== undefined) {
    const hash = await bcrypt.hash(password, 12);
    updates.push(`password_hash = $${paramIdx++}`);
    params.push(hash);
  }

  if (updates.length === 0) throw new AppError('No fields to update', 400);

  params.push(userId);
  const { rows } = await query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}
     RETURNING id, email, full_name, role, is_active, created_at`,
    params
  );

  res.json(rows[0]);
});

// ── DELETE /api/users/:id (soft — deactivate) ──
router.delete('/:id', async (req: Request, res: Response) => {
  // Prevent self-deletion
  if (req.params.id === req.user!.userId) {
    throw new AppError('Cannot deactivate your own account', 400);
  }

  const { rows } = await query(
    `UPDATE users SET is_active = false WHERE id = $1 RETURNING id`,
    [req.params.id]
  );

  if (rows.length === 0) throw new AppError('User not found', 404);
  res.json({ message: 'User deactivated' });
});

export default router;
