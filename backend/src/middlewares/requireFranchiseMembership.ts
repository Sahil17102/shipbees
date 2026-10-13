import { and, eq } from 'drizzle-orm'
import { NextFunction, Response } from 'express'
import { db } from '../models/client'
import {
  franchiseMembers,
  franchiseOrganizations,
} from '../models/schema/franchise'

export type FranchiseRequest = any & {
  franchise?: {
    memberId: string
    organizationId: string
    organizationName: string
    role: string
    permissions: string[]
  }
}

export const requireFranchiseMembership = async (
  req: FranchiseRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.sub
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }

    const [membership] = await db
      .select({
        memberId: franchiseMembers.id,
        organizationId: franchiseOrganizations.id,
        organizationName: franchiseOrganizations.tradeName,
        organizationStatus: franchiseOrganizations.status,
        role: franchiseMembers.role,
        permissions: franchiseMembers.permissions,
      })
      .from(franchiseMembers)
      .innerJoin(
        franchiseOrganizations,
        eq(franchiseOrganizations.id, franchiseMembers.organizationId),
      )
      .where(and(eq(franchiseMembers.userId, userId), eq(franchiseMembers.isActive, true)))
      .limit(1)

    if (!membership || membership.organizationStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'An active franchise membership is required',
      })
    }

    req.franchise = {
      memberId: membership.memberId,
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      role: membership.role,
      permissions: membership.permissions || [],
    }
    next()
  } catch (error) {
    console.error('[requireFranchiseMembership]', error)
    return res.status(500).json({ success: false, message: 'Unable to verify franchise access' })
  }
}
