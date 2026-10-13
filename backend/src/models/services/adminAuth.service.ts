import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { signAccessToken, signRefreshToken } from "../../utils/jwt";
import { db } from "../client";
import { users } from "../schema/users";
import { findUserByEmail, findUserById, saveRefreshToken } from "./userService";
import { adminStaff } from '../schema/adminCrm'
import { resolveAdminAccess } from '../../utils/adminAccess'


const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const loginAdmin = async (email: string, password: string) => {
  const user = await findUserByEmail(email);

  if (!user || !['admin', 'admin_staff'].includes(user.role || '')) {
    throw new Error("Unauthorized");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash!);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const adminAccess = await resolveAdminAccess(user.id)
  if (!adminAccess) throw new Error('Unauthorized')

  const accessToken = signAccessToken(user.id, user.role || 'admin');
  const { token: refreshToken } = signRefreshToken(user.id, user.role || 'admin');

  await saveRefreshToken(user.id, refreshToken, ONE_WEEK_MS);
  if (adminAccess.staffId) {
    await db
      .update(adminStaff)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(adminStaff.id, adminAccess.staffId))
  }

  return {
   token: accessToken,
    refreshToken:refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      adminAccess,
    },
  };
};

export const changeAdminPassword = async (
  adminId: string,
  currentPassword: string,
  newPassword: string,
) => {
  const user = await findUserById(adminId);

  if (!user || !['admin', 'admin_staff'].includes(user.role || '')) {
    throw new Error("Unauthorized");
  }

  if (!user.passwordHash) {
    throw new Error("Password is not set for this admin");
  }

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new Error("Current password is incorrect");
  }

  if (currentPassword === newPassword) {
    throw new Error("New password must be different from current password");
  }

  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}/.test(newPassword)) {
    throw new Error(
      "Password must be at least 8 characters and include upper, lower, and number",
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, adminId));

  // Invalidate old refresh token so admin re-auths cleanly on other sessions.
  await saveRefreshToken(adminId, null, 0, null);
};
