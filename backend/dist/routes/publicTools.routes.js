"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const publicTools_controller_1 = require("../controllers/publicTools.controller");
const router = (0, express_1.Router)();
router.get('/tracking', publicTools_controller_1.getPublicTrackingController);
router.post('/shipping/rates', publicTools_controller_1.getPublicShippingRatesController);
exports.default = router;
