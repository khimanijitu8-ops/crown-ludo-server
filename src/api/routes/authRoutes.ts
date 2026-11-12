import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { userRepository } from '../../database/repositories/userRepository';
import { profileRepository } from '../../database/repositories/profileRepository';
import { sessionRepository } from '../../database/repositories/sessionRepository';
import { auditRepository } from '../../database/repositories/auditRepository';
import { JwtService } from '../../auth/jwtService';
import { expressAuthMiddleware, AuthenticatedRequest } from '../../auth/authMiddleware';

export const authRoutes = Router();

const RegisterSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email().optional(),
  password: z.string().min(6).max(128),
  displayName: z.string().min(2).max(32).optional(),
});

const LoginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
});

authRoutes.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parse = RegisterSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    return;
  }

  const { username, email, password, displayName } = parse.data;

  // Check existing username
  const existingUser = await userRepository.findByUsername(username);
  if (existingUser) {
    res.status(409).json({ error: 'USERNAME_TAKEN', message: 'Username is already in use.' });
    return;
  }

  if (email) {
    const existingEmail = await userRepository.findByEmail(email);
    if (existingEmail) {
      res.status(409).json({ error: 'EMAIL_TAKEN', message: 'Email is already registered.' });
      return;
    }
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await userRepository.create({
    username,
    email,
    password_hash: passwordHash,
    is_guest: false,
  });

  const profile = await profileRepository.upsert({
    user_id: user.id,
    display_name: displayName || username,
    avatar_id: 'avatar_1',
    avatar_emoji: '👑',
  });

  const tokens = JwtService.generateTokens(user.id, user.username, false);

  // Store refresh session
  await sessionRepository.createSession({
    user_id: user.id,
    refreshToken: tokens.refreshToken,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  await auditRepository.log({
    user_id: user.id,
    action: 'USER_REGISTERED',
    ip_address: req.ip,
  });

  res.status(201).json({
    message: 'User registered successfully',
    user: { id: user.id, username: user.username, email: user.email },
    profile,
    tokens,
  });
});

authRoutes.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parse = LoginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    return;
  }

  const { username, password } = parse.data;
  const user = (await userRepository.findByUsername(username)) || (await userRepository.findByEmail(username));

  if (!user || !user.password_hash) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    return;
  }

  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: `Account is ${user.status.toLowerCase()}.` });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    return;
  }

  const profile = await profileRepository.getByUserId(user.id);
  const tokens = JwtService.generateTokens(user.id, user.username, user.is_guest);

  await sessionRepository.createSession({
    user_id: user.id,
    refreshToken: tokens.refreshToken,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  await auditRepository.log({
    user_id: user.id,
    action: 'USER_LOGIN',
    ip_address: req.ip,
  });

  res.status(200).json({
    message: 'Login successful',
    user: { id: user.id, username: user.username, email: user.email },
    profile,
    tokens,
  });
});

authRoutes.post('/guest', async (req: Request, res: Response): Promise<void> => {
  const guestId = `guest_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
  const guestName = (req.body?.displayName || `Guest_${guestId.slice(-4)}`).trim().slice(0, 32);

  const user = await userRepository.create({
    id: guestId,
    username: guestId,
    is_guest: true,
  });

  const profile = await profileRepository.upsert({
    user_id: user.id,
    display_name: guestName,
    avatar_id: 'avatar_1',
    avatar_emoji: '👑',
  });

  const tokens = JwtService.generateTokens(user.id, user.username, true);

  await sessionRepository.createSession({
    user_id: user.id,
    refreshToken: tokens.refreshToken,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  res.status(200).json({
    message: 'Guest session created',
    user: { id: user.id, username: user.username, is_guest: true },
    profile,
    tokens,
  });
});

authRoutes.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const parse = RefreshSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    return;
  }

  const { refreshToken } = parse.data;
  const session = await sessionRepository.findByRefreshToken(refreshToken);

  if (!session) {
    res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Session expired or invalid.' });
    return;
  }

  const user = await userRepository.findById(session.user_id);
  if (!user || user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'User account is not active.' });
    return;
  }

  // Rotate refresh token
  await sessionRepository.revokeByRefreshToken(refreshToken);
  const newTokens = JwtService.generateTokens(user.id, user.username, user.is_guest);

  await sessionRepository.createSession({
    user_id: user.id,
    refreshToken: newTokens.refreshToken,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  res.status(200).json({
    message: 'Tokens refreshed',
    tokens: newTokens,
  });
});

authRoutes.post('/logout', expressAuthMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const refreshToken = req.body?.refreshToken;
  if (refreshToken) {
    await sessionRepository.revokeByRefreshToken(refreshToken);
  } else if (req.user?.id) {
    await sessionRepository.revokeAllForUser(req.user.id);
  }

  res.status(200).json({ message: 'Logged out successfully' });
});
