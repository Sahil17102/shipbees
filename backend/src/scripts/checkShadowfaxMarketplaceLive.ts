import assert from 'node:assert/strict'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../models/client'
import { addresses, pickupAddresses } from '../models/schema/pickupAddresses'
import { ShadowfaxService } from '../models/services/couriers/shadowfax.service'

type PickupCandidate = {
  addressId: string
  rtoAddressId: string | null
  contactName: string
  contactPhone: string
  contactEmail: string | null
  addressLine1: string
  addressLine2: string | null
  landmark: string | null
  addressNickname: string | null
  city: string
  state: string
  country: string
  pincode: string
  gstNumber: string | null
}

type AddressCandidate = {
  id: string
  contactName: string
  contactPhone: string
  contactEmail: string | null
  addressLine1: string
  addressLine2: string | null
  landmark: string | null
  addressNickname: string | null
  city: string
  state: string
  country: string
  pincode: string
  gstNumber: string | null
}

type DestinationCandidate = {
  pincode: string
  name: string
  address: string
  city: string
  state: string
}

type SelectedRoute = {
  origin: PickupCandidate
  returnAddress: AddressCandidate | null
  destination: DestinationCandidate
  serviceability: Awaited<ReturnType<ShadowfaxService['checkForwardServiceability']>>
}

const DESTINATION_CANDIDATES: DestinationCandidate[] = [
  { pincode: '400001', name: 'Marketplace Smoke Customer', address: 'Fort', city: 'Mumbai', state: 'Maharashtra' },
  { pincode: '110001', name: 'Marketplace Smoke Customer', address: 'Connaught Place', city: 'New Delhi', state: 'Delhi' },
  { pincode: '560001', name: 'Marketplace Smoke Customer', address: 'MG Road', city: 'Bengaluru', state: 'Karnataka' },
  { pincode: '600001', name: 'Marketplace Smoke Customer', address: 'George Town', city: 'Chennai', state: 'Tamil Nadu' },
  { pincode: '700001', name: 'Marketplace Smoke Customer', address: 'BBD Bagh', city: 'Kolkata', state: 'West Bengal' },
  { pincode: '411001', name: 'Marketplace Smoke Customer', address: 'Camp', city: 'Pune', state: 'Maharashtra' },
  { pincode: '380001', name: 'Marketplace Smoke Customer', address: 'Ellis Bridge', city: 'Ahmedabad', state: 'Gujarat' },
  { pincode: '500001', name: 'Marketplace Smoke Customer', address: 'Abids', city: 'Hyderabad', state: 'Telangana' },
  { pincode: '302001', name: 'Marketplace Smoke Customer', address: 'MI Road', city: 'Jaipur', state: 'Rajasthan' },
  { pincode: '452001', name: 'Marketplace Smoke Customer', address: 'Palasia', city: 'Indore', state: 'Madhya Pradesh' },
]

const normalizeText = (value: unknown) => String(value ?? '').trim()

const toPhone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits.padStart(10, '9')
}

const parseErrorMessage = (error: any) =>
  normalizeText(
    error?.response?.data?.message ||
      error?.response?.data?.errors ||
      error?.response?.data?.error ||
      error?.message ||
      'Unknown Shadowfax error',
  )

const loadPickupCandidates = async (): Promise<PickupCandidate[]> => {
  const rows = await db
    .select({
      addressId: addresses.id,
      rtoAddressId: pickupAddresses.rtoAddressId,
      contactName: addresses.contactName,
      contactPhone: addresses.contactPhone,
      contactEmail: addresses.contactEmail,
      addressLine1: addresses.addressLine1,
      addressLine2: addresses.addressLine2,
      landmark: addresses.landmark,
      addressNickname: addresses.addressNickname,
      city: addresses.city,
      state: addresses.state,
      country: addresses.country,
      pincode: addresses.pincode,
      gstNumber: addresses.gstNumber,
      isPrimary: pickupAddresses.isPrimary,
    })
    .from(pickupAddresses)
    .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
    .where(and(eq(pickupAddresses.isPickupEnabled, true), eq(addresses.type, 'pickup')))
    .orderBy(desc(pickupAddresses.isPrimary), desc(addresses.createdAt))
    .limit(50)

  return rows.map((row) => ({
    addressId: row.addressId,
    rtoAddressId: row.rtoAddressId ?? null,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail ?? null,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2 ?? null,
    landmark: row.landmark ?? null,
    addressNickname: row.addressNickname ?? null,
    city: row.city,
    state: row.state,
    country: row.country,
    pincode: row.pincode,
    gstNumber: row.gstNumber ?? null,
  }))
}

const loadAddressById = async (addressId: string | null): Promise<AddressCandidate | null> => {
  if (!addressId) return null
  const [row] = await db
    .select({
      id: addresses.id,
      contactName: addresses.contactName,
      contactPhone: addresses.contactPhone,
      contactEmail: addresses.contactEmail,
      addressLine1: addresses.addressLine1,
      addressLine2: addresses.addressLine2,
      landmark: addresses.landmark,
      addressNickname: addresses.addressNickname,
      city: addresses.city,
      state: addresses.state,
      country: addresses.country,
      pincode: addresses.pincode,
      gstNumber: addresses.gstNumber,
    })
    .from(addresses)
    .where(eq(addresses.id, addressId))
    .limit(1)
  return row || null
}

const loadFallbackReturnAddress = async (originPincode: string): Promise<AddressCandidate | null> => {
  const [row] = await db
    .select({
      id: addresses.id,
      contactName: addresses.contactName,
      contactPhone: addresses.contactPhone,
      contactEmail: addresses.contactEmail,
      addressLine1: addresses.addressLine1,
      addressLine2: addresses.addressLine2,
      landmark: addresses.landmark,
      addressNickname: addresses.addressNickname,
      city: addresses.city,
      state: addresses.state,
      country: addresses.country,
      pincode: addresses.pincode,
      gstNumber: addresses.gstNumber,
    })
    .from(addresses)
    .where(and(eq(addresses.type, 'rto'), sql`${addresses.pincode} <> ${originPincode}`))
    .orderBy(desc(addresses.createdAt))
    .limit(1)
  return row || null
}

const findMarketplaceRoute = async (shadowfax: ShadowfaxService): Promise<SelectedRoute> => {
  const pickupCandidates = await loadPickupCandidates()
  assert(pickupCandidates.length > 0, 'No enabled pickup addresses were found in the VPS database.')

  const attempts: Array<{
    origin: string
    destination: string
    serviceable: boolean
    mode?: string | null
    service?: string | null
  }> = []

  const fallbackRoutes: SelectedRoute[] = []

  for (const origin of pickupCandidates) {
    const linkedReturnAddress = await loadAddressById(origin.rtoAddressId)
    const returnAddress =
      linkedReturnAddress && linkedReturnAddress.pincode !== origin.pincode
        ? linkedReturnAddress
        : (await loadFallbackReturnAddress(origin.pincode)) || linkedReturnAddress
    for (const destination of DESTINATION_CANDIDATES) {
      const serviceability = await shadowfax.checkForwardServiceability({
        origin: origin.pincode,
        destination: destination.pincode,
        paymentType: 'prepaid',
        mode: 'marketplace',
        service: 'surface',
      })

      attempts.push({
        origin: origin.pincode,
        destination: destination.pincode,
        serviceable: serviceability.serviceable,
        mode: serviceability.mode || null,
        service: serviceability.service || null,
      })

      if (!serviceability.serviceable || serviceability.mode !== 'marketplace') {
        continue
      }

      const hasDistinctReturnAddress =
        returnAddress &&
        returnAddress.pincode &&
        returnAddress.pincode !== origin.pincode

      const candidateRoute = { origin, returnAddress, destination, serviceability }
      if (hasDistinctReturnAddress) {
        return candidateRoute
      }

      fallbackRoutes.push(candidateRoute)
    }
  }

  if (fallbackRoutes.length) {
    return fallbackRoutes[0]
  }

  throw new Error(
    `No marketplace serviceable route found for the current pickup addresses. Attempts: ${JSON.stringify(
      attempts.slice(0, 12),
    )}`,
  )
}

const buildBookingPayload = async (route: SelectedRoute, orderNumber: string) => {
  const pickup = route.origin
  const destination = route.destination
  const serviceableService = route.serviceability.service || 'surface'
  const rtoAddress = route.returnAddress || (await loadAddressById(route.origin.rtoAddressId))
  const isRtoDifferent = Boolean(rtoAddress && rtoAddress.pincode !== pickup.pincode)

  return {
    order_number: orderNumber,
    order_date: new Date().toISOString(),
    order_amount: 499,
    payment_type: 'prepaid',
    package_weight: 500,
    package_length: 20,
    package_breadth: 15,
    package_height: 10,
    request_auto_pickup: 'no',
    is_insurance: 0,
    is_rto_different: isRtoDifferent ? 'yes' : 'no',
    shadowfax_forward_mode: 'marketplace',
    shadowfax_service_mode: serviceableService,
    tags: 'shadowfax_mode=marketplace',
    company: {
      name: pickup.contactName || 'Shipray',
      gst: pickup.gstNumber || '',
    },
    pickup_location_id: pickup.addressId,
    pickup_location_alias: pickup.addressNickname || pickup.addressId,
    pickup: {
      warehouse_name: pickup.addressNickname || pickup.contactName,
      name: pickup.contactName,
      address: pickup.addressLine1,
      address_2: pickup.addressLine2 || undefined,
      city: pickup.city,
      state: pickup.state,
      pincode: pickup.pincode,
      phone: toPhone(pickup.contactPhone),
      gst_number: pickup.gstNumber || undefined,
    },
    consignee: {
      name: destination.name,
      address: destination.address,
      city: destination.city,
      state: destination.state,
      pincode: destination.pincode,
      phone: '9999999999',
      email: 'smoke-test@shipray.com',
    },
    rto: rtoAddress
      ? {
          warehouse_name: rtoAddress.addressNickname || rtoAddress.contactName || pickup.contactName,
          name: rtoAddress.contactName || pickup.contactName,
          address: rtoAddress.addressLine1 || pickup.addressLine1,
          address_2: rtoAddress.addressLine2 || pickup.addressLine2 || undefined,
          city: rtoAddress.city || pickup.city,
          state: rtoAddress.state || pickup.state,
          pincode: rtoAddress.pincode || pickup.pincode,
          phone: toPhone(rtoAddress.contactPhone || pickup.contactPhone),
        }
      : {
          warehouse_name: pickup.addressNickname || pickup.contactName,
          name: pickup.contactName,
          address: pickup.addressLine1,
          address_2: pickup.addressLine2 || undefined,
          city: pickup.city,
          state: pickup.state,
          pincode: pickup.pincode,
          phone: toPhone(pickup.contactPhone),
        },
    return_location_alias: rtoAddress?.addressNickname || rtoAddress?.id || pickup.addressId,
    order_items: [
      {
        name: 'Marketplace Smoke Item',
        sku: 'SFX-MP-SMOKE-1',
        qty: 1,
        price: 499,
        hsn: '620520',
        discount: 0,
        tax_rate: 0,
      },
    ],
  }
}

const main = async () => {
  const shadowfax = new ShadowfaxService()
  const route = await findMarketplaceRoute(shadowfax)
  const orderNumber = `SFX_LIVE_MP_${Date.now()}`
  const bookingPayload = await buildBookingPayload(route, orderNumber)

  const generatedAwb = await shadowfax.generateForwardAwb(1)
  const preallocatedAwb =
    generatedAwb?.data?.awb_numbers?.[0] ||
    generatedAwb?.awb_numbers?.[0] ||
    generatedAwb?.awb_number ||
    null

  const booking = await shadowfax.createForwardShipment(bookingPayload, {
    mode: 'marketplace',
    service: route.serviceability.service || 'surface',
  })
  const bookingMode = 'marketplace'
  const bookingService = route.serviceability.service || 'surface'

  const forwardData = booking?.shipment?.data || booking?.shipment || booking?.data || booking
  const awbNumber =
    booking?.awb_number ||
    booking?.awb ||
    booking?.data?.awb_number ||
    booking?.data?.awb ||
    forwardData?.awb_number ||
    forwardData?.awb ||
    null

  assert(awbNumber, 'Shadowfax did not return a marketplace AWB.')

  const tracking = await shadowfax.trackShipment(String(awbNumber))
  const bulkTracking = await shadowfax.bulkTrackShipments([String(awbNumber)])
  let pod: any = null
  let podError: string | null = null
  let qr: any = null
  let qrError: string | null = null
  let escalation: any = null
  let escalationError: string | null = null

  try {
    pod = await shadowfax.getPodDetails([String(awbNumber)])
  } catch (error) {
    podError = parseErrorMessage(error)
  }

  try {
    qr = await shadowfax.generateQrCode({
      awb_number: String(awbNumber),
      client_request_id: orderNumber,
      client_order_id: orderNumber,
      amount: bookingPayload.order_amount,
    })
  } catch (error) {
    qrError = parseErrorMessage(error)
  }

  try {
    escalation = await shadowfax.createEscalation({
      awb_number: String(awbNumber),
      issue_category: 1,
    })
  } catch (error) {
    escalationError = parseErrorMessage(error)
  }

  const updatePayload = {
    awb_number: String(awbNumber),
    client_order_id: orderNumber,
    action: 'RE-ATTEMPT',
    request_type: 're-attempt',
    next_attempt_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  }

  let updateForwardOrderResponse: unknown = null
  let updateForwardOrderError: string | null = null
  let cancelResponse: unknown = null
  let cancelError: string | null = null

  try {
    try {
      updateForwardOrderResponse = await shadowfax.updateForwardOrder(updatePayload)
    } catch (error) {
      updateForwardOrderError = parseErrorMessage(error)
    }
  } finally {
    try {
      cancelResponse = await shadowfax.cancelShipment(String(awbNumber))
    } catch (error) {
      cancelError = parseErrorMessage(error)
    }
  }

  const summary = {
    marketplaceRoute: {
      originPincode: route.origin.pincode,
      destinationPincode: route.destination.pincode,
      mode: route.serviceability.mode,
      service: route.serviceability.service,
      services: route.serviceability.services,
    },
    preallocatedAwb,
    booking: {
      mode: bookingMode,
      service: bookingService,
      awb: awbNumber,
      providerReference:
        booking?.shipment?.data?.id ||
        booking?.shipment?.data?.client_order_id ||
        booking?.shipment?.id ||
        booking?.data?.id ||
        forwardData?.id ||
        forwardData?.client_order_id ||
        null,
    },
    tracking: tracking?.data || tracking,
    bulkTracking: bulkTracking?.data || bulkTracking,
    pod: pod?.data || pod,
    podError,
    qr: qr?.data || qr,
    qrError,
    escalation: escalation?.data || escalation,
    escalationError,
    updateForwardOrder: updateForwardOrderResponse,
    updateForwardOrderError,
    cancelShipment: cancelResponse,
    cancelError,
  }

  console.log('Shadowfax marketplace live smoke passed')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('Shadowfax marketplace live smoke failed')
  console.error(parseErrorMessage(error) || error)
  process.exit(1)
})
