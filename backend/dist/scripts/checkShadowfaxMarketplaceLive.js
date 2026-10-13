"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const pickupAddresses_1 = require("../models/schema/pickupAddresses");
const shadowfax_service_1 = require("../models/services/couriers/shadowfax.service");
const DESTINATION_CANDIDATES = [
    { pincode: '400001', name: 'Marketplace Smoke Customer', address: 'Fort', city: 'Mumbai', state: 'Maharashtra' },
    { pincode: '110001', name: 'Marketplace Smoke Customer', address: 'Connaught Place', city: 'New Delhi', state: 'Delhi' },
    { pincode: '560001', name: 'Marketplace Smoke Customer', address: 'MG Road', city: 'Bengaluru', state: 'Karnataka' },
    { pincode: '600001', name: 'Marketplace Smoke Customer', address: 'George Town', city: 'Chennai', state: 'Tamil Nadu' },
    { pincode: '700001', name: 'Marketplace Smoke Customer', address: 'BBD Bagh', city: 'Kolkata', state: 'West Bengal' },
    { pincode: '411001', name: 'Marketplace Smoke Customer', address: 'Camp', city: 'Pune', state: 'Maharashtra' },
    { pincode: '380001', name: 'Marketplace Smoke Customer', address: 'Ellis Bridge', city: 'Ahmedabad', state: 'Gujarat' },
    { pincode: '500001', name: 'Marketplace Smoke Customer', address: 'Abids', city: 'Hyderabad', state: 'Telangana' },
    { pincode: '302001', name: 'Marketplace Smoke Customer', address: 'MI Road', city: 'Jaipur', state: 'Rajasthan' },
    { pincode: '452001', name: 'Marketplace Smoke Customer', address: 'Palasia', city: 'Indore', state: 'Madhya Pradesh' },
];
const normalizeText = (value) => String(value ?? '').trim();
const toPhone = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits.padStart(10, '9');
};
const parseErrorMessage = (error) => normalizeText(error?.response?.data?.message ||
    error?.response?.data?.errors ||
    error?.response?.data?.error ||
    error?.message ||
    'Unknown Shadowfax error');
const loadPickupCandidates = async () => {
    const rows = await client_1.db
        .select({
        addressId: pickupAddresses_1.addresses.id,
        rtoAddressId: pickupAddresses_1.pickupAddresses.rtoAddressId,
        contactName: pickupAddresses_1.addresses.contactName,
        contactPhone: pickupAddresses_1.addresses.contactPhone,
        contactEmail: pickupAddresses_1.addresses.contactEmail,
        addressLine1: pickupAddresses_1.addresses.addressLine1,
        addressLine2: pickupAddresses_1.addresses.addressLine2,
        landmark: pickupAddresses_1.addresses.landmark,
        addressNickname: pickupAddresses_1.addresses.addressNickname,
        city: pickupAddresses_1.addresses.city,
        state: pickupAddresses_1.addresses.state,
        country: pickupAddresses_1.addresses.country,
        pincode: pickupAddresses_1.addresses.pincode,
        gstNumber: pickupAddresses_1.addresses.gstNumber,
        isPrimary: pickupAddresses_1.pickupAddresses.isPrimary,
    })
        .from(pickupAddresses_1.pickupAddresses)
        .innerJoin(pickupAddresses_1.addresses, (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.addressId, pickupAddresses_1.addresses.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.isPickupEnabled, true), (0, drizzle_orm_1.eq)(pickupAddresses_1.addresses.type, 'pickup')))
        .orderBy((0, drizzle_orm_1.desc)(pickupAddresses_1.pickupAddresses.isPrimary), (0, drizzle_orm_1.desc)(pickupAddresses_1.addresses.createdAt))
        .limit(50);
    return rows.map((row) => ({
        addressId: row.addressId,
        rtoAddressId: row.rtoAddressId ?? null,
        contactName: row.contactName,
        contactPhone: row.contactPhone,
        contactEmail: row.contactEmail ?? null,
        addressLine1: row.addressLine1,
        addressLine2: row.addressLine2 ?? null,
        landmark: row.landmark ?? null,
        addressNickname: row.addressNickname ?? null,
        city: row.city,
        state: row.state,
        country: row.country,
        pincode: row.pincode,
        gstNumber: row.gstNumber ?? null,
    }));
};
const loadAddressById = async (addressId) => {
    if (!addressId)
        return null;
    const [row] = await client_1.db
        .select({
        id: pickupAddresses_1.addresses.id,
        contactName: pickupAddresses_1.addresses.contactName,
        contactPhone: pickupAddresses_1.addresses.contactPhone,
        contactEmail: pickupAddresses_1.addresses.contactEmail,
        addressLine1: pickupAddresses_1.addresses.addressLine1,
        addressLine2: pickupAddresses_1.addresses.addressLine2,
        landmark: pickupAddresses_1.addresses.landmark,
        addressNickname: pickupAddresses_1.addresses.addressNickname,
        city: pickupAddresses_1.addresses.city,
        state: pickupAddresses_1.addresses.state,
        country: pickupAddresses_1.addresses.country,
        pincode: pickupAddresses_1.addresses.pincode,
        gstNumber: pickupAddresses_1.addresses.gstNumber,
    })
        .from(pickupAddresses_1.addresses)
        .where((0, drizzle_orm_1.eq)(pickupAddresses_1.addresses.id, addressId))
        .limit(1);
    return row || null;
};
const loadFallbackReturnAddress = async (originPincode) => {
    const [row] = await client_1.db
        .select({
        id: pickupAddresses_1.addresses.id,
        contactName: pickupAddresses_1.addresses.contactName,
        contactPhone: pickupAddresses_1.addresses.contactPhone,
        contactEmail: pickupAddresses_1.addresses.contactEmail,
        addressLine1: pickupAddresses_1.addresses.addressLine1,
        addressLine2: pickupAddresses_1.addresses.addressLine2,
        landmark: pickupAddresses_1.addresses.landmark,
        addressNickname: pickupAddresses_1.addresses.addressNickname,
        city: pickupAddresses_1.addresses.city,
        state: pickupAddresses_1.addresses.state,
        country: pickupAddresses_1.addresses.country,
        pincode: pickupAddresses_1.addresses.pincode,
        gstNumber: pickupAddresses_1.addresses.gstNumber,
    })
        .from(pickupAddresses_1.addresses)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pickupAddresses_1.addresses.type, 'rto'), (0, drizzle_orm_1.sql) `${pickupAddresses_1.addresses.pincode} <> ${originPincode}`))
        .orderBy((0, drizzle_orm_1.desc)(pickupAddresses_1.addresses.createdAt))
        .limit(1);
    return row || null;
};
const findMarketplaceRoute = async (shadowfax) => {
    const pickupCandidates = await loadPickupCandidates();
    (0, strict_1.default)(pickupCandidates.length > 0, 'No enabled pickup addresses were found in the VPS database.');
    const attempts = [];
    const fallbackRoutes = [];
    for (const origin of pickupCandidates) {
        const linkedReturnAddress = await loadAddressById(origin.rtoAddressId);
        const returnAddress = linkedReturnAddress && linkedReturnAddress.pincode !== origin.pincode
            ? linkedReturnAddress
            : (await loadFallbackReturnAddress(origin.pincode)) || linkedReturnAddress;
        for (const destination of DESTINATION_CANDIDATES) {
            const serviceability = await shadowfax.checkForwardServiceability({
                origin: origin.pincode,
                destination: destination.pincode,
                paymentType: 'prepaid',
                mode: 'marketplace',
                service: 'surface',
            });
            attempts.push({
                origin: origin.pincode,
                destination: destination.pincode,
                serviceable: serviceability.serviceable,
                mode: serviceability.mode || null,
                service: serviceability.service || null,
            });
            if (!serviceability.serviceable || serviceability.mode !== 'marketplace') {
                continue;
            }
            const hasDistinctReturnAddress = returnAddress &&
                returnAddress.pincode &&
                returnAddress.pincode !== origin.pincode;
            const candidateRoute = { origin, returnAddress, destination, serviceability };
            if (hasDistinctReturnAddress) {
                return candidateRoute;
            }
            fallbackRoutes.push(candidateRoute);
        }
    }
    if (fallbackRoutes.length) {
        return fallbackRoutes[0];
    }
    throw new Error(`No marketplace serviceable route found for the current pickup addresses. Attempts: ${JSON.stringify(attempts.slice(0, 12))}`);
};
const buildBookingPayload = async (route, orderNumber) => {
    const pickup = route.origin;
    const destination = route.destination;
    const serviceableService = route.serviceability.service || 'surface';
    const rtoAddress = route.returnAddress || (await loadAddressById(route.origin.rtoAddressId));
    const isRtoDifferent = Boolean(rtoAddress && rtoAddress.pincode !== pickup.pincode);
    return {
        order_number: orderNumber,
        order_date: new Date().toISOString(),
        order_amount: 499,
        payment_type: 'prepaid',
        package_weight: 500,
        package_length: 20,
        package_breadth: 15,
        package_height: 10,
        request_auto_pickup: 'no',
        is_insurance: 0,
        is_rto_different: isRtoDifferent ? 'yes' : 'no',
        shadowfax_forward_mode: 'marketplace',
        shadowfax_service_mode: serviceableService,
        tags: 'shadowfax_mode=marketplace',
        company: {
            name: pickup.contactName || 'Shipray',
            gst: pickup.gstNumber || '',
        },
        pickup_location_id: pickup.addressId,
        pickup_location_alias: pickup.addressNickname || pickup.addressId,
        pickup: {
            warehouse_name: pickup.addressNickname || pickup.contactName,
            name: pickup.contactName,
            address: pickup.addressLine1,
            address_2: pickup.addressLine2 || undefined,
            city: pickup.city,
            state: pickup.state,
            pincode: pickup.pincode,
            phone: toPhone(pickup.contactPhone),
            gst_number: pickup.gstNumber || undefined,
        },
        consignee: {
            name: destination.name,
            address: destination.address,
            city: destination.city,
            state: destination.state,
            pincode: destination.pincode,
            phone: '9999999999',
            email: 'smoke-test@shipray.com',
        },
        rto: rtoAddress
            ? {
                warehouse_name: rtoAddress.addressNickname || rtoAddress.contactName || pickup.contactName,
                name: rtoAddress.contactName || pickup.contactName,
                address: rtoAddress.addressLine1 || pickup.addressLine1,
                address_2: rtoAddress.addressLine2 || pickup.addressLine2 || undefined,
                city: rtoAddress.city || pickup.city,
                state: rtoAddress.state || pickup.state,
                pincode: rtoAddress.pincode || pickup.pincode,
                phone: toPhone(rtoAddress.contactPhone || pickup.contactPhone),
            }
            : {
                warehouse_name: pickup.addressNickname || pickup.contactName,
                name: pickup.contactName,
                address: pickup.addressLine1,
                address_2: pickup.addressLine2 || undefined,
                city: pickup.city,
                state: pickup.state,
                pincode: pickup.pincode,
                phone: toPhone(pickup.contactPhone),
            },
        return_location_alias: rtoAddress?.addressNickname || rtoAddress?.id || pickup.addressId,
        order_items: [
            {
                name: 'Marketplace Smoke Item',
                sku: 'SFX-MP-SMOKE-1',
                qty: 1,
                price: 499,
                hsn: '620520',
                discount: 0,
                tax_rate: 0,
            },
        ],
    };
};
const main = async () => {
    const shadowfax = new shadowfax_service_1.ShadowfaxService();
    const route = await findMarketplaceRoute(shadowfax);
    const orderNumber = `SFX_LIVE_MP_${Date.now()}`;
    const bookingPayload = await buildBookingPayload(route, orderNumber);
    const generatedAwb = await shadowfax.generateForwardAwb(1);
    const preallocatedAwb = generatedAwb?.data?.awb_numbers?.[0] ||
        generatedAwb?.awb_numbers?.[0] ||
        generatedAwb?.awb_number ||
        null;
    const booking = await shadowfax.createForwardShipment(bookingPayload, {
        mode: 'marketplace',
        service: route.serviceability.service || 'surface',
    });
    const bookingMode = 'marketplace';
    const bookingService = route.serviceability.service || 'surface';
    const forwardData = booking?.shipment?.data || booking?.shipment || booking?.data || booking;
    const awbNumber = booking?.awb_number ||
        booking?.awb ||
        booking?.data?.awb_number ||
        booking?.data?.awb ||
        forwardData?.awb_number ||
        forwardData?.awb ||
        null;
    (0, strict_1.default)(awbNumber, 'Shadowfax did not return a marketplace AWB.');
    const tracking = await shadowfax.trackShipment(String(awbNumber));
    const bulkTracking = await shadowfax.bulkTrackShipments([String(awbNumber)]);
    let pod = null;
    let podError = null;
    let qr = null;
    let qrError = null;
    let escalation = null;
    let escalationError = null;
    try {
        pod = await shadowfax.getPodDetails([String(awbNumber)]);
    }
    catch (error) {
        podError = parseErrorMessage(error);
    }
    try {
        qr = await shadowfax.generateQrCode({
            awb_number: String(awbNumber),
            client_request_id: orderNumber,
            client_order_id: orderNumber,
            amount: bookingPayload.order_amount,
        });
    }
    catch (error) {
        qrError = parseErrorMessage(error);
    }
    try {
        escalation = await shadowfax.createEscalation({
            awb_number: String(awbNumber),
            issue_category: 1,
        });
    }
    catch (error) {
        escalationError = parseErrorMessage(error);
    }
    const updatePayload = {
        awb_number: String(awbNumber),
        client_order_id: orderNumber,
        action: 'RE-ATTEMPT',
        request_type: 're-attempt',
        next_attempt_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    };
    let updateForwardOrderResponse = null;
    let updateForwardOrderError = null;
    let cancelResponse = null;
    let cancelError = null;
    try {
        try {
            updateForwardOrderResponse = await shadowfax.updateForwardOrder(updatePayload);
        }
        catch (error) {
            updateForwardOrderError = parseErrorMessage(error);
        }
    }
    finally {
        try {
            cancelResponse = await shadowfax.cancelShipment(String(awbNumber));
        }
        catch (error) {
            cancelError = parseErrorMessage(error);
        }
    }
    const summary = {
        marketplaceRoute: {
            originPincode: route.origin.pincode,
            destinationPincode: route.destination.pincode,
            mode: route.serviceability.mode,
            service: route.serviceability.service,
            services: route.serviceability.services,
        },
        preallocatedAwb,
        booking: {
            mode: bookingMode,
            service: bookingService,
            awb: awbNumber,
            providerReference: booking?.shipment?.data?.id ||
                booking?.shipment?.data?.client_order_id ||
                booking?.shipment?.id ||
                booking?.data?.id ||
                forwardData?.id ||
                forwardData?.client_order_id ||
                null,
        },
        tracking: tracking?.data || tracking,
        bulkTracking: bulkTracking?.data || bulkTracking,
        pod: pod?.data || pod,
        podError,
        qr: qr?.data || qr,
        qrError,
        escalation: escalation?.data || escalation,
        escalationError,
        updateForwardOrder: updateForwardOrderResponse,
        updateForwardOrderError,
        cancelShipment: cancelResponse,
        cancelError,
    };
    console.log('Shadowfax marketplace live smoke passed');
    console.log(JSON.stringify(summary, null, 2));
};
main().catch((error) => {
    console.error('Shadowfax marketplace live smoke failed');
    console.error(parseErrorMessage(error) || error);
    process.exit(1);
});
