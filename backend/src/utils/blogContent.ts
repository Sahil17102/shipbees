import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'

export const BLOG_CATEGORIES = [
  'Shipping Tips', 'E-commerce', 'Industry News', 'Product Updates', 'Guides',
] as const
export const BLOG_STATUSES = ['draft', 'published', 'scheduled', 'archived'] as const

const optionalText = (max: number) => z.string().trim().max(max).optional().default('')

export const blogInputSchema = z.object({
  title: z.string().trim().min(3).max(512),
  slug: z.string().trim().min(3).max(512),
  excerpt: z.string().trim().min(10).max(500),
  content: z.string().trim().min(20).max(500_000),
  category: z.enum(BLOG_CATEGORIES),
  status: z.enum(BLOG_STATUSES).default('draft'),
  author_name: z.string().trim().min(2).max(160).default('Shipray'),
  author_role: z.string().trim().max(160).default('Shipray Editorial Team'),
  featured_image: optionalText(1024),
  featured_image_alt: optionalText(512),
  og_image: optionalText(1024),
  tags: optionalText(1000),
  meta_title: optionalText(200),
  meta_description: optionalText(500),
  focus_keywords: optionalText(512),
  accent_color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#6C4DFF'),
  is_featured: z.boolean().default(false),
  published_at: z.string().datetime({ offset: true }).nullable().optional(),
})

export const normalizeBlogSlug = (value: string) => value.trim().toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

export const sanitizeBlogContent = (content: string) => sanitizeHtml(content, {
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
})

export const calculateReadTime = (html: string) => {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 220))
}

export const prepareBlogInput = (value: unknown) => {
  const parsed = blogInputSchema.parse(value)
  const slug = normalizeBlogSlug(parsed.slug || parsed.title)
  if (slug.length < 3) throw new Error('A valid URL slug is required')
  const content = sanitizeBlogContent(parsed.content)
  if (!sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} }).trim()) {
    throw new Error('Article content is required')
  }

  const now = new Date()
  let publishedAt = parsed.published_at ? new Date(parsed.published_at) : null
  if (parsed.status === 'published' && !publishedAt) publishedAt = now
  if (parsed.status === 'draft' || parsed.status === 'archived') publishedAt = null
  if (parsed.status === 'scheduled' && (!publishedAt || publishedAt <= now)) {
    throw new Error('Scheduled articles require a future publication date')
  }

  return {
    ...parsed, slug, content, published_at: publishedAt,
    read_time_minutes: calculateReadTime(content),
  }
}
