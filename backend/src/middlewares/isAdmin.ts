import { NextFunction, Response } from 'express'
import {
  hasAdminPermission,
  inferAdminModule,
  inferRequiredLevel,
  resolveAdminAccess,
} from '../utils/adminAccess'

export const isAdminMiddleware = async (req: any, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized: No user ID found' })
    }

    const access = await resolveAdminAccess(userId)
    if (!access) {
      return res.status(403).json({ message: 'Forbidden: Admin access only' })
    }

    if (access.actorType === 'staff') {
      const module = inferAdminModule(req.baseUrl || '', req.path || '')
      const required = inferRequiredLevel(req.method, req.baseUrl || '', req.path || '')
      if (access.scopeType !== 'all') {
        return res.status(403).json({
          message: 'Use the CRM workspace for assigned-seller access',
          code: 'STAFF_SCOPE_RESTRICTED',
        })
      }
      if (!hasAdminPermission(access, module, required)) {
        return res.status(403).json({
          message: `Permission required: ${module}.${required}`,
          code: 'ADMIN_PERMISSION_DENIED',
        })
      }
    }

    req.adminAccess = access
    next()
  } catch (error) {
    console.error('[isAdminMiddleware]', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
