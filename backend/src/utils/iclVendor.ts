const ICL_VENDOR_NAMES: Record<string, string> = {
  FDX: 'Federal Express',
  FEDEX: 'Federal Express',
  FEDERAL: 'Federal Express',
  'FEDERAL EXPRESS': 'Federal Express',
  'FEDERAL EXPRESS CORPORATION': 'Federal Express',
}

export const getIclVendorCode = () => String(process.env.ICL_VENDOR_NAME || 'FDX').trim()

export const getIclVendorDisplayName = (vendorCode = getIclVendorCode()) => {
  const normalized = String(vendorCode || '').trim().toUpperCase()
  return ICL_VENDOR_NAMES[normalized] || String(vendorCode || 'ICL International').trim()
}
