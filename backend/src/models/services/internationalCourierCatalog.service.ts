import { eq } from 'drizzle-orm'
import { db } from '../client'
import { courier_credentials } from '../schema/courierCredentials'
import { couriers } from '../schema/couriers'

export const INTERNATIONAL_COURIER_PROVIDERS = ['dilliking', 'icl'] as const

const INTERNATIONAL_COURIERS = [
  { id: 9101, name: 'DilliKing International', serviceProvider: 'dilliking' },
  { id: 9102, name: 'ICL International', serviceProvider: 'icl' },
]

export const ensureInternationalCourierCatalog = async () => {
  for (const courier of INTERNATIONAL_COURIERS) {
    await db.insert(couriers).values({
      ...courier,
      isEnabled: true,
      businessType: ['b2c', 'b2b'],
    }).onConflictDoNothing()
  }
}

export const setCourierConnectionStatus = async (
  provider: 'dilliking' | 'icl',
  connected: boolean,
  message = '',
) => {
  const [row] = await db.select({ metadata: courier_credentials.metadata })
    .from(courier_credentials).where(eq(courier_credentials.provider, provider)).limit(1)
  if (!row) return
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  await db.update(courier_credentials).set({
    metadata: {
      ...metadata,
      connectionStatus: connected ? 'connected' : 'failed',
      connectionCheckedAt: new Date().toISOString(),
      connectionMessage: String(message || '').slice(0, 300),
    },
    updatedAt: new Date(),
  }).where(eq(courier_credentials.provider, provider))
}

export const resetCourierConnectionStatus = async (provider: 'dilliking' | 'icl') => {
  const [row] = await db.select({ metadata: courier_credentials.metadata })
    .from(courier_credentials).where(eq(courier_credentials.provider, provider)).limit(1)
  if (!row) return
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  await db.update(courier_credentials).set({
    metadata: { ...metadata, connectionStatus: 'untested', connectionCheckedAt: null, connectionMessage: '' },
    updatedAt: new Date(),
  }).where(eq(courier_credentials.provider, provider))
}

export const readConnectionStatus = (metadata: unknown) => {
  const value = metadata && typeof metadata === 'object' ? metadata as Record<string, any> : {}
  return {
    connectionStatus: String(value.connectionStatus || 'untested'),
    connected: value.connectionStatus === 'connected',
    connectionCheckedAt: String(value.connectionCheckedAt || ''),
  }
}
