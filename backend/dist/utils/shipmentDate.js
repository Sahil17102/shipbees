"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeShipmentDateInput = exports.parseShipmentDate = void 0;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LEGACY_DATE_PATTERN = /^(\d{2})[-/](\d{2})[-/](\d{4})$/;
const isExactUtcDate = (year, month, day) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return (date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day);
};
const parseDateParts = (value) => {
    const isoMatch = value.match(DATE_ONLY_PATTERN);
    if (isoMatch) {
        const [, year, month, day] = isoMatch.map(Number);
        return isExactUtcDate(year, month, day) ? { year, month, day } : null;
    }
    const legacyMatch = value.match(LEGACY_DATE_PATTERN);
    if (legacyMatch) {
        const [, day, month, year] = legacyMatch.map(Number);
        return isExactUtcDate(year, month, day) ? { year, month, day } : null;
    }
    return null;
};
const dateFromParts = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day));
const validDateOrNull = (value) => {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    const raw = String(value ?? '').trim();
    if (!raw)
        return null;
    const dateOnly = raw.slice(0, 10);
    const parts = parseDateParts(dateOnly);
    if (parts)
        return dateFromParts(parts);
    if (DATE_ONLY_PATTERN.test(dateOnly) || LEGACY_DATE_PATTERN.test(dateOnly))
        return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const parseShipmentDate = (value, fallback = new Date()) => validDateOrNull(value) ?? validDateOrNull(fallback) ?? new Date();
exports.parseShipmentDate = parseShipmentDate;
const normalizeShipmentDateInput = (value, fallback = new Date()) => (0, exports.parseShipmentDate)(value, fallback).toISOString().slice(0, 10);
exports.normalizeShipmentDateInput = normalizeShipmentDateInput;
