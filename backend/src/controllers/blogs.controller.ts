import { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { BlogService } from '../models/services/blog.service'
import { normalizeR2ObjectKey, presignDownload } from '../models/services/upload.service'
import { BLOG_CATEGORIES } from '../utils/blogContent'

const parseId = (value: string) => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}
const imageUrl = (req: Request, value?: string | null) => {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  return `${req.protocol}://${req.get('host')}/api/blogs/media?key=${encodeURIComponent(value)}`
}
const serializePublic = (req: Request, blog: any) => ({
  id: blog.id, title: blog.title, slug: blog.slug, excerpt: blog.excerpt,
  content: blog.content, category: blog.category, tags: blog.tags,
  cover_image_url: imageUrl(req, blog.og_image || blog.featured_image),
  featured_image_alt: blog.featured_image_alt, meta_title: blog.meta_title,
  meta_description: blog.meta_description, author_name: blog.author_name,
  author_role: blog.author_role, read_time_minutes: blog.read_time_minutes,
  accent_color: blog.accent_color, is_featured: blog.is_featured,
  published_at: blog.published_at, updated_at: blog.updated_at,
})
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: 'Please correct the highlighted fields.', errors: error.flatten().fieldErrors,
    })
  }
  if (error instanceof Error && /slug|required|Scheduled/i.test(error.message)) {
    return res.status(400).json({ message: error.message })
  }
  if ((error as any)?.code === '23505') return res.status(409).json({ message: 'This URL slug is already in use.' })
  return next(error)
}

export const BlogController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try { return res.status(201).json({ data: await BlogService.create(req.body) }) }
    catch (error) { return handleError(error, res, next) }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ message: 'Invalid blog ID.' })
    try {
      const row = await BlogService.update(id, req.body)
      return row ? res.json({ data: row }) : res.status(404).json({ message: 'Blog not found.' })
    } catch (error) { return handleError(error, res, next) }
  },
  async remove(req: Request, res: Response, next: NextFunction) {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ message: 'Invalid blog ID.' })
    try {
      const row = await BlogService.remove(id)
      return row ? res.status(204).send() : res.status(404).json({ message: 'Blog not found.' })
    } catch (error) { return next(error) }
  },
  async listPublic(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await BlogService.listPublic(req.query, {
        page: Number(req.query.page), limit: Number(req.query.limit),
      })
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
      return res.json({ ...result, data: result.rows.map((row) => serializePublic(req, row)) })
    } catch (error) { return next(error) }
  },
  async listAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await BlogService.listAdmin(req.query, {
        page: Number(req.query.page), limit: Number(req.query.limit || req.query.perPage),
      })
      return res.json({ ...result, data: result.rows })
    } catch (error) { return next(error) }
  },
  async stats(_req: Request, res: Response, next: NextFunction) {
    try { return res.json({ data: await BlogService.getStats() }) }
    catch (error) { return next(error) }
  },
  async getAdmin(req: Request, res: Response, next: NextFunction) {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ message: 'Invalid blog ID.' })
    try {
      const row = await BlogService.getAdmin(id)
      return row ? res.json({ data: row }) : res.status(404).json({ message: 'Blog not found.' })
    } catch (error) { return next(error) }
  },
  async getPublic(req: Request, res: Response, next: NextFunction) {
    try {
      const row = await BlogService.getPublic(req.params.slug)
      if (!row) return res.status(404).json({ message: 'Blog not found.' })
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
      return res.json({ data: serializePublic(req, row) })
    } catch (error) { return next(error) }
  },
  categories(_req: Request, res: Response) { return res.json({ data: BLOG_CATEGORIES }) },
  async media(req: Request, res: Response, next: NextFunction) {
    try {
      const key = normalizeR2ObjectKey(String(req.query.key || ''))
      if (!key || !/(^|\/)blogs\//.test(key)) return res.status(400).json({ message: 'Invalid blog image.' })
      const url = await presignDownload(key, { checkExists: true })
      if (!url || Array.isArray(url)) return res.status(404).json({ message: 'Image not found.' })
      res.set('Cache-Control', 'public, max-age=300')
      return res.redirect(302, url)
    } catch (error) { return next(error) }
  },
}
