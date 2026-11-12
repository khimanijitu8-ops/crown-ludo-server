"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const userRepository_1 = require("../../database/repositories/userRepository");
const profileRepository_1 = require("../../database/repositories/profileRepository");
const sessionRepository_1 = require("../../database/repositories/sessionRepository");
const auditRepository_1 = require("../../database/repositories/auditRepository");
const jwtService_1 = require("../../auth/jwtService");
const authMiddleware_1 = require("../../auth/authMiddleware");
exports.authRoutes = (0, express_1.Router)();
const RegisterSchema = zod_1.z.object({
    username: zod_1.z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
    email: zod_1.z.string().email().optional(),
    password: zod_1.z.string().min(6).max(128),
    displayName: zod_1.z.string().min(2).max(32).optional(),
});
const LoginSchema = zod_1.z.object({
    username: zod_1.z.string().min(3),
    password: zod_1.z.string().min(1),
});
const RefreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10),
});
exports.authRoutes.post('/register', async (req, res) => {
    const parse = RegisterSchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
        return;
    }
    const { username, email, password, displayName } = parse.data;
    // Check existing username
    const existingUser = await userRepository_1.userRepository.findByUsername(username);
    if (existingUser) {
        res.status(409).json({ error: 'USERNAME_TAKEN', message: 'Username is already in use.' });
        return;
    }
    if (email) {
        const existingEmail = await userRepository_1.userRepository.findByEmail(email);
        if (existingEmail) {
            res.status(409).json({ error: 'EMAIL_TAKEN', message: 'Email is already registered.' });
            return;
        }
    }
    const salt = await bcryptjs_1.default.genSalt(10);
    const passwordHash = await bcryptjs_1.default.hash(password, salt);
    const user = await userRepository_1.userRepository.create({
        username,
        email,
        password_hash: passwordHash,
        is_guest: false,
    });
    const profile = await profileRepository_1.profileRepository.upsert({
        user_id: user.id,
        display_name: displayName || username,
        avatar_id: 'avatar_1',
        avatar_emoji: '👑',
    });
    const tokens = jwtService_1.JwtService.generateTokens(user.id, user.username, false);
    // Store refresh session
    await sessionRepository_1.sessionRepository.createSession({
        user_id: user.id,
        refreshToken: tokens.refreshToken,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await auditRepository_1.auditRepository.log({
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
exports.authRoutes.post('/login', async (req, res) => {
    const parse = LoginSchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
        return;
    }
    const { username, password } = parse.data;
    const user = (await userRepository_1.userRepository.findByUsername(username)) || (await userRepository_1.userRepository.findByEmail(username));
    if (!user || !user.password_hash) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
        return;
    }
    if (user.status !== 'ACTIVE') {
        res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: `Account is ${user.status.toLowerCase()}.` });
        return;
    }
    const passwordMatch = await bcryptjs_1.default.compare(password, user.password_hash);
    if (!passwordMatch) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
        return;
    }
    const profile = await profileRepository_1.profileRepository.getByUserId(user.id);
    const tokens = jwtService_1.JwtService.generateTokens(user.id, user.username, user.is_guest);
    await sessionRepository_1.sessionRepository.createSession({
        user_id: user.id,
        refreshToken: tokens.refreshToken,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await auditRepository_1.auditRepository.log({
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
exports.authRoutes.post('/guest', async (req, res) => {
    const guestId = `guest_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const guestName = (req.body?.displayName || `Guest_${guestId.slice(-4)}`).trim().slice(0, 32);
    const user = await userRepository_1.userRepository.create({
        id: guestId,
        username: guestId,
        is_guest: true,
    });
    const profile = await profileRepository_1.profileRepository.upsert({
        user_id: user.id,
        display_name: guestName,
        avatar_id: 'avatar_1',
        avatar_emoji: '👑',
    });
    const tokens = jwtService_1.JwtService.generateTokens(user.id, user.username, true);
    await sessionRepository_1.sessionRepository.createSession({
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
exports.authRoutes.post('/refresh', async (req, res) => {
    const parse = RefreshSchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
        return;
    }
    const { refreshToken } = parse.data;
    const session = await sessionRepository_1.sessionRepository.findByRefreshToken(refreshToken);
    if (!session) {
        res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Session expired or invalid.' });
        return;
    }
    const user = await userRepository_1.userRepository.findById(session.user_id);
    if (!user || user.status !== 'ACTIVE') {
        res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'User account is not active.' });
        return;
    }
    // Rotate refresh token
    await sessionRepository_1.sessionRepository.revokeByRefreshToken(refreshToken);
    const newTokens = jwtService_1.JwtService.generateTokens(user.id, user.username, user.is_guest);
    await sessionRepository_1.sessionRepository.createSession({
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
exports.authRoutes.post('/logout', authMiddleware_1.expressAuthMiddleware, async (req, res) => {
    const refreshToken = req.body?.refreshToken;
    if (refreshToken) {
        await sessionRepository_1.sessionRepository.revokeByRefreshToken(refreshToken);
    }
    else if (req.user?.id) {
        await sessionRepository_1.sessionRepository.revokeAllForUser(req.user.id);
    }
    res.status(200).json({ message: 'Logged out successfully' });
});
