"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leaderboardRoutes = void 0;
const express_1 = require("express");
const statsRepository_1 = require("../../database/repositories/statsRepository");
exports.leaderboardRoutes = (0, express_1.Router)();
exports.leaderboardRoutes.get('/', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const leaderboard = await statsRepository_1.statsRepository.getLeaderboard(limit);
    res.status(200).json({ leaderboard });
});
