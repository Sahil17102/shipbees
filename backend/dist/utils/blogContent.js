"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareBlogInput = exports.calculateReadTime = exports.sanitizeBlogContent = exports.normalizeBlogSlug = exports.blogInputSchema = exports.BLOG_STATUSES = exports.BLOG_CATEGORIES = void 0;
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const zod_1 = require("zod");
exports.BLOG_CATEGORIES = [
    'Shipping Tips', 'E-commerce', 'Industry News', 'Product Updates', 'Guides',
];
exports.BLOG_STATUSES = ['draft', 'published', 'scheduled', 'archived'];
const optionalText = (max) => zod_1.z.string().trim().max(max).optional().default('');
exports.blogInputSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(3).max(512),
    slug: zod_1.z.string().trim().min(3).max(512),
    excerpt: zod_1.z.string().trim().min(10).max(500),
    content: zod_1.z.string().trim().min(20).max(500000),
    category: zod_1.z.enum(exports.BLOG_CATEGORIES),
    status: zod_1.z.enum(exports.BLOG_STATUSES).default('draft'),
    author_name: zod_1.z.string().trim().min(2).max(160).default('Shipray'),
    author_role: zod_1.z.string().trim().max(160).default('Shipray Editorial Team'),
    featured_image: optionalText(1024),
    featured_image_alt: optionalText(512),
    og_image: optionalText(1024),
    tags: optionalText(1000),
    meta_title: optionalText(200),
    meta_description: optionalText(500),
    focus_keywords: optionalText(512),
    accent_color: zod_1.z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#6C4DFF'),
    is_featured: zod_1.z.boolean().default(false),
    published_at: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
});
const normalizeBlogSlug = (value) => value.trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
exports.normalizeBlogSlug = normalizeBlogSlug;
const sanitizeBlogContent = (content) => (0, sanitize_html_1.default)(content, {
    allowedTags: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4',
        'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'pre', 'code', 'figure',
        'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span',
    ],
    allowedAttributes: {
        a: ['href', 'title', 'target', 'rel'],
        img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
        '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
        a: (_tagName, attribs) => ({
            tagName: 'a',
            attribs: { ...attribs, ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}) },
        }),
    },
});
exports.sanitizeBlogContent = sanitizeBlogContent;
const calculateReadTime = (html) => {
    const text = (0, sanitize_html_1.default)(html, { allowedTags: [], allowedAttributes: {} });
    return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 220));
};
exports.calculateReadTime = calculateReadTime;
const prepareBlogInput = (value) => {
    const parsed = exports.blogInputSchema.parse(value);
    const slug = (0, exports.normalizeBlogSlug)(parsed.slug || parsed.title);
    if (slug.length < 3)
        throw new Error('A valid URL slug is required');
    const content = (0, exports.sanitizeBlogContent)(parsed.content);
    if (!(0, sanitize_html_1.default)(content, { allowedTags: [], allowedAttributes: {} }).trim()) {
        throw new Error('Article content is required');
    }
    const now = new Date();
    let publishedAt = parsed.published_at ? new Date(parsed.published_at) : null;
    if (parsed.status === 'published' && !publishedAt)
        publishedAt = now;
    if (parsed.status === 'draft' || parsed.status === 'archived')
        publishedAt = null;
    if (parsed.status === 'scheduled' && (!publishedAt || publishedAt <= now)) {
        throw new Error('Scheduled articles require a future publication date');
    }
    return {
        ...parsed, slug, content, published_at: publishedAt,
        read_time_minutes: (0, exports.calculateReadTime)(content),
    };
};
exports.prepareBlogInput = prepareBlogInput;
