import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { employees } from '../models/schema/employees'

export const getMerchantUserIdFromRequest = (req: any): string => {
  const merchantUserId = String(
    req?.merchantUserId || req?.user?.merchantSub || req?.userId || req?.user?.sub || '',
  ).trim()

  return merchantUserId
}

export const resolveMerchantUserId = async (userId: string): Promise<string> => {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return normalizedUserId

  const [employeeRecord] = await db
    .select({ adminId: employees.adminId })
    .from(employees)
    .where(eq(employees.userId, normalizedUserId))
    .limit(1)

  return employeeRecord?.adminId || normalizedUserId
}
