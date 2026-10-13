import { randomUUID } from 'crypto'
import dotenv from 'dotenv'
import jwt, { type SignOptions } from 'jsonwebtoken'

import path from 'path'

// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET!
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET!

export interface RefreshPayload {
  sub: string // userId
  role: string
  jti: string
  impersonation?: boolean
  actorSub?: string
  sessionType?: string
  iat: number
  exp: number
}

type TokenOptions = {
  expiresIn?: SignOptions['expiresIn']
  extra?: Record<string, unknown>
}

export const signAccessToken = (
  id: string,
  role: string,
  options: TokenOptions = {},
) =>
  jwt.sign({ sub: id, role, ...(options.extra || {}) }, ACCESS_SECRET, {
    expiresIn: options.expiresIn || '24h',
  })

export const signRefreshToken = (
  id: string,
  role: string,
  options: TokenOptions = {},
) => {
  const jti = randomUUID()
  return {
    token: jwt.sign({ sub: id, role, jti, ...(options.extra || {}) }, REFRESH_SECRET, {
      expiresIn: options.expiresIn || '7d',
    }),
    jti,
  }
}

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, ACCESS_SECRET) as {
    sub: string
    role: string
    impersonation?: boolean
    actorSub?: string
    sessionType?: string
  }

export const verifyRefreshToken = (token: string): RefreshPayload =>
  jwt.verify(token, REFRESH_SECRET) as RefreshPayload
