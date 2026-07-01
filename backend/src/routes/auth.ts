import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../database/pool';
import { config } from '../config';
import { authenticate, validate, AppError } from '../middleware';

const router = Router();

// ── Schemas ──
const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ── Helpers ──
function generateTokens(payload: { userId: string; email: string; role: string }) {
  const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as any,
  });
  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as any,
  });
  return { accessToken, refreshToken };
}

// ── POST /api/auth/login ──
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const { rows } = await query(
    `SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = $1`,
    [email]
  );

  if (rows.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  const user = rows[0];

  if (!user.is_active) {
    throw new AppError('Account is suspended. Contact administrator.', 403);
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new AppError('Invalid email or password', 401);
  }

  const tokenPayload = { userId: user.id, email: user.email, role: user.role };
  const { accessToken, refreshToken } = generateTokens(tokenPayload);

  // Store refresh token
  await query(`UPDATE users SET refresh_token = $1 WHERE id = $2`, [refreshToken, user.id]);

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
  });
});

// ── POST /api/auth/refresh ──
router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  try {
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;

    // Verify refresh token in DB
    const { rows } = await query(
      `SELECT id, email, role, refresh_token FROM users WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (rows.length === 0 || rows[0].refresh_token !== refreshToken) {
      throw new AppError('Invalid refresh token', 401);
    }

    const user = rows[0];
    const tokenPayload = { userId: user.id, email: user.email, role: user.role };
    const tokens = generateTokens(tokenPayload);

    // Update stored refresh token
    await query(`UPDATE users SET refresh_token = $1 WHERE id = $2`, [tokens.refreshToken, user.id]);

    res.json(tokens);
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    throw new AppError('Invalid refresh token', 401);
  }
});

// ── POST /api/auth/logout ──
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  await query(`UPDATE users SET refresh_token = NULL WHERE id = $1`, [req.user!.userId]);
  res.json({ message: 'Logged out successfully' });
});

// ── GET /api/auth/me ──
router.get('/me', authenticate, async (req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT id, email, full_name, role, is_active, created_at FROM users WHERE id = $1`,
    [req.user!.userId]
  );

  if (rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = rows[0];
  res.json({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    isActive: user.is_active,
    createdAt: user.created_at,
  });
});

export default router;
