const cleanPathPart = (value: string) =>
  value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9._/-]+/g, '-')
    .replace(/\/+/g, '/')

export const getR2ObjectPrefix = () => cleanPathPart(process.env.R2_OBJECT_PREFIX || 'shipray')

export const withR2ObjectPrefix = (key: string) => {
  const cleanKey = cleanPathPart(key)
  const prefix = getR2ObjectPrefix()

  if (!prefix) return cleanKey
  if (cleanKey === prefix || cleanKey.startsWith(`${prefix}/`)) return cleanKey

  return `${prefix}/${cleanKey}`
}

export const getR2EndpointConfig = (bucket?: string) => {
  const rawEndpoint = String(process.env.R2_ENDPOINT || '').trim().replace(/\/+$/, '')

  if (!rawEndpoint) {
    return {
      clientEndpoint: undefined,
      publicBaseUrl: '',
    }
  }

  if (!bucket) {
    return {
      clientEndpoint: rawEndpoint,
      publicBaseUrl: rawEndpoint,
    }
  }

  try {
    const url = new URL(rawEndpoint)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const bucketIndex = pathParts.lastIndexOf(bucket)

    if (bucketIndex !== -1) {
      const clientPath = pathParts.slice(0, bucketIndex).join('/')
      const clientEndpoint = `${url.origin}${clientPath ? `/${clientPath}` : ''}`

      return {
        clientEndpoint,
        publicBaseUrl: rawEndpoint,
      }
    }
  } catch {
    // Fall through to plain endpoint behavior.
  }

  return {
    clientEndpoint: rawEndpoint,
    publicBaseUrl: `${rawEndpoint}/${bucket}`,
  }
}

export const extractR2KeyFromUrl = (value: string, bucket: string): string | null => {
  try {
    const url = new URL(value)
    const pathParts = url.pathname.split('/').filter(Boolean)

    const bucketIndex = pathParts.indexOf(bucket)
    if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
      return pathParts.slice(bucketIndex + 1).join('/')
    }

    const endpointConfig = getR2EndpointConfig(bucket)
    if (endpointConfig.publicBaseUrl && value.startsWith(endpointConfig.publicBaseUrl)) {
      return value.slice(endpointConfig.publicBaseUrl.length).replace(/^\/+/, '') || null
    }

    const configuredEndpoint = String(process.env.R2_ENDPOINT || '').trim().replace(/\/+$/, '')
    if (configuredEndpoint && value.startsWith(configuredEndpoint)) {
      return value.slice(configuredEndpoint.length).replace(/^\/+/, '') || null
    }

    return null
  } catch {
    return null
  }
}

export const buildR2PublicUrl = (bucket: string, key: string) => {
  const { publicBaseUrl } = getR2EndpointConfig(bucket)
  return publicBaseUrl ? `${publicBaseUrl}/${key}` : key
}
