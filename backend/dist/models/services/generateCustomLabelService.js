"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LABEL_SETTINGS = void 0;
exports.buildLabelPdfDocument = buildLabelPdfDocument;
exports.buildLabelPdfBuffer = buildLabelPdfBuffer;
exports.generateLabelForOrder = generateLabelForOrder;
const axios_1 = __importDefault(require("axios"));
const bwip_js_1 = __importDefault(require("bwip-js"));
const drizzle_orm_1 = require("drizzle-orm");
const file_type_1 = __importDefault(require("file-type"));
const pdfmake_1 = __importDefault(require("pdfmake"));
const sharp_1 = __importDefault(require("sharp"));
const codAmount_1 = require("../../utils/codAmount");
const labelStorage_1 = require("../../utils/labelStorage");
const client_1 = require("../client");
const labelPreferences_1 = require("../schema/labelPreferences");
const userProfile_1 = require("../schema/userProfile");
const invoicePreferences_service_1 = require("./invoicePreferences.service");
const pickupDetails_service_1 = require("./pickupDetails.service");
const upload_service_1 = require("./upload.service");
const LABEL_ASSET_TIMEOUT_MS = 10000;
const LABEL_GREEN = '#25c11c';
const LABEL_BLUE = '#5d86ff';
const LABEL_ORANGE = '#ff8a1d';
const LABEL_BLACK = '#111111';
const LABEL_MUTED = '#5f5f5f';
const THERMAL_LABEL_SIZE = { width: 288, height: 432 };
const A4_LABEL_SIZE = 'A4';
const CONTACT_BLOCK_MAX_LINES = 6;
const fonts = {
    Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
    },
};
exports.DEFAULT_LABEL_SETTINGS = {
    printer_type: 'thermal',
    char_limit: 30,
    max_items: 4,
    order_info: {
        customerPhone: true,
        alternatePhone: false,
        billingGstin: false,
        ewayBillNumber: false,
        middleBarcode: false,
        orderNumber: true,
        skuBarcode: true,
    },
    shipper_info: {
        brandLogo: true,
        shipperName: true,
        shipperAddress: true,
        shipperPhone: true,
        gstin: true,
        returnName: true,
        returnAddress: true,
        returnPhone: true,
    },
    product_info: {
        productCost: true,
    },
    powered_by: 'Shipray',
};
function normalizeText(value) {
    if (value === undefined || value === null)
        return '';
    return String(value).replace(/\s+/g, ' ').trim();
}
function pickText(...values) {
    return values.map((value) => normalizeText(value)).find(Boolean) || '';
}
function toNumber(value, fallback = 0) {
    const normalized = typeof value === 'string' ? value.replace(/[^0-9.-]+/g, '') : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function formatCurrency(value) {
    return `Rs.${toNumber(value).toFixed(2)}`;
}
function formatDate(value) {
    const raw = normalizeText(value);
    if (!raw)
        return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()))
        return raw;
    const day = `${parsed.getDate()}`.padStart(2, '0');
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
}
function safeParseObject(value, fallback = {}) {
    if (!value)
        return fallback;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
        }
        catch {
            return fallback;
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}
function safeParseArray(value, fallback = []) {
    if (Array.isArray(value))
        return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : fallback;
        }
        catch {
            return fallback;
        }
    }
    return fallback;
}
function isEnabled(value, fallback = true) {
    return value === undefined ? fallback : value === true;
}
function resolveLabelCourierName(order, providerMeta) {
    const courierName = pickText(order.courier_partner, providerMeta.courier_name);
    const integrationType = normalizeText(order.integration_type).toLowerCase();
    if (integrationType === 'velocity' &&
        /^(velocity|velocity shipping)$/i.test(courierName)) {
        return 'Courier Name';
    }
    return courierName || 'Courier Name';
}
function mergeSettings(prefs) {
    if (!prefs)
        return exports.DEFAULT_LABEL_SETTINGS;
    return {
        printer_type: prefs.printer_type ?? exports.DEFAULT_LABEL_SETTINGS.printer_type,
        char_limit: prefs.char_limit ?? exports.DEFAULT_LABEL_SETTINGS.char_limit,
        max_items: prefs.max_items ?? exports.DEFAULT_LABEL_SETTINGS.max_items,
        order_info: {
            ...exports.DEFAULT_LABEL_SETTINGS.order_info,
            ...(prefs.order_info || {}),
        },
        shipper_info: {
            ...exports.DEFAULT_LABEL_SETTINGS.shipper_info,
            ...(prefs.shipper_info || {}),
        },
        product_info: {
            ...exports.DEFAULT_LABEL_SETTINGS.product_info,
            ...(prefs.product_info || {}),
        },
        powered_by: prefs.powered_by ?? exports.DEFAULT_LABEL_SETTINGS.powered_by,
    };
}
function splitFreeformAddress(text, lineLimit = 32) {
    const clean = normalizeText(text);
    if (!clean)
        return [];
    const parts = clean
        .split(',')
        .map((part) => normalizeText(part))
        .filter(Boolean);
    if (parts.length <= 1)
        return [clean];
    const lines = [];
    let current = '';
    for (const part of parts) {
        const candidate = current ? `${current}, ${part}` : part;
        if (candidate.length > lineLimit && current) {
            lines.push(current);
            current = part;
        }
        else {
            current = candidate;
        }
    }
    if (current)
        lines.push(current);
    return lines;
}
function buildCityStatePincode(source) {
    const city = pickText(source.city, source.district);
    const state = pickText(source.state);
    const pincode = pickText(source.pincode, source.zipcode, source.zip);
    const cityState = [city, state].filter(Boolean).join(', ');
    return [cityState, pincode].filter(Boolean).join(' ');
}
function buildAddressBlock(source, fallbackName = '', fallbackAddress = '') {
    const line1 = pickText(source.address_line_1, source.addressLine1, source.address1, source.line1);
    const line2 = pickText(source.address_line_2, source.addressLine2, source.address2, source.line2, source.landmark);
    let addressLines = [line1, line2].filter(Boolean);
    if (addressLines.length === 0) {
        addressLines = splitFreeformAddress(pickText(source.address, fallbackAddress));
    }
    return {
        name: pickText(source.name, source.full_name, source.contact_name, fallbackName),
        addressLines,
        cityStatePincode: buildCityStatePincode(source),
        primaryPhone: pickText(source.phone, source.mobile, source.mobile_number),
        alternatePhone: pickText(source.alternate_phone, source.alternatePhone, source.alt_phone, source.altPhone),
        gstin: pickText(source.gstin, source.gst_number, source.gstNumber, source.company_gst, source.gst),
    };
}
function formatWeightLabel(order) {
    const directKg = normalizeText(order.weightKg);
    if (directKg)
        return directKg.toLowerCase().includes('kg') ? directKg : `${directKg} kg`;
    const directDeadWeight = normalizeText(order.deadWeight);
    if (directDeadWeight)
        return directDeadWeight;
    const grams = toNumber(order.weight ?? order.actual_weight ?? order.dead_weight, 0);
    if (grams > 0) {
        return `${(grams >= 10 ? grams / 1000 : grams).toFixed(3)} kg`;
    }
    return '-';
}
function formatDimensionsLabel(order) {
    const direct = pickText(order.dimension, order.dimensions);
    if (direct) {
        const normalized = direct.replace(/x/gi, ' x ').replace(/\s+/g, ' ').trim();
        return /cm\b/i.test(normalized) ? normalized : `${normalized} cm`;
    }
    const length = pickText(order.length, order.box_length);
    const breadth = pickText(order.breadth, order.width, order.box_width);
    const height = pickText(order.height, order.box_height);
    if (length && breadth && height) {
        return `${length} x ${breadth} x ${height} cm`;
    }
    return '-';
}
async function bufferToDataUrl(buffer) {
    try {
        if (!buffer?.length)
            return null;
        const type = await file_type_1.default.fromBuffer(buffer);
        const mime = type?.mime?.startsWith('image/') ? type.mime : 'image/png';
        return `data:${mime};base64,${buffer.toString('base64')}`;
    }
    catch {
        return buffer?.length ? `data:image/png;base64,${buffer.toString('base64')}` : null;
    }
}
function isValidDataUrl(str) {
    return typeof str === 'string' && str.startsWith('data:image/');
}
async function optimizeLabelImage(dataUrl, kind) {
    if (!dataUrl || !isValidDataUrl(dataUrl))
        return dataUrl || null;
    const match = dataUrl.match(/^data:image\/[A-Za-z0-9.+-]+;base64,(.+)$/);
    if (!match)
        return dataUrl;
    try {
        const limits = kind === 'sellerLogo'
            ? { width: 220, height: 220, colors: 64 }
            : kind === 'platformLogo'
                ? { width: 180, height: 120, colors: 64 }
                : { width: 960, height: 220, colors: 2 };
        const resized = (0, sharp_1.default)(Buffer.from(match[1], 'base64')).resize({
            width: limits.width,
            height: limits.height,
            fit: 'inside',
            withoutEnlargement: true,
            kernel: kind === 'barcode' ? sharp_1.default.kernel.nearest : sharp_1.default.kernel.lanczos3,
        });
        const optimized = kind === 'barcode'
            ? await resized.flatten({ background: '#FFFFFF' }).png({ compressionLevel: 9 }).toBuffer()
            : await resized.png({ compressionLevel: 9, palette: true, colors: limits.colors }).toBuffer();
        return `data:image/png;base64,${optimized.toString('base64')}`;
    }
    catch (err) {
        console.warn(`Failed to optimize label ${kind}:`, err);
        return dataUrl;
    }
}
async function generateBarcodeBase64(text, options) {
    if (!text)
        return null;
    try {
        const png = await bwip_js_1.default.toBuffer({
            bcid: 'code128',
            text,
            scale: options?.scale ?? 2.4,
            height: options?.height ?? 20,
            includetext: options?.includeText ?? false,
            textxalign: 'center',
            paddingwidth: options?.paddingWidth ?? 10,
            paddingheight: options?.paddingHeight ?? 6,
        });
        return `data:image/png;base64,${png.toString('base64')}`;
    }
    catch (err) {
        console.warn('Barcode generation failed:', err);
        return null;
    }
}
async function downloadImageAsDataUrl(source) {
    const value = normalizeText(source);
    if (!value)
        return null;
    if (isValidDataUrl(value))
        return value;
    if (!value.startsWith('http'))
        return null;
    try {
        const response = await axios_1.default.get(value, {
            responseType: 'arraybuffer',
            timeout: LABEL_ASSET_TIMEOUT_MS,
        });
        return bufferToDataUrl(Buffer.from(response.data));
    }
    catch (err) {
        console.warn(`Failed to download label image asset from ${value}:`, err);
        return null;
    }
}
function buildInfoCell(label, value) {
    return {
        stack: [
            { text: label, fontSize: 6.2, color: LABEL_BLACK, bold: true, alignment: 'center' },
            { text: value || '-', fontSize: 6.35, color: LABEL_BLACK, bold: true, alignment: 'center' },
        ],
        alignment: 'center',
    };
}
function buildMetricCell(value, fontSize = 6.4) {
    return {
        text: normalizeText(value) || '-',
        color: LABEL_BLACK,
        bold: true,
        fontSize,
        alignment: 'center',
        margin: [0, 0.8, 0, 0.8],
    };
}
function buildTextLine(text, color = LABEL_BLACK, fontSize = 6) {
    return {
        text,
        color,
        fontSize,
        bold: true,
        margin: [0, 0, 0, 0],
    };
}
function getContactFontSize(lines) {
    const totalLength = lines.join(' ').length;
    if (totalLength > 170)
        return 5.6;
    if (totalLength > 125)
        return 5.8;
    if (totalLength > 85)
        return 6.1;
    return 6.4;
}
function getContactLineLimit(fontSize) {
    if (fontSize <= 5.6)
        return 38;
    if (fontSize <= 5.8)
        return 36;
    if (fontSize <= 6.1)
        return 34;
    return 31;
}
function ellipsize(text, maxLength) {
    const clean = normalizeText(text);
    if (clean.length <= maxLength)
        return clean;
    return `${clean.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
function wrapContactLine(text, maxLength) {
    const clean = normalizeText(text);
    if (!clean)
        return [];
    const words = clean.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
        if (word.length > maxLength) {
            if (current) {
                lines.push(current);
                current = '';
            }
            for (let index = 0; index < word.length; index += maxLength) {
                lines.push(word.slice(index, index + maxLength));
            }
            continue;
        }
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxLength && current) {
            lines.push(current);
            current = word;
        }
        else {
            current = candidate;
        }
    }
    if (current)
        lines.push(current);
    return lines;
}
function fitContactLines(lines) {
    const fontSize = getContactFontSize(lines);
    const maxLineLength = getContactLineLimit(fontSize);
    const wrapped = lines.flatMap((line) => wrapContactLine(line, maxLineLength));
    if (wrapped.length <= CONTACT_BLOCK_MAX_LINES) {
        return { fontSize, lines: wrapped };
    }
    const fitted = wrapped.slice(0, CONTACT_BLOCK_MAX_LINES);
    fitted[CONTACT_BLOCK_MAX_LINES - 1] = ellipsize(fitted[CONTACT_BLOCK_MAX_LINES - 1], maxLineLength);
    return { fontSize, lines: fitted };
}
function buildContactLines(block, options) {
    const lines = [];
    if (options?.showName !== false && block.name) {
        lines.push(block.name);
    }
    if (options?.showAddress !== false) {
        if (block.addressLines[0])
            lines.push(block.addressLines[0]);
        if (block.addressLines[1])
            lines.push(block.addressLines[1]);
        if (block.cityStatePincode)
            lines.push(block.cityStatePincode);
    }
    if (options?.showPrimaryPhone !== false && block.primaryPhone) {
        lines.push(`Mobile: ${block.primaryPhone}`);
    }
    if (options?.showOptionalPhone && block.optionalPhone) {
        lines.push(`${options.optionalPhoneLabel || 'Alternate'}: ${block.optionalPhone}`);
    }
    if (options?.showGstin && block.gstin) {
        lines.push(`GSTIN: ${block.gstin}`);
    }
    return lines;
}
function buildContactBlock(block, _rowCount, options) {
    const lines = buildContactLines(block, options);
    const fitted = fitContactLines(lines);
    return {
        table: {
            widths: ['*'],
            body: [
                [
                    {
                        stack: [
                            {
                                text: block.title,
                                color: LABEL_BLACK,
                                bold: true,
                                fontSize: options?.expanded ? 8.2 : 6.8,
                                margin: [0, 0, 0, 0.9],
                            },
                            ...Array.from({ length: CONTACT_BLOCK_MAX_LINES }, (_, index) => buildTextLine(fitted.lines[index] || ' ', LABEL_BLACK, fitted.fontSize + (options?.expanded ? 1.1 : 0))),
                        ],
                    },
                ],
            ],
        },
        layout: {
            hLineColor: () => LABEL_BLACK,
            vLineColor: () => LABEL_BLACK,
            hLineWidth: () => 0.7,
            vLineWidth: () => 0.7,
            paddingTop: () => options?.expanded ? 1.8 : 0.9,
            paddingBottom: () => options?.expanded ? 1.8 : 0.9,
            paddingLeft: () => 2.5,
            paddingRight: () => 2.5,
        },
    };
}
function buildDemoLogoBadge(text) {
    const initials = normalizeText(text)
        .split(/\s+/)
        .map((part) => part[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'SL';
    return {
        table: {
            widths: [46],
            body: [
                [
                    {
                        stack: [
                            {
                                text: initials,
                                color: LABEL_BLACK,
                                bold: true,
                                fontSize: 16,
                                alignment: 'center',
                                margin: [0, 4, 0, 0],
                            },
                            {
                                text: 'DEMO LOGO',
                                color: LABEL_BLACK,
                                bold: true,
                                fontSize: 5.4,
                                alignment: 'center',
                                margin: [0, 0, 0, 3],
                            },
                        ],
                        alignment: 'center',
                        margin: [0, 1, 0, 0],
                    },
                ],
            ],
        },
        layout: {
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
            hLineColor: () => LABEL_BLACK,
            vLineColor: () => LABEL_BLACK,
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
        },
    };
}
function buildLabelPdfDocument(payload, settings, assets = {}) {
    const images = {};
    if (assets.logoBase64 && isValidDataUrl(assets.logoBase64))
        images.logo = assets.logoBase64;
    if (assets.platformLogoBase64 && isValidDataUrl(assets.platformLogoBase64)) {
        images.platformLogo = assets.platformLogoBase64;
    }
    const showHeaderLogo = isEnabled(settings.shipper_info?.brandLogo, true) && Boolean(images.logo);
    const isA4 = ['a4', 'inkjet'].includes(normalizeText(settings.printer_type).toLowerCase());
    const showBillingGstin = isEnabled(settings.order_info?.billingGstin, false);
    const showCustomerPhone = isEnabled(settings.order_info?.customerPhone, true);
    const showAlternatePhone = isEnabled(settings.order_info?.alternatePhone, false);
    const showMiddleBarcode = isEnabled(settings.order_info?.middleBarcode, false);
    const showOrderNumber = isEnabled(settings.order_info?.orderNumber, true);
    const showSkuBarcode = isEnabled(settings.order_info?.skuBarcode, true);
    const expandContacts = !showMiddleBarcode && !showOrderNumber && (!showSkuBarcode || !payload.products[0]?.sku);
    const showShipperName = isEnabled(settings.shipper_info?.shipperName, true);
    const showShipperAddress = isEnabled(settings.shipper_info?.shipperAddress, true);
    const showShipperPhone = isEnabled(settings.shipper_info?.shipperPhone, true);
    const showShipperGstin = isEnabled(settings.shipper_info?.gstin, true);
    const showReturnName = isEnabled(settings.shipper_info?.returnName, true);
    const showReturnAddress = isEnabled(settings.shipper_info?.returnAddress, true);
    const showReturnPhone = isEnabled(settings.shipper_info?.returnPhone, true);
    const showEwayBillNumber = isEnabled(settings.order_info?.ewayBillNumber, false);
    const showPricing = isEnabled(settings.product_info?.productCost, true);
    if (assets.awbBarcode && isValidDataUrl(assets.awbBarcode))
        images.awbBarcode = assets.awbBarcode;
    if (showMiddleBarcode && assets.orderBarcode && isValidDataUrl(assets.orderBarcode)) {
        images.orderBarcode = assets.orderBarcode;
    }
    if (showSkuBarcode && assets.skuBarcode && isValidDataUrl(assets.skuBarcode)) {
        images.skuBarcode = assets.skuBarcode;
    }
    const charLimit = Math.max(12, Number(settings.char_limit ?? exports.DEFAULT_LABEL_SETTINGS.char_limit));
    const maxItems = Math.max(1, Number(settings.max_items ?? exports.DEFAULT_LABEL_SETTINGS.max_items));
    const visibleProducts = payload.products.slice(0, maxItems);
    const awbBarcodeFit = [220, 46];
    const orderBarcodeFit = [170, 44];
    const demoLogoText = normalizeText(assets.demoLogoText);
    const awbHeaderContent = images.awbBarcode
        ? [
            {
                image: 'awbBarcode',
                fit: awbBarcodeFit,
                alignment: 'center',
                margin: [0, 0, 0, 1.2],
            },
            {
                text: payload.awbNumber || '-',
                color: LABEL_BLACK,
                bold: true,
                fontSize: 10.2,
                alignment: 'center',
                margin: [0, 0, 0, 1.5],
            },
        ]
        : [
            {
                text: payload.awbNumber || '-',
                color: LABEL_BLACK,
                bold: true,
                fontSize: 11,
                alignment: 'center',
                margin: [0, 6, 0, 6],
            },
        ];
    const orderHeaderContent = images.orderBarcode
        ? [
            {
                image: 'orderBarcode',
                fit: orderBarcodeFit,
                alignment: 'center',
                margin: [0, 0, 0, 1.2],
            },
            ...(showOrderNumber ? [{
                    text: payload.orderId || '-',
                    color: LABEL_BLACK,
                    bold: true,
                    fontSize: 10,
                    alignment: 'center',
                    margin: [0, 0, 0, 2],
                }] : []),
        ]
        : showOrderNumber ? [
            {
                text: payload.orderId || '-',
                color: LABEL_BLACK,
                bold: true,
                fontSize: 13,
                alignment: 'center',
                margin: [0, 2, 0, 4],
            },
        ] : [];
    const shipToLines = buildContactLines(payload.shipTo, {
        showName: true,
        showAddress: true,
        showPrimaryPhone: showCustomerPhone,
        showOptionalPhone: showAlternatePhone,
        optionalPhoneLabel: 'Alternate',
    });
    const billToLines = buildContactLines(payload.billTo, {
        showName: true,
        showAddress: true,
        showPrimaryPhone: showCustomerPhone,
        showGstin: showBillingGstin,
    });
    const shipFromLines = buildContactLines(payload.shipFrom, {
        showName: showShipperName,
        showAddress: showShipperAddress,
        showPrimaryPhone: showShipperPhone,
        showOptionalPhone: showShipperPhone,
        optionalPhoneLabel: 'Mobile',
        showGstin: showShipperGstin,
    });
    const returnToLines = buildContactLines(payload.returnTo, {
        showName: showReturnName,
        showAddress: showReturnAddress,
        showPrimaryPhone: showReturnPhone,
        showOptionalPhone: showReturnPhone,
        optionalPhoneLabel: 'Mobile',
    });
    const contactRowCount = Math.max(5, shipToLines.length, billToLines.length, shipFromLines.length, returnToLines.length);
    const productTableWidths = showPricing ? ['*', 28, 46, 52] : ['*', 28];
    const productHeaderRow = showPricing
        ? [
            { text: 'Product Name', color: LABEL_BLACK, bold: true, fontSize: 7.1, alignment: 'center' },
            { text: 'QTY', color: LABEL_BLACK, bold: true, fontSize: 7.1, alignment: 'center' },
            { text: 'Price INR', color: LABEL_BLACK, bold: true, fontSize: 7.1, alignment: 'center' },
            { text: 'Amount INR', color: LABEL_BLACK, bold: true, fontSize: 7.1, alignment: 'center' },
        ]
        : [
            { text: 'Product Name', color: LABEL_BLACK, bold: true, fontSize: 7.1, alignment: 'center' },
            { text: 'QTY', color: LABEL_BLACK, bold: true, fontSize: 7.1, alignment: 'center' },
        ];
    const productRows = visibleProducts.length > 0
        ? visibleProducts.map((product) => {
            const baseRow = [
                {
                    text: normalizeText(product.name).length > charLimit
                        ? `${normalizeText(product.name).slice(0, charLimit)}...`
                        : normalizeText(product.name) || '-',
                    fontSize: 6.8,
                    color: LABEL_BLACK,
                    alignment: 'center',
                    margin: [0, 0.45, 0, 0.45],
                },
                {
                    text: String(product.qty || 0),
                    fontSize: 6.8,
                    color: LABEL_BLACK,
                    alignment: 'center',
                    margin: [0, 0.45, 0, 0.45],
                },
            ];
            if (showPricing) {
                baseRow.push({
                    text: toNumber(product.price).toFixed(2).replace(/\.00$/, ''),
                    fontSize: 6.8,
                    color: LABEL_BLACK,
                    alignment: 'center',
                    margin: [0, 0.45, 0, 0.45],
                }, {
                    text: toNumber(product.amount).toFixed(2),
                    fontSize: 6.8,
                    color: LABEL_BLACK,
                    alignment: 'center',
                    margin: [0, 0.45, 0, 0.45],
                });
            }
            return baseRow;
        })
        : [
            showPricing
                ? [
                    { text: 'No product data available', colSpan: 4, alignment: 'center', fontSize: 8 },
                    {},
                    {},
                    {},
                ]
                : [
                    { text: 'No product data available', colSpan: 2, alignment: 'center', fontSize: 8 },
                    {},
                ],
        ];
    const summaryRows = [
        { label: 'Total Qty', value: String(payload.totalQty || 0), strong: false },
        { label: 'Product Amount', value: formatCurrency(payload.productAmount || 0), strong: false },
        ...(payload.chargeRows || []).map((row) => ({
            label: row.label,
            value: row.value,
            strong: false,
        })),
        { label: 'Total Amount', value: formatCurrency(payload.totalAmount), strong: true },
    ];
    const pageContent = [
        {
            table: {
                widths: [56, '*'],
                body: [
                    [
                        showHeaderLogo
                            ? {
                                image: 'logo',
                                fit: [46, 46],
                                alignment: 'left',
                                margin: [0, 2, 0, 0],
                            }
                            : demoLogoText
                                ? buildDemoLogoBadge(demoLogoText)
                                : { text: '', margin: [0, 12, 0, 0] },
                        {
                            stack: [
                                {
                                    text: payload.courierName || 'Courier Name',
                                    color: LABEL_BLACK,
                                    bold: true,
                                    fontSize: 12,
                                    alignment: 'center',
                                    margin: [0, 0, 0, 2],
                                },
                                ...awbHeaderContent,
                                ...(payload.routingCode
                                    ? [
                                        {
                                            text: `ROUTE CODE: ${payload.routingCode}`,
                                            color: LABEL_BLACK,
                                            bold: true,
                                            fontSize: 9.2,
                                            alignment: 'center',
                                            margin: [0, 0.5, 0, 1.5],
                                        },
                                    ]
                                    : []),
                            ],
                        },
                    ],
                ],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 2.5],
        },
        {
            table: {
                widths: ['*', '*', '*'],
                body: [
                    [
                        buildMetricCell(`Weight ${payload.weightLabel}`),
                        buildMetricCell(payload.dimensionsLabel),
                        buildMetricCell(payload.paymentLabel),
                    ],
                ],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 3],
        },
        {
            table: {
                widths: ['*', '*'],
                body: [
                    [
                        buildContactBlock(payload.shipTo, contactRowCount, {
                            showName: true,
                            showAddress: true,
                            showPrimaryPhone: showCustomerPhone,
                            showOptionalPhone: showAlternatePhone,
                            optionalPhoneLabel: 'Alternate',
                            expanded: expandContacts,
                        }),
                        buildContactBlock(payload.billTo, contactRowCount, {
                            showName: true,
                            showAddress: true,
                            showPrimaryPhone: showCustomerPhone,
                            showGstin: showBillingGstin,
                            expanded: expandContacts,
                        }),
                    ],
                    [
                        buildContactBlock(payload.shipFrom, contactRowCount, {
                            showName: showShipperName,
                            showAddress: showShipperAddress,
                            showPrimaryPhone: showShipperPhone,
                            showOptionalPhone: showShipperPhone,
                            optionalPhoneLabel: 'Mobile',
                            showGstin: showShipperGstin,
                            expanded: expandContacts,
                        }),
                        buildContactBlock(payload.returnTo, contactRowCount, {
                            showName: showReturnName,
                            showAddress: showReturnAddress,
                            showPrimaryPhone: showReturnPhone,
                            showOptionalPhone: showReturnPhone,
                            optionalPhoneLabel: 'Mobile',
                            expanded: expandContacts,
                        }),
                    ],
                ],
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => 0,
            },
            margin: [0, 0, 0, 3],
        },
        ...(images.skuBarcode ? [{ stack: [
                    { image: 'skuBarcode', fit: [170, 36], alignment: 'center' },
                    { text: `SKU: ${payload.products[0].sku}`, color: LABEL_BLACK, bold: true, fontSize: 7.5, alignment: 'center' },
                ] }] : []),
        ...(orderHeaderContent.length ? [{ stack: orderHeaderContent }] : []),
        {
            table: {
                widths: ['*', '*', '*'],
                body: [
                    [
                        {
                            text: `Invoice No. ${payload.invoiceNumber || '-'}`,
                            color: LABEL_BLACK,
                            bold: true,
                            fontSize: 6.4,
                            alignment: 'center',
                        },
                        {
                            text: `Invoice Date ${payload.invoiceDate || '-'}`,
                            color: LABEL_BLACK,
                            bold: true,
                            fontSize: 6.4,
                            alignment: 'center',
                        },
                        {
                            text: showEwayBillNumber && payload.ewayBillNumber
                                ? `Eway Bill No. ${payload.ewayBillNumber}`
                                : '',
                            color: LABEL_BLACK,
                            bold: true,
                            fontSize: 6.4,
                            alignment: 'center',
                        },
                    ],
                ],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 2],
        },
        {
            table: {
                headerRows: 1,
                widths: productTableWidths,
                body: [productHeaderRow, ...productRows],
            },
            layout: {
                hLineWidth: () => 0.7,
                vLineWidth: () => 0.7,
                hLineColor: () => LABEL_BLACK,
                vLineColor: () => LABEL_BLACK,
                paddingTop: () => 0.8,
                paddingBottom: () => 0.7,
                paddingLeft: () => 1.2,
                paddingRight: () => 1.2,
            },
            margin: [0, 0, 0, 2],
        },
    ];
    if (payload.continuationNote) {
        pageContent.push({
            text: payload.continuationNote,
            color: LABEL_BLACK,
            fontSize: 5.7,
            margin: [0, 0, 0, 2],
        });
    }
    pageContent.push({
        table: {
            widths: [96, '*'],
            body: summaryRows.map((row) => [
                {
                    text: row.label,
                    color: LABEL_BLACK,
                    bold: true,
                    fontSize: row.strong ? 7.1 : 6.7,
                    alignment: 'left',
                    margin: [0, 0.6, 0, 0.6],
                },
                {
                    text: row.value,
                    color: LABEL_BLACK,
                    bold: true,
                    fontSize: row.strong ? 7.1 : 6.7,
                    alignment: 'right',
                    margin: [0, 0.6, 0, 0.6],
                },
            ]),
        },
        layout: {
            hLineWidth: () => 0.7,
            vLineWidth: () => 0.7,
            hLineColor: () => LABEL_BLACK,
            vLineColor: () => LABEL_BLACK,
            paddingLeft: () => 1.4,
            paddingRight: () => 1.4,
            paddingTop: () => 0.9,
            paddingBottom: () => 0.9,
        },
        margin: [0, 0, 0, 2],
    });
    pageContent.push({
        text: payload.sellerState
            ? `All disputes are subject to ${payload.sellerState} jurisdiction only.`
            : 'All disputes are subject to seller jurisdiction only.',
        color: LABEL_BLACK,
        fontSize: 4.9,
        alignment: 'center',
        margin: [0, 0, 0, 0.5],
    }, {
        text: "Goods once sold will only be taken back or exchanged as per the store's return policy.",
        color: LABEL_BLACK,
        fontSize: 4.8,
        alignment: 'center',
        margin: [0, 0, 0, 1.2],
    }, {
        canvas: [
            {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: THERMAL_LABEL_SIZE.width - 36,
                y2: 0,
                lineWidth: 0.8,
                lineColor: LABEL_BLACK,
            },
        ],
        margin: [0, 0, 0, 1],
    }, {
        stack: [
            {
                text: `This shipment is Powered by ${normalizeText(settings.powered_by) || 'Shipray.com'}`,
                color: LABEL_BLACK,
                bold: true,
                fontSize: 5.7,
                alignment: 'center',
                margin: [0, 0, 0, 0.6],
            },
            {
                text: 'This is a system generated document, hence no signature is required',
                color: LABEL_BLACK,
                bold: true,
                fontSize: 5.7,
                alignment: 'center',
            },
        ],
    });
    return {
        defaultStyle: { font: 'Helvetica' },
        pageSize: isA4 ? A4_LABEL_SIZE : THERMAL_LABEL_SIZE,
        pageMargins: isA4
            ? [153, 36, 153, 36]
            : [4, 4, 4, 4],
        content: [{ stack: pageContent }],
        ...(Object.keys(images).length > 0 ? { images } : {}),
    };
}
async function buildLabelPdfBuffer(payload, settings, assets = {}) {
    const logoSource = assets.logoBase64 && isValidDataUrl(assets.logoBase64) ? assets.logoBase64 : null;
    const optimizedAssets = {
        logoBase64: await optimizeLabelImage(logoSource, 'sellerLogo'),
        platformLogoBase64: await optimizeLabelImage(assets.platformLogoBase64, 'platformLogo'),
        awbBarcode: await optimizeLabelImage(assets.awbBarcode, 'barcode'),
        orderBarcode: await optimizeLabelImage(assets.orderBarcode, 'barcode'),
        skuBarcode: await optimizeLabelImage(assets.skuBarcode, 'barcode'),
        demoLogoText: !logoSource && isEnabled(settings.shipper_info?.brandLogo, true)
            ? payload.shipFrom?.name || 'LOGO'
            : null,
    };
    const printer = new pdfmake_1.default(fonts);
    const pdfDoc = printer.createPdfKitDocument(buildLabelPdfDocument(payload, settings, optimizedAssets));
    const chunks = [];
    return new Promise((resolve, reject) => {
        pdfDoc.on('data', (chunk) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
        pdfDoc.end();
    });
}
function buildLabelPayload(order, profileOfUser, pickup, rto, providerMeta, settings) {
    const rawConsignee = {
        name: pickText(order.buyer_name, order.consignee_name, order.name),
        address: pickText(order.address),
        city: pickText(order.city),
        state: pickText(order.state),
        pincode: pickText(order.pincode),
        phone: pickText(order.buyer_phone, order.phone),
        alternate_phone: pickText(order.alternate_phone, order.alt_phone, order.altPhone, order.buyer_alternate_phone),
    };
    const billingObject = safeParseObject(typeof order.billing_address === 'object' ? order.billing_address : order.billing_details);
    const sellerBrandName = pickText(profileOfUser?.companyInfo?.companyName, profileOfUser?.companyInfo?.displayName, pickup.warehouse_name, pickup.name);
    const shipToAddress = buildAddressBlock(rawConsignee, rawConsignee.name, rawConsignee.address);
    const billToAddress = buildAddressBlock({
        ...billingObject,
        name: pickText(order.billing_name, billingObject.name, order.company_name, order.billing_company, rawConsignee.name),
        address: pickText(typeof order.billing_address === 'string' ? order.billing_address : '', billingObject.address, rawConsignee.address),
        city: pickText(order.billing_city, billingObject.city, rawConsignee.city),
        state: pickText(order.billing_state, billingObject.state, rawConsignee.state),
        pincode: pickText(order.billing_pincode, billingObject.pincode, rawConsignee.pincode),
        phone: pickText(order.billing_phone, billingObject.phone, rawConsignee.phone),
        gstin: pickText(order.company_gst, order.buyer_gst_number, order.billing_gst_number, billingObject.gstin, billingObject.gst_number, providerMeta.buyer_gst_number),
    }, rawConsignee.name, rawConsignee.address);
    const shipFromAddress = buildAddressBlock({
        ...pickup,
        name: sellerBrandName,
        address: pickText(pickup.address),
        city: pickText(pickup.city),
        state: pickText(pickup.state),
        pincode: pickText(pickup.pincode),
        phone: pickText(pickup.phone),
        gst_number: pickText(pickup.gst_number, pickup.gstNumber),
    }, sellerBrandName, pickText(pickup.address));
    const returnSource = rto && Object.keys(rto).length > 0
        ? {
            ...rto,
            address: pickText(rto.address),
            city: pickText(rto.city, pickup.city),
            state: pickText(rto.state, pickup.state),
            pincode: pickText(rto.pincode, pickup.pincode),
            phone: pickText(rto.phone, pickup.phone),
        }
        : {
            ...pickup,
            address: pickText(pickup.address),
            city: pickText(pickup.city),
            state: pickText(pickup.state),
            pincode: pickText(pickup.pincode),
            phone: pickText(pickup.phone),
        };
    const returnAddress = buildAddressBlock({
        ...returnSource,
        name: pickText(returnSource.name, returnSource.contact_name, sellerBrandName),
    }, sellerBrandName, pickText(returnSource.address));
    const products = safeParseArray(order.products)
        .map((product) => {
        const qty = Math.max(1, toNumber(product.qty ?? product.quantity, 1));
        const price = toNumber(product.price ?? product.unitPrice, 0);
        const amount = price > 0
            ? Number((Math.max(0, price * qty - toNumber(product.discount, 0))).toFixed(2))
            : toNumber(product.amount ?? product.total, 0);
        return {
            name: pickText(product.name, product.productName, product.title, product.box_name),
            sku: pickText(product.sku, product.sku_code, product.productSku),
            qty,
            price,
            amount,
        };
    })
        .filter((product) => product.name || product.qty || product.price || product.amount);
    const totalQty = products.reduce((sum, product) => sum + product.qty, 0);
    const productAmount = products.reduce((sum, product) => sum + product.amount, 0);
    const shippingCharges = toNumber(order.shipping_charges ?? 0);
    const transactionFee = toNumber(order.transaction_fee ?? 0);
    const giftWrap = toNumber(order.gift_wrap ?? 0);
    const discount = toNumber(order.discount ?? 0);
    const prepaidAmount = toNumber(order.prepaid_amount ?? 0);
    const orderAmount = (0, codAmount_1.resolveBuyerCollectableAmount)({
        orderAmount: order.order_amount,
        invoiceAmount: order.invoice_amount,
        shippingCharges: order.shipping_charges,
        transactionFee: order.transaction_fee,
        giftWrap: order.gift_wrap,
        discount: order.discount,
        prepaidAmount: order.prepaid_amount,
        trustOrderAmount: true,
    });
    const paymentType = pickText(order.payment_type, order.order_type, order.type).toLowerCase();
    const sellerState = pickText(pickup.state, returnSource.state);
    const providerPackage = safeParseArray(providerMeta.packages)[0] || safeParseObject(providerMeta.package);
    const chargeRows = [
        shippingCharges > 0 ? { label: 'Shipping Charges', value: formatCurrency(shippingCharges) } : null,
        transactionFee > 0 ? { label: 'Transaction Fee', value: formatCurrency(transactionFee) } : null,
        giftWrap > 0 ? { label: 'Gift Wrap', value: formatCurrency(giftWrap) } : null,
        discount > 0 ? { label: 'Discount', value: `-${formatCurrency(discount)}`.replace('Rs.-', '-Rs.') } : null,
        prepaidAmount > 0
            ? { label: 'Prepaid Amount', value: `-${formatCurrency(prepaidAmount)}`.replace('Rs.-', '-Rs.') }
            : null,
    ].filter(Boolean);
    return {
        courierName: resolveLabelCourierName(order, providerMeta),
        awbNumber: pickText((0, pickupDetails_service_1.resolveOrderAwbNumber)(order)),
        routingCode: pickText(order.sort_code, order.sortCode, order.routing_code, order.routingCode, providerMeta.sort_code, providerMeta.sortCode, providerMeta.routing_code, providerMeta.routingCode, providerPackage.sort_code, providerPackage.sortCode, providerPackage.routing_code, providerPackage.routingCode),
        orderId: pickText(order.order_number, order.orderId, order.id),
        invoiceNumber: pickText(order.invoice_number, order.invoiceNumber),
        invoiceDate: formatDate(order.invoice_date || order.invoiceDate || order.order_date || order.orderDate),
        ewayBillNumber: pickText(order.eway_bill_number, order.ewaybill_number, order.ewaybill, providerMeta.ewaybill_number, providerMeta.eway_bill, providerMeta.ewaybill, providerMeta.ewbn, providerMeta.ewb),
        weightLabel: formatWeightLabel(order),
        dimensionsLabel: formatDimensionsLabel(order),
        paymentLabel: paymentType === 'cod' ? 'COD' : 'Prepaid',
        shipTo: {
            title: 'Ship To,',
            name: shipToAddress.name,
            addressLines: shipToAddress.addressLines,
            cityStatePincode: shipToAddress.cityStatePincode,
            primaryPhone: shipToAddress.primaryPhone,
            optionalPhone: shipToAddress.alternatePhone,
        },
        billTo: {
            title: 'Bill To,',
            name: billToAddress.name,
            addressLines: billToAddress.addressLines,
            cityStatePincode: billToAddress.cityStatePincode,
            primaryPhone: billToAddress.primaryPhone,
            gstin: billToAddress.gstin,
        },
        shipFrom: {
            title: 'Ship From,',
            name: shipFromAddress.name,
            addressLines: shipFromAddress.addressLines,
            cityStatePincode: shipFromAddress.cityStatePincode,
            optionalPhone: showShipFromOptionalPhone(settings) ? shipFromAddress.primaryPhone : '',
            gstin: shipFromAddress.gstin,
        },
        returnTo: {
            title: 'Return To,',
            name: returnAddress.name,
            addressLines: returnAddress.addressLines,
            cityStatePincode: returnAddress.cityStatePincode,
            optionalPhone: returnAddress.primaryPhone,
        },
        products,
        totalQty,
        productAmount,
        chargeRows,
        totalAmount: orderAmount > 0 ? orderAmount : productAmount,
        continuationNote: products.length > Math.max(1, Number(settings.max_items ?? exports.DEFAULT_LABEL_SETTINGS.max_items))
            ? 'Continue to next page if products are more'
            : '',
        sellerState,
    };
}
function showShipFromOptionalPhone(settings) {
    return isEnabled(settings.shipper_info?.shipperPhone, true);
}
async function resolvePlatformLogoBase64() {
    const adminPrefs = await (0, invoicePreferences_service_1.getAdminInvoicePreferences)();
    const platformLogoKey = adminPrefs?.includeLogo !== false && adminPrefs?.logoFile ? adminPrefs.logoFile : null;
    if (!platformLogoKey)
        return null;
    try {
        const logoUrl = await (0, upload_service_1.presignDownload)(platformLogoKey);
        const finalUrl = Array.isArray(logoUrl) ? logoUrl[0] : logoUrl;
        return downloadImageAsDataUrl(finalUrl);
    }
    catch (err) {
        console.warn('Failed to fetch platform logo for label:', err);
        return null;
    }
}
async function generateLabelForOrder(order, userId, tx = client_1.db) {
    const [prefsRow] = await tx
        .select()
        .from(labelPreferences_1.labelPreferences)
        .where((0, drizzle_orm_1.eq)(labelPreferences_1.labelPreferences.user_id, userId));
    const settings = mergeSettings(prefsRow ?? undefined);
    const [profileOfUser] = await tx
        .select()
        .from(userProfile_1.userProfiles)
        .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId));
    const pickupResolution = await (0, pickupDetails_service_1.resolvePickupDetailsForOrder)(userId, tx, order, profileOfUser);
    const pickup = pickupResolution.pickupDetails || safeParseObject(order.pickup_details);
    const rto = safeParseObject(order.rto_details);
    const providerMeta = safeParseObject(order.provider_meta);
    const payload = buildLabelPayload(order, profileOfUser || {}, pickup || {}, rto, providerMeta, settings);
    let logoBase64 = null;
    if (isEnabled(settings.shipper_info?.brandLogo) && profileOfUser?.companyInfo?.companyLogoUrl) {
        try {
            const logoUrl = await (0, upload_service_1.presignDownload)(profileOfUser.companyInfo.companyLogoUrl);
            const finalUrl = Array.isArray(logoUrl) ? logoUrl[0] : logoUrl;
            logoBase64 = await downloadImageAsDataUrl(finalUrl);
        }
        catch (err) {
            console.warn('Failed to fetch seller logo for label:', err);
        }
    }
    const barcodeSource = order.barcode_img || order.barcode_url || order.barcode_image || order.barcode || null;
    let awbBarcode = await downloadImageAsDataUrl(barcodeSource);
    if (!awbBarcode && payload.awbNumber) {
        awbBarcode = await generateBarcodeBase64(payload.awbNumber, {
            height: 12,
            scale: 6,
            paddingWidth: 8,
            paddingHeight: 2,
        });
    }
    const orderBarcode = isEnabled(settings.order_info?.middleBarcode, false) && payload.orderId
        ? await generateBarcodeBase64(payload.orderId, {
            height: 12,
            scale: 5,
            paddingWidth: 8,
            paddingHeight: 2,
        })
        : null;
    const skuBarcode = isEnabled(settings.order_info?.skuBarcode, true) && payload.products[0]?.sku
        ? await generateBarcodeBase64(payload.products[0].sku, { height: 12, scale: 5, paddingWidth: 8, paddingHeight: 2 })
        : null;
    const platformLogoBase64 = await resolvePlatformLogoBase64();
    try {
        const pdfBuffer = await buildLabelPdfBuffer(payload, settings, {
            logoBase64,
            platformLogoBase64,
            awbBarcode,
            orderBarcode,
            skuBarcode,
        });
        if (!pdfBuffer?.length) {
            throw new Error('PDF buffer is empty or invalid');
        }
        const labelIdentifier = String(order?.order_number ?? order?.id ?? 'order')
            .trim()
            .replace(/[^A-Za-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 46) || 'order';
        const versionedLabelUploadId = (0, labelStorage_1.buildVersionedLabelUploadId)({
            orderId: order?.id,
            labelIdentifier,
            pdfBuffer,
        });
        const { key } = await (0, upload_service_1.uploadBufferToR2)({
            buffer: pdfBuffer,
            filename: `label-${labelIdentifier}.pdf`,
            contentType: 'application/pdf',
            userId,
            uploadId: versionedLabelUploadId,
            folderKey: 'labels',
            cacheControl: 'private, no-store, max-age=0',
        });
        if (!key || typeof key !== 'string' || key.trim().length === 0) {
            throw new Error('Label key is invalid or empty after upload');
        }
        return key.trim();
    }
    catch (err) {
        console.error(`Failed to generate/upload label for order ${order?.order_number}:`, err?.message || err, err?.stack);
        throw new Error(`Label generation/upload failed: ${err?.message || err}`);
    }
}
