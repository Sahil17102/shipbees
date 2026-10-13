"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildR2PublicUrl = exports.extractR2KeyFromUrl = exports.getR2EndpointConfig = exports.withR2ObjectPrefix = exports.getR2ObjectPrefix = void 0;
const cleanPathPart = (value) => value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9._/-]+/g, '-')
    .replace(/\/+/g, '/');
const getR2ObjectPrefix = () => cleanPathPart(process.env.R2_OBJECT_PREFIX || 'shipray');
exports.getR2ObjectPrefix = getR2ObjectPrefix;
const withR2ObjectPrefix = (key) => {
    const cleanKey = cleanPathPart(key);
    const prefix = (0, exports.getR2ObjectPrefix)();
    if (!prefix)
        return cleanKey;
    if (cleanKey === prefix || cleanKey.startsWith(`${prefix}/`))
        return cleanKey;
    return `${prefix}/${cleanKey}`;
};
exports.withR2ObjectPrefix = withR2ObjectPrefix;
const getR2EndpointConfig = (bucket) => {
    const rawEndpoint = String(process.env.R2_ENDPOINT || '').trim().replace(/\/+$/, '');
    if (!rawEndpoint) {
        return {
            clientEndpoint: undefined,
            publicBaseUrl: '',
        };
    }
    if (!bucket) {
        return {
            clientEndpoint: rawEndpoint,
            publicBaseUrl: rawEndpoint,
        };
    }
    try {
        const url = new URL(rawEndpoint);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const bucketIndex = pathParts.lastIndexOf(bucket);
        if (bucketIndex !== -1) {
            const clientPath = pathParts.slice(0, bucketIndex).join('/');
            const clientEndpoint = `${url.origin}${clientPath ? `/${clientPath}` : ''}`;
            return {
                clientEndpoint,
                publicBaseUrl: rawEndpoint,
            };
        }
    }
    catch {
        // Fall through to plain endpoint behavior.
    }
    return {
        clientEndpoint: rawEndpoint,
        publicBaseUrl: `${rawEndpoint}/${bucket}`,
    };
};
exports.getR2EndpointConfig = getR2EndpointConfig;
const extractR2KeyFromUrl = (value, bucket) => {
    try {
        const url = new URL(value);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const bucketIndex = pathParts.indexOf(bucket);
        if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
            return pathParts.slice(bucketIndex + 1).join('/');
        }
        const endpointConfig = (0, exports.getR2EndpointConfig)(bucket);
        if (endpointConfig.publicBaseUrl && value.startsWith(endpointConfig.publicBaseUrl)) {
            return value.slice(endpointConfig.publicBaseUrl.length).replace(/^\/+/, '') || null;
        }
        const configuredEndpoint = String(process.env.R2_ENDPOINT || '').trim().replace(/\/+$/, '');
        if (configuredEndpoint && value.startsWith(configuredEndpoint)) {
            return value.slice(configuredEndpoint.length).replace(/^\/+/, '') || null;
        }
        return null;
    }
    catch {
        return null;
    }
};
exports.extractR2KeyFromUrl = extractR2KeyFromUrl;
const buildR2PublicUrl = (bucket, key) => {
    const { publicBaseUrl } = (0, exports.getR2EndpointConfig)(bucket);
    return publicBaseUrl ? `${publicBaseUrl}/${key}` : key;
};
exports.buildR2PublicUrl = buildR2PublicUrl;
