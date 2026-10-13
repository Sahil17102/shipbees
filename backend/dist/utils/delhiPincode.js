"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDelhiPincode = void 0;
const isDelhiPincode = (value) => /^110\d{3}$/.test(String(value ?? '').trim());
exports.isDelhiPincode = isDelhiPincode;
