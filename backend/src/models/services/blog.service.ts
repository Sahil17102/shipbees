import { and, desc, eq, ilike, lte, or, sql } from 'drizzle-orm'
import { prepareBlogInput } from '../../utils/blogContent'
import { db } from '../client'
import { blogs } from '../schema/blogs'

const pagination = (pageValue?: number, limitValue?: number) => ({
  page: Math.max(1, Number(pageValue) || 1),
  limit: Math.min(100, Math.max(1, Number(limitValue) || 10)),
})
const isPublished = () => and(eq(blogs.status, 'published'), lte(blogs.published_at, new Date()))

export const BlogService = {
  async create(data: unknown) {
    const [row] = await db.insert(blogs).values(prepareBlogInput(data)).returning()
    return row
  },
  async update(id: number, data: unknown) {
    const [row] = await db.update(blogs)
      .set({ ...prepareBlogInput(data), updated_at: new Date() })
      .where(eq(blogs.id, id)).returning()
    return row || null
  },
  async remove(id: number) {
    const [row] = await db.delete(blogs).where(eq(blogs.id, id)).returning({ id: blogs.id })
    return row || null
  },
  async listAdmin(filters: any, values: { page?: number; limit?: number }) {
    const { page, limit } = pagination(values.page, values.limit)
    const conditions: any[] = []
    if (filters.status) conditions.push(eq(blogs.status, String(filters.status)))
    if (filters.category) conditions.push(eq(blogs.category, String(filters.category)))
    if (filters.is_featured === 'true' || filters.is_featured === 'false') {
      conditions.push(eq(blogs.is_featured, filters.is_featured === 'true'))
    }
    if (filters.q) {
      const query = `%${String(filters.q).trim()}%`
      conditions.push(or(ilike(blogs.title, query), ilike(blogs.slug, query), ilike(blogs.author_name, query)))
    }
    const where = conditions.length ? and(...conditions) : undefined
    const rows = await db.select().from(blogs).where(where)
      .orderBy(desc(blogs.updated_at)).limit(limit).offset((page - 1) * limit)
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(blogs).where(where)
    return { rows, total: Number(count), page, limit }
  },
  async listPublic(filters: any, values: { page?: number; limit?: number }) {
    const { page, limit } = pagination(values.page, values.limit)
    const conditions: any[] = [isPublished()]
    if (filters.category) conditions.push(eq(blogs.category, String(filters.category)))
    if (filters.featured === 'true') conditions.push(eq(blogs.is_featured, true))
    if (filters.q) {
      const query = `%${String(filters.q).trim()}%`
      conditions.push(or(ilike(blogs.title, query), ilike(blogs.excerpt, query)))
    }
    const where = and(...conditions)
    const rows = await db.select().from(blogs).where(where)
      .orderBy(desc(blogs.is_featured), desc(blogs.published_at))
      .limit(limit).offset((page - 1) * limit)
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(blogs).where(where)
    return { rows, total: Number(count), page, limit }
  },
  async getAdmin(id: number) {
    const [row] = await db.select().from(blogs).where(eq(blogs.id, id))
    return row || null
  },
  async getPublic(slug: string) {
    const [row] = await db.select().from(blogs).where(and(isPublished(), eq(blogs.slug, slug)))
    return row || null
  },
  async getStats() {
    const [row] = await db.select({
      total: sql<number>`count(*)`,
      published: sql<number>`count(*) filter (where ${blogs.status} = 'published')`,
      drafts: sql<number>`count(*) filter (where ${blogs.status} = 'draft')`,
      featured: sql<number>`count(*) filter (where ${blogs.is_featured} = true)`,
    }).from(blogs)
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]))
  },
}
