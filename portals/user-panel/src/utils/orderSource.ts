const trimLower = (value: unknown) => String(value ?? '').trim().toLowerCase()

export const getOrderSourceKey = (order: any) => {
  const explicitSource = trimLower(order.source)
  if (explicitSource === 'shopify' || explicitSource === 'woocommerce' || explicitSource === 'api') {
    return explicitSource
  }

  const integrationType = trimLower(order.integration_type)
  if (integrationType === 'shopify' || integrationType === 'woocommerce') {
    return integrationType
  }

  if (order.is_external_api) {
    return 'api'
  }

  return 'manual'
}

export const getOrderSourceLabel = (order: any) => {
  const source = getOrderSourceKey(order)
  if (source === 'shopify') return 'Shopify'
  if (source === 'woocommerce') return 'WooCommerce'
  if (source === 'api') return 'API'
  return 'Manual'
}

export const getOrderSourceChipStatus = (order: any) => {
  const source = getOrderSourceKey(order)
  if (source === 'manual') return 'success' as const
  if (source === 'api') return 'pending' as const
  return 'info' as const
}

export const getOrderCourierDisplayName = (order: any) => {
  const courier = String(order.courier_partner ?? '').trim()
  if (!courier) return ''

  // ICL is the booking platform; Federal Express is the actual courier.
  // Keep legacy ICL orders readable after the actual courier started being persisted.
  if (trimLower(order.integration_type) === 'icl' && trimLower(courier).includes('icl')) {
    return 'Federal Express'
  }

  const source = getOrderSourceKey(order)
  if ((source === 'shopify' || source === 'woocommerce') && trimLower(courier) === source) {
    return ''
  }

  return courier
}
