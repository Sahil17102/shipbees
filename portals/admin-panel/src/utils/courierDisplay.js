const normalized = (value) => String(value || '').trim().toLowerCase()

export const getAdminCourierDisplay = (order = {}) => {
  const isIcl = normalized(order.integration_type) === 'icl'
  const storedCourier = String(order.courier_partner || '').trim()
  const courierName = isIcl && normalized(storedCourier).includes('icl')
    ? 'Federal Express'
    : storedCourier

  return {
    courierName,
    bookingProvider: isIcl ? 'ICL International' : '',
  }
}
