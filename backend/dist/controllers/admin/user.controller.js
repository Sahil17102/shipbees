"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectDocument = exports.approveDocument = exports.revokeKyc = exports.rejectKyc = exports.approveKyc = exports.getKycDetailsByUserId = void 0;
exports.listUsers = listUsers;
exports.getTeamMembersForUser = getTeamMembersForUser;
exports.createTeamMemberForUser = createTeamMemberForUser;
exports.updateTeamMemberStatus = updateTeamMemberStatus;
exports.deleteTeamMember = deleteTeamMember;
exports.searchSellers = searchSellers;
exports.createUserImpersonationSession = createUserImpersonationSession;
exports.approveUser = approveUser;
exports.resetUserPasswordController = resetUserPasswordController;
exports.getUserBankAccounts = getUserBankAccounts;
exports.updateUserBankAccountStatus = updateUserBankAccountStatus;
exports.updateUserBusinessType = updateUserBusinessType;
exports.deleteUserController = deleteUserController;
const bankAccount_service_1 = require("../../models/services/bankAccount.service");
const kyc_service_1 = require("../../models/services/kyc.service");
const userProfile_service_1 = require("../../models/services/userProfile.service");
const employee_service_1 = require("../../models/services/employee.service");
const userService_1 = require("../../models/services/userService");
const emailSender_1 = require("../../utils/emailSender");
const classes_1 = require("../../utils/classes");
const jwt_1 = require("../../utils/jwt");
const IMPERSONATION_SESSION_MS = 15 * 60 * 1000;
async function listUsers(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder || 'desc';
        const onboardingComplete = req.query.onboardingComplete ?? '';
        const approved = req.query.approved ?? '';
        const kycStatus = req.query.kycStatus ?? '';
        // Normalize all status values into a single array
        let businessTypes = [];
        const rawBusinessTypes = req.query['businessTypes[]'] ?? req.query.businessTypes;
        const normalizeBusinessTypes = (value) => (Array.isArray(value) ? value : [value])
            .flat()
            .flatMap((item) => String(item || '').split(','))
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
        businessTypes = normalizeBusinessTypes(rawBusinessTypes);
        const { data, totalCount } = await (0, userService_1.getAllUsersWithRoleUser)({
            page,
            perPage,
            search,
            sortBy,
            sortOrder,
            onboardingComplete,
            businessTypes,
            approved,
            kycStatus,
        });
        res.status(200).json({ success: true, data, totalCount });
    }
    catch (error) {
        console.error('Error fetching users with role customer:', error);
        res.status(500).json({ success: false, message: 'Server error fetching users' });
    }
}
async function getTeamMembersForUser(req, res) {
    try {
        const adminId = req.params.id;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const search = req.query.search || '';
        const statusQuery = req.query.status || '';
        const status = statusQuery === 'active' || statusQuery === 'inactive'
            ? statusQuery
            : undefined;
        if (!adminId) {
            return res.status(400).json({ success: false, message: 'User identifier is required' });
        }
        const { employees, page: currentPage, limit: perPage, hasMore, nextPage, totalCount } = await (0, employee_service_1.getEmployeesByAdminService)(adminId, page, limit, search, status);
        res.status(200).json({
            success: true,
            members: employees,
            page: currentPage,
            perPage,
            totalCount,
            hasMore,
            nextPage,
        });
    }
    catch (error) {
        console.error('Error fetching team members for user:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch team members',
        });
    }
}
async function createTeamMemberForUser(req, res) {
    try {
        const adminId = req.params.id;
        if (!adminId) {
            return res.status(400).json({ success: false, message: 'User identifier is required' });
        }
        const { name, email, phone, role, password, moduleAccess } = req.body || {};
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        const trimmedPhone = typeof phone === 'string' ? phone.trim() : undefined;
        if (!trimmedName || !trimmedEmail) {
            return res
                .status(400)
                .json({ success: false, message: 'Name and email are required to create a team member' });
        }
        if (!password || typeof password !== 'string' || password.trim().length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A password of at least 6 characters is required for team members',
            });
        }
        const payload = {
            adminId,
            name: trimmedName,
            email: trimmedEmail,
            phone: trimmedPhone,
            role: role || 'employee',
            password,
            moduleAccess: typeof moduleAccess === 'object' && moduleAccess !== null ? moduleAccess : {},
        };
        const { employee, user } = await (0, employee_service_1.createEmployeeService)(payload, adminId);
        res.status(201).json({
            success: true,
            member: employee,
            user,
        });
    }
    catch (error) {
        console.error('Error creating team member for user:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Failed to create team member',
        });
    }
}
async function updateTeamMemberStatus(req, res) {
    try {
        const adminId = req.params.id;
        const memberId = req.params.memberId;
        const { isActive } = req.body || {};
        if (!adminId || !memberId) {
            return res.status(400).json({ success: false, message: 'Invalid team member reference' });
        }
        if (typeof isActive !== 'boolean') {
            return res
                .status(400)
                .json({ success: false, message: 'The isActive flag must be provided as a boolean' });
        }
        const member = await (0, employee_service_1.toggleEmployeeStatusService)(memberId, adminId, isActive);
        res.status(200).json({
            success: true,
            member,
        });
    }
    catch (error) {
        console.error('Error updating team member status:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Failed to update team member status',
        });
    }
}
async function deleteTeamMember(req, res) {
    try {
        const adminId = req.params.id;
        const memberId = req.params.memberId;
        if (!adminId || !memberId) {
            return res.status(400).json({ success: false, message: 'Invalid team member reference' });
        }
        const result = await (0, employee_service_1.deleteEmployeeService)(memberId, adminId);
        res.status(200).json({
            success: true,
            member: result,
        });
    }
    catch (error) {
        console.error('Error deleting team member:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Failed to delete team member',
        });
    }
}
// Search sellers by name for autocomplete
async function searchSellers(req, res) {
    try {
        const search = req.query.q || '';
        const limit = parseInt(req.query.limit) || 20;
        if (!search.trim()) {
            return res.status(200).json({ success: true, data: [] });
        }
        const { data } = await (0, userService_1.getAllUsersWithRoleUser)({
            page: 1,
            perPage: limit,
            search: search.trim(),
            sortBy: 'companyName',
            sortOrder: 'asc',
        });
        // Format for autocomplete
        const formatted = data.map((user) => ({
            id: user.id,
            label: user.companyName || user.contactPerson || user.email,
            value: user.id,
            email: user.email,
            companyName: user.companyName,
            contactPerson: user.contactPerson,
        }));
        res.status(200).json({ success: true, data: formatted });
    }
    catch (error) {
        console.error('Error searching sellers:', error);
        res.status(500).json({ success: false, message: 'Server error searching sellers' });
    }
}
async function createUserImpersonationSession(req, res) {
    try {
        const targetUserId = String(req.params.id || '').trim();
        const adminUserId = String(req.user?.sub || '').trim();
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'User identifier is required' });
        }
        if (!adminUserId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const user = await (0, userService_1.findUserById)(targetUserId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (String(user.role || '').toLowerCase() !== 'customer') {
            return res.status(400).json({
                success: false,
                message: 'Only customer accounts can be opened in the client panel',
            });
        }
        const extra = {
            impersonation: true,
            actorSub: adminUserId,
            sessionType: 'admin_impersonation',
        };
        const accessToken = (0, jwt_1.signAccessToken)(user.id, user.role || 'customer', {
            expiresIn: '15m',
            extra,
        });
        const { token: refreshToken } = (0, jwt_1.signRefreshToken)(user.id, user.role || 'customer', {
            expiresIn: '15m',
            extra,
        });
        const expiresAt = new Date(Date.now() + IMPERSONATION_SESSION_MS).toISOString();
        const clientBaseUrl = String(process.env.CLIENT_URL ||
            process.env.FRONTEND_URL ||
            'https://app.shipraylogistics.in').replace(/\/+$/, '');
        console.log('[AdminImpersonation] session issued', {
            adminUserId,
            targetUserId: user.id,
            expiresAt,
            requestId: req.requestId || null,
        });
        return res.status(200).json({
            success: true,
            accessToken,
            refreshToken,
            expiresAt,
            impersonatedUser: {
                id: user.id,
                email: user.email,
                phone: user.phone,
            },
            clientUrl: `${clientBaseUrl}/admin-impersonation?token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}&admin=${encodeURIComponent(adminUserId)}&expiresAt=${encodeURIComponent(expiresAt)}`,
        });
    }
    catch (error) {
        console.error('Error creating impersonation session:', error?.message || error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to create impersonation session',
        });
    }
}
async function approveUser(req, res) {
    try {
        const userId = req.params.id;
        console.log(userId);
        // Fetch user to verify existence
        const user = await (0, userService_1.findUserById)(userId);
        if (!user) {
            return res.status(200).json({ success: false, message: 'User not found' });
        }
        if (user.approved) {
            return res.status(400).json({ success: false, message: 'User is already approved' });
        }
        // Update approval status
        await (0, userService_1.updateUserApprovalStatus)(userId, true);
        return res.status(200).json({ success: true, message: 'User approved successfully' });
    }
    catch (error) {
        console.error('Error approving user:', error);
        return res.status(500).json({ success: false, message: 'Server error approving user' });
    }
}
async function resetUserPasswordController(req, res) {
    try {
        const userId = req.params.id;
        // Check if user exists (optional but recommended)
        const user = await (0, userService_1.findUserById)(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const { tempPassword, expiresAt } = await (0, userService_1.resetUserPassword)(userId);
        // Return the one-time password to admin so they can share it manually.
        return res.status(200).json({
            success: true,
            message: 'One-time access password generated successfully',
            tempPassword,
            expiresAt,
        });
    }
    catch (error) {
        console.error('Error generating one-time user password:', error);
        return res
            .status(500)
            .json({ success: false, message: 'Server error generating one-time access password' });
    }
}
async function getUserBankAccounts(req, res) {
    try {
        const userId = req.params.id;
        // Verify user exists first (optional but recommended)
        const user = await (0, userService_1.findUserById)(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const bankAccounts = await (0, bankAccount_service_1.getBankAccountsByUserId)(userId);
        return res.status(200).json({ success: true, data: bankAccounts });
    }
    catch (error) {
        console.error('Error fetching user bank accounts:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching bank accounts' });
    }
}
async function updateUserBankAccountStatus(req, res) {
    try {
        const userId = req.params.id;
        const accountId = req.params.accountId;
        const { status, rejectionReason } = req.body;
        // Validate required fields
        if (!['verified', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value' });
        }
        // Verify user exists
        const user = await (0, userService_1.findUserById)(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        // Call service to update bank account status
        await (0, bankAccount_service_1.updateBankAccountStatusById)(userId, accountId, status, rejectionReason);
        return res
            .status(200)
            .json({ success: true, message: 'Bank account status updated successfully' });
    }
    catch (error) {
        console.error('Error updating bank account status:', error);
        return res
            .status(500)
            .json({ success: false, message: 'Server error updating bank account status' });
    }
}
async function updateUserBusinessType(req, res) {
    try {
        const userId = req.params.id;
        const businessType = req.body?.businessType;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User identifier is required' });
        }
        const user = await (0, userService_1.findUserById)(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const updatedProfile = await (0, userProfile_service_1.updateUserBusinessTypeByAdmin)(userId, businessType);
        return res.status(200).json({
            success: true,
            message: 'Business type updated successfully',
            data: updatedProfile,
        });
    }
    catch (error) {
        if (error instanceof classes_1.HttpError) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        console.error('Error updating user business type:', error);
        return res
            .status(500)
            .json({ success: false, message: 'Server error updating business type' });
    }
}
const getKycDetailsByUserId = async (req, res) => {
    const userId = req.params.id;
    try {
        const added = await (0, kyc_service_1.getUserKycService)(userId);
        return res.json({
            message: 'KYC details fetched successfully',
            kyc: added,
        });
    }
    catch (err) {
        if (err?.statusCode === 200) {
            return res.status(200).json({ message: 'No KYC details found', kyc: {} });
        }
        return res.status(400).json({ message: err.message, kyc: {} });
    }
};
exports.getKycDetailsByUserId = getKycDetailsByUserId;
const approveKyc = async (req, res) => {
    try {
        const user = await (0, userService_1.findUserById)(req.params.id);
        await (0, kyc_service_1.updateKycStatus)(req.params.id, 'verified');
        if (user?.email) {
            (0, emailSender_1.sendKycStatusEmail)({
                to: user.email,
                userName: user.email,
                status: 'verified',
            }).catch((err) => console.error('Failed to send KYC approval email:', err));
        }
        res.json({ message: 'KYC approved' });
    }
    catch {
        res.status(400).json({ message: 'Failed to approve KYC' });
    }
};
exports.approveKyc = approveKyc;
// Reject KYC
const rejectKyc = async (req, res) => {
    const { reason } = req.body;
    if (!reason)
        return res.status(400).json({ message: 'Rejection reason required' });
    try {
        const user = await (0, userService_1.findUserById)(req.params.id);
        await (0, kyc_service_1.updateKycStatus)(req.params.id, 'rejected', reason);
        if (user?.email) {
            (0, emailSender_1.sendKycStatusEmail)({
                to: user.email,
                userName: user.email,
                status: 'rejected',
                reason,
            }).catch((err) => console.error('Failed to send KYC rejection email:', err));
        }
        res.json({ message: 'KYC rejected' });
    }
    catch {
        res.status(400).json({ message: 'Failed to reject KYC' });
    }
};
exports.rejectKyc = rejectKyc;
// Revoke KYC (move back to verification in progress)
const revokeKyc = async (req, res) => {
    const { reason } = req.body;
    if (!reason)
        return res.status(400).json({ message: 'Revocation reason required' });
    try {
        const user = await (0, userService_1.findUserById)(req.params.id);
        await (0, kyc_service_1.updateKycStatus)(req.params.id, 'verification_in_progress', reason);
        if (user?.email) {
            (0, emailSender_1.sendKycStatusEmail)({
                to: user.email,
                userName: user.email,
                status: 'rejected',
                reason: `KYC was revoked by admin. Re-verification required. Reason: ${reason}`,
            }).catch((err) => console.error('Failed to send KYC revoke email:', err));
        }
        res.json({ message: 'KYC revoked and moved to verification in progress' });
    }
    catch {
        res.status(400).json({ message: 'Failed to revoke KYC' });
    }
};
exports.revokeKyc = revokeKyc;
// Approve single document
const approveDocument = async (req, res) => {
    const { key } = req.params;
    try {
        await (0, kyc_service_1.updateDocumentStatus)(req.params.id, key, 'verified');
        res.json({ message: 'Document approved' });
    }
    catch {
        res.status(400).json({ message: 'Failed to approve document' });
    }
};
exports.approveDocument = approveDocument;
// Reject single document
const rejectDocument = async (req, res) => {
    const { key } = req.params;
    const { reason } = req.body;
    if (!reason)
        return res.status(400).json({ message: 'Rejection reason required' });
    try {
        await (0, kyc_service_1.updateDocumentStatus)(req.params.id, key, 'rejected', reason);
        res.json({ message: 'Document rejected' });
    }
    catch {
        res.status(400).json({ message: 'Failed to reject document' });
    }
};
exports.rejectDocument = rejectDocument;
// Delete user
async function deleteUserController(req, res) {
    try {
        const userId = req.params.id;
        // Check if user exists
        const user = await (0, userService_1.findUserById)(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        // Prevent deleting admin users
        if (user.role === 'admin') {
            return res.status(403).json({ success: false, message: 'Cannot delete admin users' });
        }
        // Delete user
        await (0, userService_1.deleteUser)(userId);
        return res.status(200).json({
            success: true,
            message: 'User deleted successfully',
        });
    }
    catch (error) {
        console.error('Error deleting user:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Server error deleting user',
        });
    }
}
