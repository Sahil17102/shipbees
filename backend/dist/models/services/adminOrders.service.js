"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderStatusServiceAdmin = exports.addManualNdrToOrderServiceAdmin = exports.regenerateOrderDocumentsServiceAdmin = exports.bookAssistedExistingB2COrderForSeller = exports.createAssistedB2CShipmentForSeller = exports.getSellerWarehousesForAssistedBooking = exports.searchApprovedSellersForAssistedBooking = exports.getAllOrdersServiceAdmin = void 0;
const axios_1 = __importDefault(require("axios"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const invoicePreferences_1 = require("../schema/invoicePreferences");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const pickupAddresses_1 = require("../schema/pickupAddresses");
const orderSanitizer_1 = require("../../utils/orderSanitizer");
const orderLabels_1 = require("../../utils/orderLabels");
const generateCustomLabelService_1 = require("./generateCustomLabelService");
const dayjs_1 = __importDefault(require("dayjs"));
const invoice_service_1 = require("./invoice.service");
const invoiceHelpers_1 = require("./invoiceHelpers");
const upload_service_1 = require("./upload.service");
const invoiceNumber_service_1 = require("./invoiceNumber.service");
const orderListing_service_1 = require("./orderListing.service");
const ndr_service_1 = require("./ndr.service");
const trackingEvents_service_1 = require("./trackingEvents.service");
const notifications_service_1 = require("./notifications.service");
const shiprocket_service_1 = require("./shiprocket.service");
const ADMIN_UPDATABLE_ORDER_STATUSES = new Set([
    'pending',
    'booked',
    'shipment_created',
    'pickup_initiated',
    'in_transit',
    'out_for_delivery',
    'ndr',
    'undelivered',
    'ndr_delivered',
    'delivered',
    'cancellation_requested',
    'cancelled',
    'rto',
    'rto_in_transit',
    'rto_delivered',
    'manifest_failed',
]);
const ADMIN_NDR_STATUSES = new Set(['ndr', 'undelivered']);
const getAllOrdersServiceAdmin = async ({ page = 1, limit = 10, filters = {}, sanitizeDocuments = true, }) => {
    const { orders: combinedOrdersRaw, totalCount, totalPages, statusCounts } = await (0, orderListing_service_1.fetchCombinedOrdersPage)({
        page,
        limit,
        filters: {
            userId: filters.userId,
            status: filters.status,
            fromDate: filters.fromDate,
            toDate: filters.toDate,
            search: filters.search,
            pickupAlert: filters.pickupAlert,
            sortBy: filters.sortBy,
            sortOrder: filters.sortOrder,
            assistedOnly: filters.assistedOnly,
        },
    });
    if (totalCount === 0) {
        return {
            orders: [],
            totalCount: 0,
            totalPages: 0,
            statusCounts,
        };
    }
    const userIds = combinedOrdersRaw
        .map((order) => order.user_id)
        .filter((id) => Boolean(id));
    const { userProfilesMap, usersMap } = await (0, orderListing_service_1.fetchOrderUserMetadata)(userIds);
    const combinedOrders = combinedOrdersRaw.map((order) => {
        const userId = order.user_id;
        const profile = userId ? userProfilesMap.get(userId) || null : null;
        const userRecord = userId ? usersMap.get(userId) || null : null;
        const companyName = profile?.companyInfo?.companyName ||
            profile?.companyInfo?.displayName ||
            null;
        return {
            ...order,
            userProfile: profile,
            merchantName: companyName || userRecord?.email || userRecord?.phone || null,
            merchantEmail: userRecord?.email || null,
            merchantPhone: userRecord?.phone || null,
        };
    });
    return {
        orders: sanitizeDocuments
            ? await (0, orderSanitizer_1.sanitizeOrdersForCustomer)(combinedOrders, { preserveManualProvider: true })
            : combinedOrders,
        totalCount,
        totalPages,
        statusCounts,
    };
};
exports.getAllOrdersServiceAdmin = getAllOrdersServiceAdmin;
const ASSISTED_BOOKING_TAG = 'assisted_booking';
const mergeAssistedTags = (tags, adminUserId) => {
    const parts = String(tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    if (!parts.includes(ASSISTED_BOOKING_TAG))
        parts.push(ASSISTED_BOOKING_TAG);
    if (adminUserId && !parts.some((tag) => tag.startsWith('assisted_by='))) {
        parts.push(`assisted_by=${adminUserId}`);
    }
    return Array.from(new Set(parts)).join(',');
};
const generateAssistedOrderNumber = () => {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, '')
        .slice(2, 14);
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ASB-${timestamp}-${random}`;
};
const searchApprovedSellersForAssistedBooking = async (query = '', limit = 20) => {
    const trimmed = String(query || '').trim();
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const conditions = [
        (0, drizzle_orm_1.eq)(users_1.users.role, 'customer'),
        (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.approved, true),
    ];
    if (trimmed) {
        const pattern = `%${trimmed}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(users_1.users.email, pattern), (0, drizzle_orm_1.ilike)(users_1.users.phone, pattern), (0, drizzle_orm_1.sql) `COALESCE(${userProfile_1.userProfiles.companyInfo}->>'companyName', '') ILIKE ${pattern}`, (0, drizzle_orm_1.sql) `COALESCE(${userProfile_1.userProfiles.companyInfo}->>'displayName', '') ILIKE ${pattern}`, (0, drizzle_orm_1.sql) `COALESCE(${userProfile_1.userProfiles.companyInfo}->>'contactPerson', '') ILIKE ${pattern}`));
    }
    const rows = await client_1.db
        .select({
        id: users_1.users.id,
        publicId: users_1.users.publicId,
        email: users_1.users.email,
        phone: users_1.users.phone,
        companyInfo: userProfile_1.userProfiles.companyInfo,
        onboardingComplete: userProfile_1.userProfiles.onboardingComplete,
    })
        .from(users_1.users)
        .innerJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.sql) `COALESCE(${userProfile_1.userProfiles.companyInfo}->>'companyName', ${users_1.users.email}, ${users_1.users.phone}) asc`)
        .limit(safeLimit);
    return rows.map((row) => ({
        id: row.id,
        publicId: row.publicId,
        email: row.email,
        phone: row.phone,
        companyName: row.companyInfo?.companyName ||
            row.companyInfo?.displayName ||
            row.companyInfo?.brandName ||
            null,
        contactPerson: row.companyInfo?.contactPerson || row.companyInfo?.name || null,
        onboardingComplete: row.onboardingComplete,
        label: row.companyInfo?.companyName ||
            row.companyInfo?.displayName ||
            row.email ||
            row.phone ||
            row.id,
    }));
};
exports.searchApprovedSellersForAssistedBooking = searchApprovedSellersForAssistedBooking;
const getSellerWarehousesForAssistedBooking = async (sellerId) => {
    const rows = await client_1.db
        .select({
        pickupId: pickupAddresses_1.pickupAddresses.id,
        isPrimary: pickupAddresses_1.pickupAddresses.isPrimary,
        isPickupEnabled: pickupAddresses_1.pickupAddresses.isPickupEnabled,
        isRTOSame: pickupAddresses_1.pickupAddresses.isRTOSame,
        contactName: pickupAddresses_1.addresses.contactName,
        contactPhone: pickupAddresses_1.addresses.contactPhone,
        contactEmail: pickupAddresses_1.addresses.contactEmail,
        addressNickname: pickupAddresses_1.addresses.addressNickname,
        addressLine1: pickupAddresses_1.addresses.addressLine1,
        addressLine2: pickupAddresses_1.addresses.addressLine2,
        landmark: pickupAddresses_1.addresses.landmark,
        city: pickupAddresses_1.addresses.city,
        state: pickupAddresses_1.addresses.state,
        country: pickupAddresses_1.addresses.country,
        pincode: pickupAddresses_1.addresses.pincode,
        gstNumber: pickupAddresses_1.addresses.gstNumber,
    })
        .from(pickupAddresses_1.pickupAddresses)
        .innerJoin(pickupAddresses_1.addresses, (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.addressId, pickupAddresses_1.addresses.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, sellerId), (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.isPickupEnabled, true)))
        .orderBy((0, drizzle_orm_1.sql) `${pickupAddresses_1.pickupAddresses.isPrimary} desc`, (0, drizzle_orm_1.sql) `${pickupAddresses_1.addresses.createdAt} desc`);
    return rows.map((row) => ({
        pickupId: row.pickupId,
        isPrimary: row.isPrimary,
        isPickupEnabled: row.isPickupEnabled,
        isRTOSame: row.isRTOSame,
        warehouseName: row.addressNickname || row.contactName || 'Warehouse',
        pickup: {
            warehouse_name: row.addressNickname || row.contactName || 'Warehouse',
            name: row.contactName || row.addressNickname || 'Warehouse',
            phone: row.contactPhone || '',
            email: row.contactEmail || '',
            address: [row.addressLine1, row.addressLine2, row.landmark]
                .map((part) => String(part || '').trim())
                .filter(Boolean)
                .join(', '),
            address_2: row.addressLine2 || '',
            city: row.city || '',
            state: row.state || '',
            country: row.country || 'India',
            pincode: row.pincode || '',
            gst_number: row.gstNumber || '',
        },
    }));
};
exports.getSellerWarehousesForAssistedBooking = getSellerWarehousesForAssistedBooking;
const createAssistedB2CShipmentForSeller = async ({ sellerId, adminUserId, payload, }) => {
    const shipmentPayload = {
        ...payload,
        order_number: String(payload.order_number || '').trim() || generateAssistedOrderNumber(),
        tags: mergeAssistedTags(payload.tags, adminUserId),
    };
    return (0, shiprocket_service_1.createB2CShipmentService)(shipmentPayload, sellerId, false);
};
exports.createAssistedB2CShipmentForSeller = createAssistedB2CShipmentForSeller;
const bookAssistedExistingB2COrderForSeller = async ({ sellerId, orderId, adminUserId, payload, }) => {
    const bookingPayload = {
        ...payload,
        tags: mergeAssistedTags(payload?.tags, adminUserId),
    };
    return (0, shiprocket_service_1.bookExistingB2COrderWithCourierService)(orderId, sellerId, bookingPayload);
};
exports.bookAssistedExistingB2COrderForSeller = bookAssistedExistingB2COrderForSeller;
const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const normalizeProducts = (rawProducts, fallbackAmount = 0) => {
    let productsData = [];
    if (Array.isArray(rawProducts)) {
        productsData = rawProducts;
    }
    else if (typeof rawProducts === 'string' && rawProducts.trim()) {
        try {
            const parsed = JSON.parse(rawProducts);
            productsData = Array.isArray(parsed) ? parsed : [];
        }
        catch {
            productsData = [];
        }
    }
    const products = productsData.map((p) => ({
        name: p?.name ?? p?.productName ?? p?.box_name ?? 'N/A',
        price: toNumber(p?.price),
        qty: Math.max(1, toNumber(p?.qty ?? p?.quantity, 1)),
        sku: p?.sku ?? p?.skuCode ?? '',
        hsn: p?.hsn ?? p?.hsnCode ?? '',
        discount: Math.max(0, toNumber(p?.discount)),
        tax_rate: Math.max(0, toNumber(p?.tax_rate ?? p?.taxRate)),
    }));
    if (products.length > 0)
        return products;
    return [
        {
            name: 'Product',
            price: toNumber(fallbackAmount),
            qty: 1,
            sku: '',
            hsn: '',
            discount: 0,
            tax_rate: 0,
        },
    ];
};
const regenerateOrderDocumentsServiceAdmin = async ({ orderId, regenerateLabel = true, regenerateInvoice = true, expectedUserId, }) => {
    if (!regenerateLabel && !regenerateInvoice) {
        throw new Error('At least one document must be selected for regeneration');
    }
    const [b2cOrder] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId)).limit(1);
    const [b2bOrder] = b2cOrder
        ? [undefined]
        : await client_1.db.select().from(b2bOrders_1.b2b_orders).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, orderId)).limit(1);
    const order = b2cOrder || b2bOrder;
    if (!order)
        throw new Error('Order not found');
    const orderType = b2cOrder ? 'b2c' : 'b2b';
    const userId = order.user_id;
    if (!userId)
        throw new Error('Order user not found');
    if (expectedUserId && userId !== expectedUserId)
        throw new Error('Order not found');
    let newLabelKey = null;
    let newInvoiceKey = null;
    if (regenerateLabel) {
        const isAmazonOrder = String(order.integration_type || order.courier_partner || '')
            .toLowerCase()
            .includes('amazon');
        if (isAmazonOrder) {
            const labelKey = (0, orderLabels_1.getAmazonOrderLabelReference)(order);
            if (!labelKey || typeof labelKey !== 'string') {
                throw new Error('Amazon label regeneration failed because the provider label was not available');
            }
            newLabelKey = labelKey.trim();
        }
        else {
            const labelKey = await (0, generateCustomLabelService_1.generateLabelForOrder)(order, userId, client_1.db);
            if (!labelKey || typeof labelKey !== 'string') {
                throw new Error('Label regeneration failed');
            }
            newLabelKey = labelKey.trim();
        }
    }
    let generatedInvoiceData = null;
    if (regenerateInvoice) {
        const [prefs] = await client_1.db
            .select()
            .from(invoicePreferences_1.invoicePreferences)
            .where((0, drizzle_orm_1.eq)(invoicePreferences_1.invoicePreferences.userId, userId))
            .limit(1);
        const [profile] = await client_1.db.select().from(userProfile_1.userProfiles).where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId)).limit(1);
        const companyInfo = profile?.companyInfo || {};
        const gstDetails = profile?.gstDetails || {};
        const companyName = companyInfo.companyName || companyInfo.businessName || companyInfo.brandName || '';
        const companyGST = gstDetails.gstNumber || companyInfo.gstNumber || '';
        const invoiceNumber = await (0, invoiceNumber_service_1.resolveInvoiceNumber)({
            userId,
            existingInvoiceNumber: order?.invoice_number,
            prefix: prefs?.prefix ?? undefined,
            suffix: prefs?.suffix ?? undefined,
        });
        const invoiceDateDisplay = (0, dayjs_1.default)().format('DD MMM YYYY');
        const invoiceDateStored = (0, dayjs_1.default)().format('YYYY-MM-DD');
        const pickupDetails = (0, invoiceHelpers_1.normalizePickupDetails)(order.pickup_details);
        const pickupPincode = pickupDetails?.pincode;
        const serviceType = order.service_type || order.integration_type || order.courier_partner || '';
        const pickupAddress = (0, invoiceHelpers_1.formatPickupAddress)(pickupDetails);
        const sellerAddress = pickupAddress || companyInfo.companyAddress || companyInfo.address || '';
        const sellerStateCode = pickupDetails?.state || companyInfo.state || '';
        const sellerName = pickupDetails?.warehouse_name ||
            companyInfo.brandName ||
            companyInfo.companyName ||
            companyInfo.businessName ||
            'Seller';
        const brandName = companyInfo.brandName || companyInfo.companyName || pickupDetails?.warehouse_name || '';
        const gstNumber = companyGST || companyInfo.gstNumber || companyInfo.gst || '';
        const panNumber = companyInfo.panNumber || companyInfo.pan || '';
        const supportPhone = pickupDetails?.phone ||
            companyInfo.companyContactNumber ||
            companyInfo.contactNumber ||
            prefs?.supportPhone ||
            '';
        const supportEmail = companyInfo.contactEmail || companyInfo.companyEmail || prefs?.supportEmail || '';
        const products = normalizeProducts(order.products, toNumber(order.order_amount));
        const { logoBuffer, signatureBuffer } = await (0, invoiceHelpers_1.loadInvoiceAssets)({
            companyLogoKey: companyInfo.companyLogoUrl ?? undefined,
            includeSignature: prefs?.includeSignature,
            signatureFile: prefs?.signatureFile ?? undefined,
        }, order.order_number || String(order.id));
        const invoiceAmount = toNumber(order.order_amount) +
            toNumber(order.shipping_charges) +
            toNumber(order.gift_wrap) +
            toNumber(order.transaction_fee) -
            (toNumber(order.discount) + toNumber(order.prepaid_amount));
        generatedInvoiceData = {
            number: invoiceNumber,
            date: invoiceDateStored,
            amount: invoiceAmount,
        };
        const invoiceBuffer = await (0, invoice_service_1.generateInvoicePDF)({
            invoiceNumber,
            invoiceDate: invoiceDateDisplay,
            invoiceAmount,
            buyerName: order.buyer_name,
            buyerPhone: order.buyer_phone,
            buyerEmail: order.buyer_email ?? '',
            buyerAddress: order.address,
            buyerCity: order.city,
            buyerState: order.state,
            buyerPincode: order.pincode,
            products,
            shippingCharges: toNumber(order.shipping_charges),
            giftWrap: toNumber(order.gift_wrap),
            transactionFee: toNumber(order.transaction_fee),
            discount: toNumber(order.discount),
            prepaidAmount: toNumber(order.prepaid_amount),
            courierName: order.courier_partner ?? '',
            courierId: String(order.courier_id ?? ''),
            logoBuffer,
            orderType: order.order_type || 'prepaid',
            courierCod: order.order_type === 'cod' ? toNumber(order.cod_charges) : 0,
            signatureBuffer,
            companyName: sellerName,
            supportEmail,
            supportPhone,
            companyGST: gstNumber,
            sellerName,
            brandName,
            sellerAddress,
            sellerStateCode,
            gstNumber,
            panNumber,
            invoiceNotes: prefs?.invoiceNotes ?? '',
            termsAndConditions: prefs?.termsAndConditions ?? '',
            orderId: order.order_number,
            awbNumber: order.awb_number ?? '',
            courierPartner: order.courier_partner ?? '',
            serviceType,
            pickupPincode: pickupPincode ?? '',
            deliveryPincode: order.pincode ?? '',
            orderDate: order.order_date ?? '',
            rtoCharges: Number(order.rto_charges ?? 0),
            layout: (prefs?.template ?? 'classic'),
        });
        const { uploadUrl, key } = await (0, upload_service_1.presignUpload)({
            filename: `invoice-${order.id}.pdf`,
            contentType: 'application/pdf',
            userId,
            folderKey: 'invoices',
        });
        const finalUploadUrl = Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl;
        await axios_1.default.put(finalUploadUrl, invoiceBuffer, {
            headers: { 'Content-Type': 'application/pdf' },
            validateStatus: (status) => status >= 200 && status < 300,
            timeout: 60000,
        });
        const finalKey = Array.isArray(key) ? key[0] : key;
        if (!finalKey || typeof finalKey !== 'string') {
            throw new Error('Invoice upload key missing');
        }
        newInvoiceKey = finalKey.trim();
    }
    const updates = { updated_at: new Date() };
    if (newLabelKey)
        updates.label = newLabelKey;
    if (newInvoiceKey)
        updates.invoice_link = newInvoiceKey;
    if (newInvoiceKey && generatedInvoiceData) {
        updates.invoice_number = generatedInvoiceData.number;
        updates.invoice_date = generatedInvoiceData.date;
        updates.invoice_amount = generatedInvoiceData.amount;
    }
    if (orderType === 'b2c') {
        await client_1.db.update(b2cOrders_1.b2c_orders).set(updates).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId));
    }
    else {
        await client_1.db.update(b2bOrders_1.b2b_orders).set(updates).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, orderId));
    }
    return {
        orderId,
        orderType,
        label: newLabelKey,
        invoice_link: newInvoiceKey,
    };
};
exports.regenerateOrderDocumentsServiceAdmin = regenerateOrderDocumentsServiceAdmin;
const addManualNdrToOrderServiceAdmin = async ({ orderId, adminUserId, status = 'ndr', reason, remarks, attemptNo, }) => {
    const normalizedStatus = String(status || 'ndr').trim().toLowerCase();
    if (!normalizedStatus) {
        throw new Error('NDR status is required');
    }
    const [order] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId)).limit(1);
    if (!order) {
        throw new Error('B2C order not found');
    }
    const attemptValue = attemptNo !== undefined && attemptNo !== null && String(attemptNo).trim()
        ? String(attemptNo).trim()
        : '1';
    const auditRemarks = [remarks?.trim(), adminUserId ? `admin:${adminUserId}` : null]
        .filter(Boolean)
        .join(' | ');
    await client_1.db
        .update(b2cOrders_1.b2c_orders)
        .set({
        order_status: normalizedStatus,
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
    const event = await (0, ndr_service_1.recordNdrEvent)({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number || undefined,
        status: normalizedStatus,
        reason: reason?.trim() || 'Manual NDR added by admin',
        remarks: auditRemarks || 'Manual NDR added by admin',
        attemptNo: attemptValue,
        payload: {
            source: 'admin_manual',
            adminUserId: adminUserId || null,
            orderId: order.id,
        },
    });
    await (0, trackingEvents_service_1.logTrackingEvent)({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number || null,
        courier: order.courier_partner || order.integration_type || null,
        statusCode: normalizedStatus,
        statusText: reason?.trim() || 'Manual NDR added by admin',
        location: order.city || null,
        raw: {
            source: 'admin_manual_ndr',
            remarks: auditRemarks || null,
            adminUserId: adminUserId || null,
        },
    });
    await Promise.allSettled([
        (0, notifications_service_1.createNotificationService)({
            targetRole: 'user',
            userId: order.user_id,
            title: 'Order marked as NDR',
            message: `Order ${order.order_number} has been marked as ${normalizedStatus}.`,
        }),
        (0, notifications_service_1.createNotificationService)({
            targetRole: 'admin',
            title: 'Manual NDR added',
            message: `Order ${order.order_number} (${order.awb_number || order.id}) marked as ${normalizedStatus}.`,
        }),
    ]);
    return { order, event };
};
exports.addManualNdrToOrderServiceAdmin = addManualNdrToOrderServiceAdmin;
const updateOrderStatusServiceAdmin = async ({ orderId, adminUserId, status, reason, remarks, attemptNo, }) => {
    const normalizedStatus = String(status || '')
        .trim()
        .toLowerCase();
    if (!normalizedStatus) {
        throw new Error('Order status is required');
    }
    if (!ADMIN_UPDATABLE_ORDER_STATUSES.has(normalizedStatus)) {
        throw new Error('Unsupported order status');
    }
    const trimmedReason = String(reason || '').trim();
    const trimmedRemarks = String(remarks || '').trim();
    if (ADMIN_NDR_STATUSES.has(normalizedStatus) && !trimmedReason) {
        throw new Error('Reason is required for NDR and undelivered statuses');
    }
    const [b2cOrder] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId)).limit(1);
    const [b2bOrder] = b2cOrder
        ? [undefined]
        : await client_1.db.select().from(b2bOrders_1.b2b_orders).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, orderId)).limit(1);
    const order = b2cOrder || b2bOrder;
    if (!order) {
        throw new Error('Order not found');
    }
    const orderType = b2cOrder ? 'b2c' : 'b2b';
    const previousStatus = String(order.order_status || '').trim().toLowerCase();
    const auditRemarks = [trimmedRemarks || null, adminUserId ? `admin:${adminUserId}` : null]
        .filter(Boolean)
        .join(' | ');
    if (orderType === 'b2c') {
        await client_1.db
            .update(b2cOrders_1.b2c_orders)
            .set({
            order_status: normalizedStatus,
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
    }
    else {
        await client_1.db
            .update(b2bOrders_1.b2b_orders)
            .set({
            order_status: normalizedStatus,
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, order.id));
    }
    let ndrEvent = null;
    if (orderType === 'b2c' && ADMIN_NDR_STATUSES.has(normalizedStatus)) {
        const attemptValue = attemptNo !== undefined && attemptNo !== null && String(attemptNo).trim()
            ? String(attemptNo).trim()
            : '1';
        ndrEvent = await (0, ndr_service_1.recordNdrEvent)({
            orderId: order.id,
            userId: order.user_id,
            awbNumber: order.awb_number || undefined,
            status: normalizedStatus,
            reason: trimmedReason,
            remarks: auditRemarks || 'Manual status update by admin',
            attemptNo: attemptValue,
            payload: {
                source: 'admin_status_update',
                adminUserId: adminUserId || null,
                orderId: order.id,
                previousStatus: previousStatus || null,
            },
        });
    }
    await (0, trackingEvents_service_1.logTrackingEvent)({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number || null,
        courier: order.courier_partner || null,
        statusCode: normalizedStatus,
        statusText: trimmedReason ||
            `Order status changed by admin${previousStatus ? ` from ${previousStatus}` : ''}`,
        location: order.city || null,
        raw: {
            source: 'admin_manual_status_update',
            remarks: auditRemarks || null,
            adminUserId: adminUserId || null,
            previousStatus: previousStatus || null,
        },
    });
    const userMessage = trimmedReason
        ? `Order ${order.order_number} status updated to ${normalizedStatus}: ${trimmedReason}.`
        : `Order ${order.order_number} status updated to ${normalizedStatus}.`;
    const adminMessage = `${orderType.toUpperCase()} order ${order.order_number} (${order.awb_number || order.id}) status updated to ${normalizedStatus}.`;
    await Promise.allSettled([
        (0, notifications_service_1.createNotificationService)({
            targetRole: 'user',
            userId: order.user_id,
            title: 'Order status updated',
            message: userMessage,
        }),
        (0, notifications_service_1.createNotificationService)({
            targetRole: 'admin',
            title: 'Admin updated order status',
            message: adminMessage,
        }),
    ]);
    return {
        orderId: order.id,
        orderType,
        previousStatus: previousStatus || null,
        currentStatus: normalizedStatus,
        ndrEvent,
    };
};
exports.updateOrderStatusServiceAdmin = updateOrderStatusServiceAdmin;
