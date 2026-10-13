// seedAdmin.ts
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../models/client'
import { User } from '../models/services/userService'
import { users } from '../schema/schema'

interface SeedAdminProps {
  phone: string
  password: string
  email?: string
  role?: 'admin' | 'customer' | 'manager'
}

export const seedAdmin = async ({
  phone,
  password,
  email,
  role = 'admin',
}: SeedAdminProps): Promise<User> => {
  // check if user already exists
  const existing = await db.select().from(users).where(eq(users.phone, phone))
  if (existing.length > 0) {
    const hashedPassword = await bcrypt.hash(password, 10)
    const [updatedUser] = await db
      .update(users)
      .set({
        email: email ?? existing[0].email,
        passwordHash: hashedPassword,
        role,
        phoneVerified: true,
        emailVerified: !!email,
        refreshToken: null,
        refreshTokenExpiresAt: null,
        previousRefreshToken: null,
        previousRefreshTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.phone, phone))
      .returning()

    return updatedUser as User
  }

  // hash password
  const hashedPassword = await bcrypt.hash(password, 10)

  // insert new user
  const [newUser] = await db
    .insert(users)
    .values({
      id: uuidv4(),
      phone,
      email: email ?? null,
      passwordHash: hashedPassword,
      role,
      phoneVerified: true,
      emailVerified: !!email,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  return newUser as User
}

seedAdmin({
  phone: '+916283315911', // valid Indian phone format
  email: 'admin@shipbees.com',
  password: 'Admin@12345!', // strong password
  role: 'admin',
})
  .then((user) => {
    console.log('Admin user created or updated:', {
      id: user.id,
      email: user.email,
      role: user.role,
    })
    process.exit(0)
  })
  .catch((err) => {
    console.error('Error seeding admin:', err)
    process.exit(1)
  })
