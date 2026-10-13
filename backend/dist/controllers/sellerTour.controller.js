"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSellerTourController = exports.getSellerTourController = void 0;
const sellerTourProgress_service_1 = require("../models/services/sellerTourProgress.service");
const getSellerTourController = async (req, res) => {
    try {
        return res.json({ success: true, data: await (0, sellerTourProgress_service_1.getSellerTourProgress)(req.user.sub) });
    }
    catch (error) {
        console.error('Could not load seller tour progress:', error);
        return res.status(500).json({ success: false, message: 'Could not load guide progress' });
    }
};
exports.getSellerTourController = getSellerTourController;
const updateSellerTourController = async (req, res) => {
    const { action, page } = req.body || {};
    if (!['start', 'dismiss', 'complete-page', 'finish', 'reset'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Invalid guide action' });
    }
    if (action === 'complete-page' && (typeof page !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(page))) {
        return res.status(400).json({ success: false, message: 'Invalid guide page' });
    }
    try {
        return res.json({ success: true, data: await (0, sellerTourProgress_service_1.updateSellerTourProgress)(req.user.sub, action, page) });
    }
    catch (error) {
        console.error('Could not save seller tour progress:', error);
        return res.status(500).json({ success: false, message: 'Could not save guide progress' });
    }
};
exports.updateSellerTourController = updateSellerTourController;
