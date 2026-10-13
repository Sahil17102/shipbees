"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const shipmentDate_1 = require("../utils/shipmentDate");
const fallback = new Date('2026-01-15T00:00:00.000Z');
strict_1.default.equal((0, shipmentDate_1.normalizeShipmentDateInput)('25-09-2026', fallback), '2026-09-25');
strict_1.default.equal((0, shipmentDate_1.normalizeShipmentDateInput)('25/09/2026', fallback), '2026-09-25');
strict_1.default.equal((0, shipmentDate_1.normalizeShipmentDateInput)('2026-09-25', fallback), '2026-09-25');
strict_1.default.equal((0, shipmentDate_1.normalizeShipmentDateInput)('2026-09-25T14:30:00.000Z', fallback), '2026-09-25');
strict_1.default.equal((0, shipmentDate_1.normalizeShipmentDateInput)('31-02-2026', fallback), '2026-01-15');
strict_1.default.equal((0, shipmentDate_1.normalizeShipmentDateInput)('2026-02-31', fallback), '2026-01-15');
strict_1.default.equal((0, shipmentDate_1.normalizeShipmentDateInput)('', fallback), '2026-01-15');
strict_1.default.equal((0, shipmentDate_1.parseShipmentDate)('25-09-2026', fallback).toISOString(), '2026-09-25T00:00:00.000Z');
strict_1.default.equal(Number.isNaN((0, shipmentDate_1.parseShipmentDate)('not-a-date', fallback).getTime()), false);
console.log('Shipment date normalization checks passed.');
