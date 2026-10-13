"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const franchise_controller_1 = require("../controllers/franchise.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const requireFranchiseMembership_1 = require("../middlewares/requireFranchiseMembership");
const router = (0, express_1.Router)();
const publicSubmissionWindows = new Map();
const limitPublicApplications = (req, res, next) => {
    const key = req.ip || 'unknown';
    const currentTime = Date.now();
    const current = publicSubmissionWindows.get(key);
    if (!current || current.resetsAt <= currentTime) {
        publicSubmissionWindows.set(key, { count: 1, resetsAt: currentTime + 15 * 60 * 1000 });
        return next();
    }
    if (current.count >= 5) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please wait a few minutes and try again.',
        });
    }
    current.count += 1;
    return next();
};
router.post('/auth/login', franchise_controller_1.franchiseLogin);
router.get('/opportunities', franchise_controller_1.getPublicFranchiseOpportunities);
router.post('/applications', limitPublicApplications, franchise_controller_1.submitPublicFranchiseApplication);
router.use(requireAuth_1.requireAuth, requireFranchiseMembership_1.requireFranchiseMembership);
router.get('/me', franchise_controller_1.getFranchiseMe);
router.get('/dashboard', franchise_controller_1.getFranchiseDashboard);
router.get('/orders', franchise_controller_1.getFranchiseOrders);
router.get('/tracking', franchise_controller_1.getFranchiseTracking);
router.get('/ndr', franchise_controller_1.getFranchiseNdr);
router.get('/rto', franchise_controller_1.getFranchiseRto);
router.get('/territories', franchise_controller_1.getFranchiseTerritories);
router.get('/network', franchise_controller_1.getFranchiseTerritories);
router.get('/earnings', franchise_controller_1.getFranchiseEarnings);
router.get('/settlements', franchise_controller_1.getFranchiseSettlements);
router.get('/payouts', franchise_controller_1.getFranchiseSettlements);
router.get('/reports', franchise_controller_1.getFranchiseReports);
router.get('/documents', franchise_controller_1.getFranchiseDocuments);
router.get('/team', franchise_controller_1.getFranchiseTeam);
router.get('/disputes', franchise_controller_1.getFranchiseDisputes);
router.post('/disputes', franchise_controller_1.createFranchiseDispute);
exports.default = router;
