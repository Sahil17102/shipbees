import axios, { AxiosInstance } from 'axios'
import crypto from 'crypto'
import Razorpay from 'razorpay'

type RazorpayMode = 'test' | 'live'

type RazorpayCredentials = {
  key_id: string
  key_secret: string
}

export class RazorpayConfigurationError extends Error {
  readonly code = 'RAZORPAY_NOT_CONFIGURED'
  readonly statusCode = 503

  constructor(message: string) {
    super(message)
    this.name = 'RazorpayConfigurationError'
  }
}

let razorpayClient: Razorpay | undefined
let razorpayAxiosClient: AxiosInstance | undefined

function getMode(): RazorpayMode {
  const configuredMode = process.env.RAZORPAY_MODE?.trim().toLowerCase()

  if (configuredMode && configuredMode !== 'test' && configuredMode !== 'live') {
    throw new RazorpayConfigurationError(
      'RAZORPAY_MODE must be either "test" or "live".',
    )
  }

  if (configuredMode) return configuredMode as RazorpayMode
  return process.env.NODE_ENV === 'production' ? 'live' : 'test'
}

function readCredentials(): RazorpayCredentials {
  const mode = getMode()
  const keyId =
    mode === 'live'
      ? process.env.RAZORPAY_KEY_ID_PROD || process.env.RAZORPAY_KEY_ID
      : process.env.RAZORPAY_KEY_ID
  const keySecret =
    mode === 'live'
      ? process.env.RAZORPAY_KEY_SECRET_PROD || process.env.RAZORPAY_KEY_SECRET
      : process.env.RAZORPAY_KEY_SECRET

  if (!keyId?.trim() || !keySecret?.trim()) {
    const expected =
      mode === 'live'
        ? 'RAZORPAY_KEY_ID_PROD and RAZORPAY_KEY_SECRET_PROD (or RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)'
        : 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET'

    throw new RazorpayConfigurationError(
      `Razorpay ${mode.toUpperCase()} credentials are not configured. Set ${expected}.`,
    )
  }

  return {
    key_id: keyId.trim(),
    key_secret: keySecret.trim(),
  }
}

function readWebhookSecret(): string {
  const mode = getMode()
  const secret =
    mode === 'live'
      ? process.env.RAZORPAY_WEBHOOK_SECRET_PROD || process.env.RAZORPAY_WEBHOOK_SECRET
      : process.env.RAZORPAY_WEBHOOK_SECRET

  if (!secret?.trim()) {
    throw new RazorpayConfigurationError(
      `Razorpay ${mode.toUpperCase()} webhook secret is not configured.`,
    )
  }

  return secret.trim()
}

export function isRazorpayConfigured(): boolean {
  try {
    readCredentials()
    return true
  } catch (error) {
    if (error instanceof RazorpayConfigurationError) return false
    throw error
  }
}

export function getRazorpay(): Razorpay {
  if (!razorpayClient) {
    const credentials = readCredentials()
    razorpayClient = new Razorpay(credentials)
    console.info(`[Razorpay] Initialised in ${getMode().toUpperCase()} mode`)
  }

  return razorpayClient
}

export function getRazorpayApi(): AxiosInstance {
  if (!razorpayAxiosClient) {
    const credentials = readCredentials()
    razorpayAxiosClient = axios.create({
      baseURL: 'https://api.razorpay.com/v1',
      auth: {
        username: credentials.key_id,
        password: credentials.key_secret,
      },
    })
  }

  return razorpayAxiosClient
}

export function getRazorpayKeyId(): string {
  return readCredentials().key_id
}

export function isValidSig(body: string | Buffer, signature?: string): boolean {
  if (!signature) return false

  const expected = crypto
    .createHmac('sha256', readWebhookSecret())
    .update(body)
    .digest('hex')

  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)

  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  )
}
