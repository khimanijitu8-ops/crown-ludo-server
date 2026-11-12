"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playerRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const profileRepository_1 = require("../../database/repositories/profileRepository");
const statsRepository_1 = require("../../database/repositories/statsRepository");
const matchRepository_1 = require("../../database/repositories/matchRepository");
const authMiddleware_1 = require("../../auth/authMiddleware");
exports.playerRoutes = (0, express_1.Router)();
const UpdateProfileSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(2).max(32).optional(),
    avatarId: zod_1.z.string().max(32).optional(),
    avatarEmoji: zod_1.z.string().max(8).optional(),
});
exports.playerRoutes.get('/profile', authMiddleware_1.expressAuthMiddleware, async (req, res) => {
    const userId = req.user.id;
    let profile = await profileRepository_1.profileRepository.getByUserId(userId);
    if (!profile) {
        profile = await profileRepository_1.profileRepository.upsert({
            user_id: userId,
            display_name: req.user.username || 'Player',
        });
    }
    res.status(200).json({ profile });
});
exports.playerRoutes.put('/profile', authMiddleware_1.expressAuthMiddleware, async (req, res) => {
    const parse = UpdateProfileSchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
        return;
    }
    const userId = req.user.id;
    const updated = await profileRepository_1.profileRepository.upsert({
        user_id: userId,
        display_name: parse.data.displayName || req.user.username || 'Player',
        avatar_id: parse.data.avatarId,
        avatar_emoji: parse.data.avatarEmoji,
    });
    res.status(200).json({ message: 'Profile updated', profile: updated });
});
exports.playerRoutes.get('/statistics', authMiddleware_1.expressAuthMiddleware, async (req, res) => {
    const userId = req.user.id;
    const stats = await statsRepository_1.statsRepository.getByUserId(userId);
    res.status(200).json({ statistics: stats });
});
exports.playerRoutes.get('/matches', authMiddleware_1.expressAuthMiddleware, async (req, res) => {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit || '20', 10);
    const matches = await matchRepository_1.matchRepository.getPlayerMatches(userId, limit);
    res.status(200).json({ matches });
});
