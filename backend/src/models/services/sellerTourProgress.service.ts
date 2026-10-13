import { eq } from 'drizzle-orm'
import { db } from '../client'
import { sellerTourProgress } from '../schema/sellerTourProgress'
import {
  applyTourAction,
  emptyTourProgress,
  SELLER_TOUR_VERSION,
  type TourAction,
  type TourStatus,
} from './sellerTourProgress.logic'

export const getSellerTourProgress = async (userId: string) => {
  const [row] = await db.select().from(sellerTourProgress).where(eq(sellerTourProgress.userId, userId)).limit(1)
  if (!row || row.version !== SELLER_TOUR_VERSION) return emptyTourProgress()
  return {
    version: SELLER_TOUR_VERSION,
    status: row.status as TourStatus,
    completedPages: Array.isArray(row.completedPages) ? row.completedPages : [],
  }
}

export const updateSellerTourProgress = async (userId: string, action: TourAction, page?: string) => {
  const current = await getSellerTourProgress(userId)
  const next = applyTourAction(current, action, page)
  await db.insert(sellerTourProgress).values({ userId, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: sellerTourProgress.userId,
      set: { ...next, updatedAt: new Date() },
    })
  return next
}
