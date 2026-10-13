import { roundCurrency } from './gst'

export type CodRemittanceAmountsInput = {
  codAmount: unknown
  codCharges?: unknown
  freightCharges?: unknown
}

/**
 * Booking charges are debited from the seller wallet and must not be deducted
 * again from the COD amount collected from the buyer.
 */
export const calculateCodRemittanceAmounts = ({
  codAmount,
}: CodRemittanceAmountsInput) => {
  const normalizedCodAmount = Number(codAmount)

  if (!Number.isFinite(normalizedCodAmount) || normalizedCodAmount < 0) {
    throw new Error('COD amount must be a non-negative number')
  }

  return {
    deductions: 0,
    remittableAmount: roundCurrency(normalizedCodAmount),
  }
}
