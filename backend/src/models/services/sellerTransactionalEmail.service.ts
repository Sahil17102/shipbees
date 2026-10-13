import { eq } from 'drizzle-orm'
import { db } from '../client'
import { userProfiles } from '../schema/userProfile'
import { users } from '../schema/users'
import {
  sendCodSettledEmail,
  sendOrderCreatedEmail,
  sendOrderDeliveredEmail,
  sendWalletRechargeEmail,
} from '../../utils/emailSender'

const sellerIdentity = async (userId: string) => {
  const [account] = await db
    .select({ email: users.email, companyInfo: userProfiles.companyInfo })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1)

  const company = account?.companyInfo as any
  return {
    email: account?.email || null,
    name: company?.contactPerson || company?.brandName || company?.businessName || 'Seller',
  }
}

export const sendSellerOrderEventEmail = async (
  userId: string,
  eventType: 'order.created' | 'order.delivered',
  data: Record<string, any>,
) => {
  const seller = await sellerIdentity(userId)
  if (!seller.email) return

  const options = {
    to: seller.email,
    sellerName: seller.name,
    orderNumber: String(data.order_number || data.orderNumber || data.order_id || 'Order'),
    awbNumber: data.awb_number || data.awbNumber,
    courier: data.courier_partner || data.courierPartner,
    paymentType: data.payment_type || data.paymentType,
    occurredAt: data.delivered_at || data.updated_at || data.created_at || new Date(),
  }

  if (eventType === 'order.created') await sendOrderCreatedEmail(options)
  else await sendOrderDeliveredEmail(options)
}

export const sendSellerCodSettledEmail = async (params: {
  userId: string
  orderNumber: string
  awbNumber?: string | null
  courier?: string | null
  amount: number
  utrNumber?: string | null
  cycleName?: string | null
  cycleFee?: number
  settledAt?: string | Date | null
}) => {
  const seller = await sellerIdentity(params.userId)
  if (!seller.email) return
  await sendCodSettledEmail({ ...params, to: seller.email, sellerName: seller.name })
}

export const sendSellerWalletRechargeEmail = async (params: {
  userId: string
  amount: number
  currency?: string | null
  paymentId: string
  balance?: number | null
  rechargedAt?: string | Date | null
}) => {
  const seller = await sellerIdentity(params.userId)
  if (!seller.email) return
  await sendWalletRechargeEmail({ ...params, to: seller.email, sellerName: seller.name })
}
