"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminMiddleware = void 0;
const adminAccess_1 = require("../utils/adminAccess");
const isAdminMiddleware = async (req, res, next) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: No user ID found' });
        }
        const access = await (0, adminAccess_1.resolveAdminAccess)(userId);
        if (!access) {
            return res.status(403).json({ message: 'Forbidden: Admin access only' });
        }
        if (access.actorType === 'staff') {
            const module = (0, adminAccess_1.inferAdminModule)(req.baseUrl || '', req.path || '');
            const required = (0, adminAccess_1.inferRequiredLevel)(req.method, req.baseUrl || '', req.path || '');
            if (access.scopeType !== 'all') {
                return res.status(403).json({
                    message: 'Use the CRM workspace for assigned-seller access',
                    code: 'STAFF_SCOPE_RESTRICTED',
                });
            }
            if (!(0, adminAccess_1.hasAdminPermission)(access, module, required)) {
                return res.status(403).json({
                    message: `Permission required: ${module}.${required}`,
                    code: 'ADMIN_PERMISSION_DENIED',
                });
            }
        }
        req.adminAccess = access;
        next();
    }
    catch (error) {
        console.error('[isAdminMiddleware]', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.isAdminMiddleware = isAdminMiddleware;
