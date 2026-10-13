"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamBulkOrderDocumentsDownload = exports.MAX_BULK_LABEL_DOWNLOAD_LIMIT = exports.MAX_BULK_DOCUMENT_DOWNLOAD_LIMIT = void 0;
const archiver = require("archiver");
const axios_1 = __importDefault(require("axios"));
const pdf_lib_1 = require("pdf-lib");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const orderListSelects_1 = require("./orderListSelects");
const orderLabels_1 = require("../../utils/orderLabels");
const upload_service_1 = require("./upload.service");
const generateCustomLabelService_1 = require("./generateCustomLabelService");
exports.MAX_BULK_DOCUMENT_DOWNLOAD_LIMIT = 100;
exports.MAX_BULK_LABEL_DOWNLOAD_LIMIT = 50;
const downloadDocumentBuffer = async (url, retryTransientDownloads) => {
    let lastError;
    const maxAttempts = retryTransientDownloads ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: 120000,
            });
            return response.data;
        }
        catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
    }
    throw lastError;
};
const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const normalizeDocumentReference = (value) => {
    const text = String(value || '').trim();
    return text || null;
};
const sanitizeFileNameSegment = (value) => value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);
const isProviderHostedVelocityLabel = (order, reference) => String(order.integration_type || '').trim().toLowerCase() === 'velocity' && isHttpUrl(reference);
const getFileExtension = (value) => {
    if (!value)
        return '.pdf';
    const path = isHttpUrl(value)
        ? (() => {
            try {
                return new URL(value).pathname;
            }
            catch {
                return value;
            }
        })()
        : value;
    const match = path.match(/\.[a-z0-9]+$/i);
    return match?.[0] || '.pdf';
};
const getDocumentReference = (order, type) => {
    if (type === 'label') {
        return normalizeDocumentReference((0, orderLabels_1.getOrderLabelReference)(order));
    }
    if (type === 'manifest') {
        return normalizeDocumentReference(order.manifest);
    }
    return normalizeDocumentReference(order.invoice_link);
};
const getDownloadFileName = (order, type, source) => {
    const baseName = sanitizeFileNameSegment(String(order.order_number || order.awb_number || `${order.type}-${order.id}`)) ||
        `order-${order.id}`;
    return `${baseName}-${type}${getFileExtension(source)}`;
};
const getOrderDocumentLabel = (order) => String(order.order_number || order.awb_number || order.id);
const fetchFullOrderForGeneration = async (order) => {
    if (order.type === 'b2c') {
        const [row] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id)).limit(1);
        return row || null;
    }
    const [row] = await client_1.db.select().from(b2bOrders_1.b2b_orders).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, order.id)).limit(1);
    return row || null;
};
const updateOrderLabelReference = async (order, labelKey) => {
    if (order.type === 'b2c') {
        await client_1.db.update(b2cOrders_1.b2c_orders).set({ label: labelKey }).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
        return;
    }
    await client_1.db.update(b2bOrders_1.b2b_orders).set({ label: labelKey }).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, order.id));
};
const resolveGeneratedLabelDownloadUrl = async (order) => {
    const fullOrder = await fetchFullOrderForGeneration(order);
    if (!fullOrder?.user_id) {
        throw new Error('Order not found for label generation');
    }
    const labelKey = await (0, generateCustomLabelService_1.generateLabelForOrder)(fullOrder, String(fullOrder.user_id), client_1.db);
    const normalizedLabelKey = String(labelKey || '').trim();
    if (!normalizedLabelKey) {
        throw new Error('Label generation returned an empty label reference');
    }
    await updateOrderLabelReference(order, normalizedLabelKey);
    const resolved = await (0, upload_service_1.presignDownload)(normalizedLabelKey, { checkExists: true });
    const downloadUrl = Array.isArray(resolved) ? resolved[0] : resolved;
    if (!downloadUrl) {
        throw new Error('Generated label could not be downloaded');
    }
    return {
        fileName: getDownloadFileName(order, 'label', normalizedLabelKey),
        orderLabel: getOrderDocumentLabel(order),
        downloadUrl: String(downloadUrl),
    };
};
const getDownloadName = (documentType) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (documentType === 'label') {
        return `shipray-${documentType}s-${stamp}.pdf`;
    }
    return `shipray-${documentType}s-${stamp}.zip`;
};
const fetchOrdersForUser = async (userId, orderIds) => {
    const [b2cRows, b2bRows] = await Promise.all([
        client_1.db
            .select(orderListSelects_1.b2cOrderListSelect)
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId), (0, drizzle_orm_1.inArray)(b2cOrders_1.b2c_orders.id, orderIds))),
        client_1.db
            .select(orderListSelects_1.b2bOrderListSelect)
            .from(b2bOrders_1.b2b_orders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId), (0, drizzle_orm_1.inArray)(b2bOrders_1.b2b_orders.id, orderIds))),
    ]);
    const orderMap = new Map();
    for (const row of b2cRows) {
        orderMap.set(String(row.id), {
            ...row,
            id: String(row.id),
            type: 'b2c',
        });
    }
    for (const row of b2bRows) {
        orderMap.set(String(row.id), {
            ...row,
            id: String(row.id),
            type: 'b2b',
        });
    }
    return orderIds
        .map((orderId) => orderMap.get(orderId))
        .filter((row) => Boolean(row));
};
const prepareArchiveEntries = async ({ documentType, orders, }) => {
    const preparedEntries = [];
    const missingOrders = [];
    let deduplicatedCount = 0;
    const seenReferences = new Set();
    for (const order of orders) {
        const reference = getDocumentReference(order, documentType);
        if (documentType === 'label' && isProviderHostedVelocityLabel(order, reference)) {
            try {
                preparedEntries.push(await resolveGeneratedLabelDownloadUrl(order));
            }
            catch {
                missingOrders.push(getOrderDocumentLabel(order));
            }
            continue;
        }
        if (!reference) {
            if (documentType === 'label') {
                try {
                    preparedEntries.push(await resolveGeneratedLabelDownloadUrl(order));
                    continue;
                }
                catch {
                    missingOrders.push(getOrderDocumentLabel(order));
                    continue;
                }
            }
            missingOrders.push(getOrderDocumentLabel(order));
            continue;
        }
        if (seenReferences.has(reference)) {
            deduplicatedCount += 1;
            continue;
        }
        seenReferences.add(reference);
        try {
            const resolved = await (0, upload_service_1.presignDownload)(reference, { checkExists: true });
            const downloadUrl = Array.isArray(resolved) ? resolved[0] : resolved;
            if (!downloadUrl) {
                if (documentType === 'label') {
                    preparedEntries.push(await resolveGeneratedLabelDownloadUrl(order));
                    continue;
                }
                missingOrders.push(getOrderDocumentLabel(order));
                continue;
            }
            preparedEntries.push({
                fileName: getDownloadFileName(order, documentType, reference),
                orderLabel: getOrderDocumentLabel(order),
                downloadUrl: String(downloadUrl),
            });
        }
        catch {
            if (documentType === 'label') {
                try {
                    preparedEntries.push(await resolveGeneratedLabelDownloadUrl(order));
                    continue;
                }
                catch {
                    missingOrders.push(getOrderDocumentLabel(order));
                    continue;
                }
            }
            missingOrders.push(getOrderDocumentLabel(order));
        }
    }
    return { preparedEntries, missingOrders, deduplicatedCount };
};
const applyDownloadHeaders = ({ response, downloadName, requestedCount, documentCount, missingCount, deduplicatedCount, contentType, }) => {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    response.setHeader('X-Shipray-Archive-Name', downloadName);
    response.setHeader('X-Shipray-Requested-Count', String(requestedCount));
    response.setHeader('X-Shipray-Document-Count', String(documentCount));
    response.setHeader('X-Shipray-Missing-Count', String(missingCount));
    response.setHeader('X-Shipray-Deduplicated-Count', String(deduplicatedCount));
};
const streamMergedLabelPdf = async ({ response, preparedEntries, requestedCount, missingOrders, deduplicatedCount, retryTransientDownloads, }) => {
    const mergedPdf = await pdf_lib_1.PDFDocument.create();
    let mergedDocumentCount = 0;
    for (const entry of preparedEntries) {
        try {
            const fileBuffer = await downloadDocumentBuffer(entry.downloadUrl, retryTransientDownloads);
            const sourcePdf = await pdf_lib_1.PDFDocument.load(fileBuffer);
            const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
            for (const page of copiedPages) {
                mergedPdf.addPage(page);
            }
            mergedDocumentCount += 1;
        }
        catch {
            missingOrders.push(entry.orderLabel);
        }
    }
    if (!mergedDocumentCount) {
        throw createHttpError('No label PDFs are available yet for the selected orders.', 404);
    }
    const downloadName = getDownloadName('label');
    applyDownloadHeaders({
        response,
        downloadName,
        requestedCount,
        documentCount: mergedDocumentCount,
        missingCount: missingOrders.length,
        deduplicatedCount,
        contentType: 'application/pdf',
    });
    const mergedPdfBytes = await mergedPdf.save();
    response.end(Buffer.from(mergedPdfBytes));
};
const streamBulkOrderDocumentsZip = async ({ response, documentType, preparedEntries, requestedCount, missingOrders, deduplicatedCount, }) => {
    const downloadName = getDownloadName(documentType);
    applyDownloadHeaders({
        response,
        downloadName,
        requestedCount,
        documentCount: preparedEntries.length,
        missingCount: missingOrders.length,
        deduplicatedCount,
        contentType: 'application/zip',
    });
    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
    await new Promise(async (resolve, reject) => {
        let settled = false;
        const finish = (callback) => {
            if (settled)
                return;
            settled = true;
            callback();
        };
        archive.on('warning', (error) => {
            if (error?.code !== 'ENOENT') {
                finish(() => reject(error));
            }
        });
        archive.on('error', (error) => {
            finish(() => reject(error));
        });
        response.on('close', () => {
            finish(resolve);
        });
        response.on('error', (error) => {
            finish(() => reject(error));
        });
        archive.pipe(response);
        try {
            for (const entry of preparedEntries) {
                const fileResponse = await axios_1.default.get(entry.downloadUrl, {
                    responseType: 'stream',
                    timeout: 120000,
                });
                archive.append(fileResponse.data, { name: entry.fileName });
            }
            archive.append(JSON.stringify({
                requestedCount,
                includedCount: preparedEntries.length,
                missingCount: missingOrders.length,
                deduplicatedCount,
                missingOrders,
            }, null, 2), { name: '_download-summary.json' });
            await archive.finalize();
        }
        catch (error) {
            finish(() => reject(error));
        }
    });
};
const streamBulkOrderDocumentsDownload = async ({ response, userId, orderIds, documentType, retryTransientDownloads = false, }) => {
    const normalizedOrderIds = Array.from(new Set(orderIds.map((orderId) => String(orderId || '').trim()).filter(Boolean)));
    if (!normalizedOrderIds.length) {
        throw createHttpError('Select at least one order to download documents.', 400);
    }
    const downloadLimit = documentType === 'label' ? exports.MAX_BULK_LABEL_DOWNLOAD_LIMIT : exports.MAX_BULK_DOCUMENT_DOWNLOAD_LIMIT;
    if (normalizedOrderIds.length > downloadLimit) {
        throw createHttpError(documentType === 'label'
            ? `You can download up to ${exports.MAX_BULK_LABEL_DOWNLOAD_LIMIT} labels in one PDF.`
            : `You can download up to ${exports.MAX_BULK_DOCUMENT_DOWNLOAD_LIMIT} orders in one ZIP.`, 400);
    }
    const orders = await fetchOrdersForUser(userId, normalizedOrderIds);
    if (!orders.length) {
        throw createHttpError('No matching orders were found for this account.', 404);
    }
    const { preparedEntries, missingOrders, deduplicatedCount } = await prepareArchiveEntries({
        documentType,
        orders,
    });
    if (!preparedEntries.length) {
        throw createHttpError(documentType === 'label'
            ? 'No label PDFs are available yet for the selected orders.'
            : `No ${documentType} files are available yet for the selected orders.`, 404);
    }
    if (documentType === 'label') {
        await streamMergedLabelPdf({
            response,
            preparedEntries,
            requestedCount: normalizedOrderIds.length,
            missingOrders,
            deduplicatedCount,
            retryTransientDownloads,
        });
        return;
    }
    await streamBulkOrderDocumentsZip({
        response,
        documentType,
        preparedEntries,
        requestedCount: normalizedOrderIds.length,
        missingOrders,
        deduplicatedCount,
    });
};
exports.streamBulkOrderDocumentsDownload = streamBulkOrderDocumentsDownload;
