import assert from 'node:assert/strict'
import { normalizeShipmentDateInput, parseShipmentDate } from '../utils/shipmentDate'

const fallback = new Date('2026-01-15T00:00:00.000Z')

assert.equal(normalizeShipmentDateInput('25-09-2026', fallback), '2026-09-25')
assert.equal(normalizeShipmentDateInput('25/09/2026', fallback), '2026-09-25')
assert.equal(normalizeShipmentDateInput('2026-09-25', fallback), '2026-09-25')
assert.equal(normalizeShipmentDateInput('2026-09-25T14:30:00.000Z', fallback), '2026-09-25')
assert.equal(normalizeShipmentDateInput('31-02-2026', fallback), '2026-01-15')
assert.equal(normalizeShipmentDateInput('2026-02-31', fallback), '2026-01-15')
assert.equal(normalizeShipmentDateInput('', fallback), '2026-01-15')
assert.equal(parseShipmentDate('25-09-2026', fallback).toISOString(), '2026-09-25T00:00:00.000Z')
assert.equal(Number.isNaN(parseShipmentDate('not-a-date', fallback).getTime()), false)

console.log('Shipment date normalization checks passed.')
