import { Router } from "express";
import {
  createAuthenticatedUpload,
  createPresignedUrl,
  createShopifyEmbeddedUpload,
  getPresignedDownloadUrl,
} from "../controllers/upload.controller";
import { requireAuth } from "../middlewares/requireAuth";
import multer from "multer";

const router = Router();

const shopifyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

const acceptSingleShopifyUpload = (req: any, res: any, next: any) => {
  shopifyUpload.single("file")(req, res, (error: any) => {
    if (!error) return next();

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

router.post("/presign", requireAuth, createPresignedUrl);
router.post(
  "/file",
  requireAuth,
  acceptSingleShopifyUpload,
  createAuthenticatedUpload
);
router.post(
  "/shopify-file",
  requireAuth,
  acceptSingleShopifyUpload,
  createShopifyEmbeddedUpload
);
router.post("/presign-download-url", requireAuth, getPresignedDownloadUrl);

export default router;
