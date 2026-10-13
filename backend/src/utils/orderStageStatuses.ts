export const SHIPMENT_STAGE_STATUSES: Record<string, string[]> = {
  pending: ['pending', 'new', 'draft'],
  booked: ['booked', 'shipment_created'],
  pickup_initiated: ['pickup_initiated', 'picked_up', 'pickup_scheduled', 'manifested'],
  manifest_failed: ['manifest_failed'],
  in_transit: ['in_transit'],
  out_for_delivery: ['out_for_delivery'],
  delivered: ['delivered', 'ndr_delivered'],
  ndr: ['ndr', 'undelivered'],
  rto_in_transit: ['rto', 'rto_in_transit'],
  rto_delivered: ['rto_delivered'],
  cancelled: ['cancelled', 'cancellation_requested'],
}

const normalizeStatus = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

export const expandOrderStatusFilter = (status?: string | string[]): string[] => {
  const requested = (Array.isArray(status) ? status : String(status || '').split(','))
    .map(normalizeStatus)
    .filter(Boolean)

  return Array.from(
    new Set(requested.flatMap((value) => SHIPMENT_STAGE_STATUSES[value] || [value])),
  )
}

export const buildOrderStatusCounts = (
  rows: Array<{ status: string | null; count: number | string }>,
  all: number,
) => {
  const counts: Record<string, number> = { all }
  rows.forEach((row) => {
    const status = normalizeStatus(row.status)
    if (status) counts[status] = Number(row.count || 0)
  })
  return counts
}
