import { Request, Response } from "express";
import {
  presignDownload,
  presignUpload,
  uploadBufferToR2,
} from "../models/services/upload.service";
import fileType from "file-type";
import path from "path";

const APP_UPLOAD_FOLDERS = new Set([
  "userPp",
  "kyc",
  "logos",
  "signatures",
  "pickupAddresses",
  "invoices",
  "weight-disputes",
  "blogs",
]);

const APP_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpg",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9-]{16,80}$/;

const MIME_ALIASES: Record<string, string> = {
  "application/octet-stream": "",
  "application/vnd.ms-word": "application/msword",
  "application/x-pdf": "application/pdf",
  "image/jpg": "image/jpeg",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mov: "video/quicktime",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  webm: "video/webm",
  webp: "image/webp",
};

const normalizeDeclaredMimeType = (value: string) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return MIME_ALIASES[normalized] ?? normalized;
};

const normalizeUploadMimeType = async (file: Express.Multer.File) => {
  const detected = await fileType.fromBuffer(file.buffer);
  const declared = normalizeDeclaredMimeType(file.mimetype || "");
  const extension = path.extname(String(file.originalname || "")).slice(1).toLowerCase();
  const extensionMime = MIME_BY_EXTENSION[extension] || "";
  const contentType =
    (detected?.mime && APP_UPLOAD_MIME_TYPES.has(detected.mime) ? detected.mime : "") ||
    (declared && APP_UPLOAD_MIME_TYPES.has(declared) ? declared : "") ||
    (extensionMime && APP_UPLOAD_MIME_TYPES.has(extensionMime) ? extensionMime : "");

  if (!APP_UPLOAD_MIME_TYPES.has(contentType)) {
    console.warn("Upload rejected due to unsupported file type:", {
      originalName: file.originalname,
      declaredMime: file.mimetype,
      normalizedDeclaredMime: declared || null,
      detectedMime: detected?.mime || null,
      extension: extension || null,
      extensionMime: extensionMime || null,
      size: file.size,
    });
    throw Object.assign(
      new Error(
        "This file type is not supported. Please upload a PDF, image, CSV, Word, or supported video file."
      ),
      { statusCode: 415 }
    );
  }

  return contentType;
};

export const createPresignedUrl = async (
  req: any,
  res: Response
): Promise<any> => {
  const { filename, contentType, folder } = req.body;
  const { sub } = req?.user;

  if (!filename || !contentType) {
    return res.status(400).json({ message: "filename & contentType required" });
  }

  if (!APP_UPLOAD_FOLDERS.has(String(folder || ""))) {
    return res.status(400).json({ message: "Invalid upload folder." });
  }
  if (
    folder === "blogs" &&
    !["image/jpeg", "image/png", "image/webp"].includes(contentType)
  ) {
    return res.status(415).json({ message: "Blog covers must be JPEG, PNG, or WebP images." });
  }

  try {
    const data = await presignUpload({
      filename,
      contentType,
      userId: sub,
      folderKey: folder,
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error("Presign error:", err);
    return res.status(500).json({ message: "Failed to presign URL" });
  }
};

export const createShopifyEmbeddedUpload = async (
  req: any,
  res: Response
): Promise<any> => {
  if (!req.shopifySession?.shop) {
    return res.status(403).json({
      message: "This upload path is available only inside the connected Shopify app.",
    });
  }

  const file = req.file as Express.Multer.File | undefined;
  const folder = String(req.body?.folder || "userPp").trim();
  const uploadId = String(req.body?.uploadId || "").trim();
  const userId = String(req.user?.sub || "").trim();

  if (!file || !userId) {
    return res.status(400).json({ message: "A file is required." });
  }

  if (!file.buffer?.length) {
    return res.status(400).json({ message: "The selected file is empty or unreadable." });
  }

  if (!APP_UPLOAD_FOLDERS.has(folder)) {
    return res.status(400).json({ message: "Invalid upload folder." });
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(uploadId)) {
    return res.status(400).json({ message: "A valid upload id is required." });
  }

  try {
    const contentType = await normalizeUploadMimeType(file);
    const data = await uploadBufferToR2({
      buffer: file.buffer,
      filename: file.originalname,
      contentType,
      userId,
      uploadId,
      folderKey: folder,
    });

    return res.status(200).set("Cache-Control", "no-store").json(data);
  } catch (error: any) {
    const timedOut = error?.name === "AbortError";
    const statusCode = timedOut
      ? 504
      : typeof error?.statusCode === "number"
        ? error.statusCode
        : 503;

    console.error("Shopify embedded upload failed:", {
      requestId: req.requestId || null,
      shop: req.shopifySession.shop,
      userId,
      folder,
      uploadId,
      statusCode,
      message: error?.message || String(error),
    });

    return res.status(statusCode).json({
      message: timedOut
        ? "The document upload timed out. It is safe to retry."
        : statusCode < 500
          ? error?.message || "The selected document is not valid."
          : "The document could not be uploaded. It is safe to retry.",
      retryable: statusCode >= 500,
      requestId: req.requestId || null,
    });
  }
};

export const createAuthenticatedUpload = async (
  req: any,
  res: Response
): Promise<any> => {
  const file = req.file as Express.Multer.File | undefined;
  const folder = String(req.body?.folder || "userPp").trim();
  const uploadId = String(req.body?.uploadId || "").trim();
  const userId = String(req.user?.sub || "").trim();

  if (!file || !userId) {
    return res.status(400).json({ message: "A file is required." });
  }

  if (!file.buffer?.length) {
    return res.status(400).json({ message: "The selected file is empty or unreadable." });
  }

  if (!APP_UPLOAD_FOLDERS.has(folder)) {
    return res.status(400).json({ message: "Invalid upload folder." });
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(uploadId)) {
    return res.status(400).json({ message: "A valid upload id is required." });
  }

  try {
    const contentType = await normalizeUploadMimeType(file);
    const data = await uploadBufferToR2({
      buffer: file.buffer,
      filename: file.originalname,
      contentType,
      userId,
      uploadId,
      folderKey: folder,
    });

    return res.status(200).set("Cache-Control", "no-store").json(data);
  } catch (error: any) {
    const timedOut = error?.name === "AbortError";
    const statusCode = timedOut
      ? 504
      : typeof error?.statusCode === "number"
        ? error.statusCode
        : 503;

    console.error("Authenticated upload failed:", {
      requestId: req.requestId || null,
      userId,
      folder,
      uploadId,
      statusCode,
      message: error?.message || String(error),
    });

    return res.status(statusCode).json({
      message: timedOut
        ? "The document upload timed out. It is safe to retry."
        : statusCode < 500
          ? error?.message || "The selected document is not valid."
          : "The document could not be uploaded. It is safe to retry.",
      retryable: statusCode >= 500,
      requestId: req.requestId || null,
    });
  }
};

export const getPresignedDownloadUrl = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { keys } = req.body;

    // Validate payload
    if (!keys || (typeof keys !== "string" && !Array.isArray(keys))) {
      return res
        .status(400)
        .json({ message: "'keys' must be a string or string[]" });
    }

    // Generate signed URL(s)
    const result = await presignDownload(keys, { checkExists: true });

    if (Array.isArray(keys)) {
      const urls = Array.isArray(result) ? result : [];
      const missingFiles = keys.filter((_, index) => !urls[index]);
      const foundCount = urls.filter(Boolean).length;
      const missingCount = missingFiles.length;

      if (missingFiles.length > 0) {
        console.warn(`⚠️ Some files not found in storage:`, missingFiles);
      }

      const message =
        missingCount === 0
          ? 'Download links are ready.'
          : foundCount > 0
            ? `${foundCount} file(s) are ready. ${missingCount} file(s) could not be found or have not been generated yet.`
            : 'None of the requested files are available yet. They may still be generating or may need to be regenerated.';

      return res.status(200).json({
        urls,
        foundCount,
        missingCount,
        missingFiles,
        message,
      });
    } else {
      if (!result || result === null) {
        return res.status(404).json({ 
          message: "This file is not available yet. It may still be generating or may need to be regenerated.",
          key: keys 
        });
      }
      return res.status(200).json({ url: result as string });
    }
  } catch (error) {
    console.error("Presign download failed:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate download URL(s)" });
  }
};
