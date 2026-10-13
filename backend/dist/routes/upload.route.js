"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const upload_controller_1 = require("../controllers/upload.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const shopifyUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});
const acceptSingleShopifyUpload = (req, res, next) => {
    shopifyUpload.single("file")(req, res, (error) => {
        if (!error)
            return next();
        const tooLarge = error?.code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
            message: tooLarge
                ? "The selected file exceeds the 50 MB upload limit."
                : "The selected file could not be read.",
            retryable: false,
            requestId: req.requestId || null,
        });
    });
};
router.post("/presign", requireAuth_1.requireAuth, upload_controller_1.createPresignedUrl);
router.post("/file", requireAuth_1.requireAuth, acceptSingleShopifyUpload, upload_controller_1.createAuthenticatedUpload);
router.post("/shopify-file", requireAuth_1.requireAuth, acceptSingleShopifyUpload, upload_controller_1.createShopifyEmbeddedUpload);
router.post("/presign-download-url", requireAuth_1.requireAuth, upload_controller_1.getPresignedDownloadUrl);
exports.default = router;
