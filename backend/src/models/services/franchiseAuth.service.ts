import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { signAccessToken, signRefreshToken } from '../../utils/jwt'
import { db } from '../client'
import {
  franchiseMembers,
  franchiseOrganizations,
} from '../schema/franchise'
import { users } from '../schema/users'
import { saveRefreshToken } from './userService'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export const loginFranchiseMember = async (email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase()
  const [account] = await db
    .select({
      userId: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      emailVerified: users.emailVerified,
      memberId: franchiseMembers.id,
      memberRole: franchiseMembers.role,
      permissions: franchiseMembers.permissions,
      organizationId: franchiseOrganizations.id,
      organizationName: franchiseOrganizations.tradeName,
      organizationStatus: franchiseOrganizations.status,
    })
    .from(users)
    .innerJoin(
      franchiseMembers,
      and(eq(franchiseMembers.userId, users.id), eq(franchiseMembers.isActive, true)),
    )
    .innerJoin(
      franchiseOrganizations,
      eq(franchiseOrganizations.id, franchiseMembers.organizationId),
    )
    .where(eq(users.email, normalizedEmail))
    .limit(1)

  if (!account?.passwordHash) {
    throw new Error('Invalid credentials')
  }

  const passwordMatches = await bcrypt.compare(password, account.passwordHash)
  if (!passwordMatches) {
    throw new Error('Invalid credentials')
  }

  if (account.organizationStatus !== 'active') {
    throw new Error('This franchise account is not active')
  }

  const accessToken = signAccessToken(account.userId, 'franchise')
  const { token: refreshToken } = signRefreshToken(account.userId, 'franchise')
  await saveRefreshToken(account.userId, refreshToken, ONE_WEEK_MS)

  return {
    token: accessToken,
    refreshToken,
    user: {
      id: account.userId,
      email: account.email,
      emailVerified: account.emailVerified,
      role: account.memberRole,
      permissions: account.permissions,
      organization: {
        id: account.organizationId,
        name: account.organizationName,
      },
    },
  }
}
