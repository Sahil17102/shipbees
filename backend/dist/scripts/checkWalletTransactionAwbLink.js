"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const walletTransactionOrderLink_1 = require("../utils/walletTransactionOrderLink");
const shipmentLookup = (0, walletTransactionOrderLink_1.getWalletTransactionOrderLookup)({
    type: 'debit',
    reason: 'B2C COD Service Charges',
    ref: '123e4567-e89b-12d3-a456-426614174000',
    meta: {
        awb_number: 'AWB123456789',
        order_number: 'ORD-1001',
        shipment_id: 'SHIP-1001',
        courier_name: 'DeliveryOne',
    },
});
strict_1.default.equal(shipmentLookup.isShipmentOrderTransaction, true);
strict_1.default.deepEqual(shipmentLookup.awbNumbers, ['AWB123456789']);
strict_1.default.deepEqual(shipmentLookup.orderNumbers, ['ORD-1001']);
strict_1.default.deepEqual(shipmentLookup.shipmentIds, ['SHIP-1001']);
const topupLookup = (0, walletTransactionOrderLink_1.getWalletTransactionOrderLookup)({
    type: 'credit',
    reason: 'Wallet Recharge',
    ref: 'pay_test_123',
    meta: {
        orderId: 'order_gateway_123',
        gateway: 'razorpay',
    },
});
strict_1.default.equal(topupLookup.isShipmentOrderTransaction, false);
strict_1.default.deepEqual(topupLookup.awbNumbers, []);
strict_1.default.deepEqual(topupLookup.orderIds, []);
const adminWalletSource = node_fs_1.default.readFileSync(node_path_1.default.resolve(process.cwd(), '../admin-dashboard/src/views/Wallets/AdminWallets.jsx'), 'utf8');
strict_1.default.equal(adminWalletSource.includes('<Th>AWB</Th>'), true);
strict_1.default.equal(adminWalletSource.includes('OrderDetailsModal'), true);
strict_1.default.equal(adminWalletSource.includes('renderTransactionAwb(txn)'), true);
console.log('Wallet transaction AWB proof');
console.log(`- shipment transaction AWB: ${shipmentLookup.awbNumbers[0]}`);
console.log(`- shipment transaction order number: ${shipmentLookup.orderNumbers[0]}`);
console.log('- wallet recharge stays unlinked: true');
console.log('- admin wallet table has clickable AWB/order-details wiring: true');
