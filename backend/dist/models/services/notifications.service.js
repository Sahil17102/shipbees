"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotificationService = createNotificationService;
exports.getNotificationsForUser = getNotificationsForUser;
exports.markNotificationAsRead = markNotificationAsRead;
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
// services/notificationService.ts
const mail_1 = __importDefault(require("@sendgrid/mail"));
const drizzle_orm_1 = require("drizzle-orm");
const socketServer_1 = require("../../config/socketServer");
const client_1 = require("../client");
const notifications_1 = require("../schema/notifications");
const users_1 = require("../schema/users");
const emailIdentity_1 = require("../../utils/emailIdentity");
async function createNotificationService(params) {
    const { targetRole, userId, title, message, sendEmail = false, email } = params;
    if (targetRole === 'admin') {
        const adminUsers = await client_1.db.query.users.findMany({
            where: (0, drizzle_orm_1.eq)(users_1.users.role, 'admin'),
            columns: { id: true, email: true },
        });
        if (adminUsers.length === 0)
            return null;
        // Prepare all notifications for all admins
        const notificationsData = adminUsers.map((admin) => ({
            targetRole,
            userId: admin.id,
            title,
            message,
        }));
        // Insert all in one query
        const newNotifications = await client_1.db.insert(notifications_1.notifications).values(notificationsData).returning();
        // Send each to its respective admin once
        newNotifications.forEach((n) => {
            if (n?.userId)
                (0, socketServer_1.sendNotification)(n?.userId, n);
        });
        if (sendEmail) {
            const recipients = Array.from(new Set([...adminUsers.map((admin) => admin.email), email, process.env.ADMIN_EMAIL]
                .map((value) => String(value || '').trim())
                .filter(Boolean)));
            await Promise.allSettled(recipients.map((recipient) => sendEmailNotification(recipient, title, message)));
        }
        return newNotifications;
    }
    // For a single user
    const [newNotification] = await client_1.db
        .insert(notifications_1.notifications)
        .values({
        targetRole,
        userId: userId || null,
        title,
        message,
    })
        .returning();
    if (userId && targetRole === 'user') {
        (0, socketServer_1.sendNotification)(userId, newNotification);
    }
    if (sendEmail) {
        let recipient = String(email || '').trim();
        if (!recipient && userId) {
            const [user] = await client_1.db.select({ email: users_1.users.email }).from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId)).limit(1);
            recipient = String(user?.email || '').trim();
        }
        if (recipient) {
            await sendEmailNotification(recipient, title, message);
        }
    }
    return newNotification;
}
async function getNotificationsForUser(userId) {
    const rows = await client_1.db
        .select()
        .from(notifications_1.notifications)
        .where((0, drizzle_orm_1.eq)(notifications_1.notifications.userId, userId))
        .orderBy((0, drizzle_orm_1.desc)(notifications_1.notifications.createdAt));
    return rows;
}
async function markNotificationAsRead(userId, notificationId) {
    const [updated] = await client_1.db
        .update(notifications_1.notifications)
        .set({ read: true })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(notifications_1.notifications.id, notificationId), (0, drizzle_orm_1.eq)(notifications_1.notifications.userId, userId)))
        .returning();
    return updated;
}
async function markAllNotificationsAsRead(userId) {
    const updated = await client_1.db
        .update(notifications_1.notifications)
        .set({ read: true })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(notifications_1.notifications.userId, userId), (0, drizzle_orm_1.eq)(notifications_1.notifications.read, false)))
        .returning({ id: notifications_1.notifications.id });
    return {
        count: updated.length,
    };
}
const getSendGridApiKey = () => process.env.TWILLIO_SENDGRID_API_KEY ||
    process.env.TWILIO_SENDGRID_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    '';
async function sendEmailNotification(to, subject, message) {
    const sendGridApiKey = getSendGridApiKey();
    const emailFrom = (0, emailIdentity_1.getEmailFromAddress)();
    if (!sendGridApiKey || !emailFrom) {
        console.warn('Email notification skipped: missing SendGrid API key or EMAIL_FROM');
        return;
    }
    mail_1.default.setApiKey(sendGridApiKey);
    const msg = {
        to,
        from: (0, emailIdentity_1.formatEmailFromHeader)(),
        subject,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333;">${subject}</h2>
        <p style="font-size: 16px; color: #555;">${message}</p>
        <p style="font-size: 14px; color: #888; margin-top: 32px;">— The Shipray Team</p>
      </div>
    `,
    };
    try {
        await mail_1.default.send(msg);
    }
    catch (error) {
        console.error('Email sending failed:', error);
    }
}
