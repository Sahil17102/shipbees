"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adminOrderExportCsv_1 = require("../utils/adminOrderExportCsv");
const csv_1 = require("../utils/csv");
const repoRoot = (0, node_path_1.resolve)(__dirname, '../../..');
const clientCsvPath = (0, node_path_1.join)(repoRoot, 'courier-cart-client/src/utils/orderCsvExport.ts');
const b2cListPath = (0, node_path_1.join)(repoRoot, 'courier-cart-client/src/components/orders/b2c/B2COrdersList.tsx');
const clientCsvSource = (0, node_fs_1.readFileSync)(clientCsvPath, 'utf8');
const b2cListSource = (0, node_fs_1.readFileSync)(b2cListPath, 'utf8');
const requiredAdminColumns = [
    'Seller Name',
    'Pickup Date',
    'Delivery Date / Last Status',
    'Charged Weight (kg)',
];
const requiredClientColumns = [
    'Seller Name',
    'AWB Number',
    'Pickup Date',
    'Delivery Date / Last Status',
    'Charged Weight (kg)',
    'Last Updated',
];
const requiredActionLabels = [
    'View Details',
    'Generate Manifest',
    'Generate Label',
    'Generate Invoice',
    'Track Shipment',
    'Sync Live Status',
];
const missingAdminColumns = requiredAdminColumns.filter((column) => !adminOrderExportCsv_1.ADMIN_ORDER_EXPORT_HEADERS.includes(column));
const missingClientColumns = requiredClientColumns.filter((column) => !clientCsvSource.includes(`'${column}'`));
const missingActionLabels = requiredActionLabels.filter((label) => !b2cListSource.includes(label));
if (missingAdminColumns.length || missingClientColumns.length || missingActionLabels.length) {
    throw new Error([
        missingAdminColumns.length ? `Missing admin CSV columns: ${missingAdminColumns.join(', ')}` : '',
        missingClientColumns.length ? `Missing client CSV columns: ${missingClientColumns.join(', ')}` : '',
        missingActionLabels.length ? `Missing B2C action labels: ${missingActionLabels.join(', ')}` : '',
    ]
        .filter(Boolean)
        .join('\n'));
}
const sampleCsv = (0, csv_1.buildCsv)(adminOrderExportCsv_1.ADMIN_ORDER_EXPORT_HEADERS, [
    (0, adminOrderExportCsv_1.toAdminOrderExportRow)({
        order_id: 'ORD-1001',
        merchantName: 'Demo Seller',
        awb_number: 'AWB123456789',
        buyer_name: 'Demo Customer',
        buyer_phone: '9999999999',
        buyer_email: 'buyer@example.com',
        order_status: 'delivered',
        order_type: 'prepaid',
        order_amount: 1299,
        courier_partner: 'Xpressbees',
        order_date: '2026-05-26',
        pickup_details: { final_pickup_date: '2026-05-26' },
        delivered_at: '2026-05-27T10:30:00.000Z',
        charged_weight: 0.75,
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        address: 'Connaught Place',
    }),
]);
console.log('Order export and B2C actions proof');
console.log(`- admin previous last column: Address`);
console.log(`- admin added columns: ${requiredAdminColumns.join(', ')}`);
console.log(`- client previous last column: Created At`);
console.log(`- client new last column: Last Updated`);
console.log(`- B2C action menu labels: ${requiredActionLabels.join(', ')}`);
console.log(`- sample admin CSV header: ${sampleCsv.split('\n')[0].replace(/^\uFEFF/, '')}`);
