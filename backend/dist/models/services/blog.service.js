"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlogService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const blogContent_1 = require("../../utils/blogContent");
const client_1 = require("../client");
const blogs_1 = require("../schema/blogs");
const pagination = (pageValue, limitValue) => ({
    page: Math.max(1, Number(pageValue) || 1),
    limit: Math.min(100, Math.max(1, Number(limitValue) || 10)),
});
const isPublished = () => (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(blogs_1.blogs.status, 'published'), (0, drizzle_orm_1.lte)(blogs_1.blogs.published_at, new Date()));
exports.BlogService = {
    async create(data) {
        const [row] = await client_1.db.insert(blogs_1.blogs).values((0, blogContent_1.prepareBlogInput)(data)).returning();
        return row;
    },
    async update(id, data) {
        const [row] = await client_1.db.update(blogs_1.blogs)
            .set({ ...(0, blogContent_1.prepareBlogInput)(data), updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(blogs_1.blogs.id, id)).returning();
        return row || null;
    },
    async remove(id) {
        const [row] = await client_1.db.delete(blogs_1.blogs).where((0, drizzle_orm_1.eq)(blogs_1.blogs.id, id)).returning({ id: blogs_1.blogs.id });
        return row || null;
    },
    async listAdmin(filters, values) {
        const { page, limit } = pagination(values.page, values.limit);
        const conditions = [];
        if (filters.status)
            conditions.push((0, drizzle_orm_1.eq)(blogs_1.blogs.status, String(filters.status)));
        if (filters.category)
            conditions.push((0, drizzle_orm_1.eq)(blogs_1.blogs.category, String(filters.category)));
        if (filters.is_featured === 'true' || filters.is_featured === 'false') {
            conditions.push((0, drizzle_orm_1.eq)(blogs_1.blogs.is_featured, filters.is_featured === 'true'));
        }
        if (filters.q) {
            const query = `%${String(filters.q).trim()}%`;
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(blogs_1.blogs.title, query), (0, drizzle_orm_1.ilike)(blogs_1.blogs.slug, query), (0, drizzle_orm_1.ilike)(blogs_1.blogs.author_name, query)));
        }
        const where = conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const rows = await client_1.db.select().from(blogs_1.blogs).where(where)
            .orderBy((0, drizzle_orm_1.desc)(blogs_1.blogs.updated_at)).limit(limit).offset((page - 1) * limit);
        const [{ count }] = await client_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(blogs_1.blogs).where(where);
        return { rows, total: Number(count), page, limit };
    },
    async listPublic(filters, values) {
        const { page, limit } = pagination(values.page, values.limit);
        const conditions = [isPublished()];
        if (filters.category)
            conditions.push((0, drizzle_orm_1.eq)(blogs_1.blogs.category, String(filters.category)));
        if (filters.featured === 'true')
            conditions.push((0, drizzle_orm_1.eq)(blogs_1.blogs.is_featured, true));
        if (filters.q) {
            const query = `%${String(filters.q).trim()}%`;
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(blogs_1.blogs.title, query), (0, drizzle_orm_1.ilike)(blogs_1.blogs.excerpt, query)));
        }
        const where = (0, drizzle_orm_1.and)(...conditions);
        const rows = await client_1.db.select().from(blogs_1.blogs).where(where)
            .orderBy((0, drizzle_orm_1.desc)(blogs_1.blogs.is_featured), (0, drizzle_orm_1.desc)(blogs_1.blogs.published_at))
            .limit(limit).offset((page - 1) * limit);
        const [{ count }] = await client_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(blogs_1.blogs).where(where);
        return { rows, total: Number(count), page, limit };
    },
    async getAdmin(id) {
        const [row] = await client_1.db.select().from(blogs_1.blogs).where((0, drizzle_orm_1.eq)(blogs_1.blogs.id, id));
        return row || null;
    },
    async getPublic(slug) {
        const [row] = await client_1.db.select().from(blogs_1.blogs).where((0, drizzle_orm_1.and)(isPublished(), (0, drizzle_orm_1.eq)(blogs_1.blogs.slug, slug)));
        return row || null;
    },
    async getStats() {
        const [row] = await client_1.db.select({
            total: (0, drizzle_orm_1.sql) `count(*)`,
            published: (0, drizzle_orm_1.sql) `count(*) filter (where ${blogs_1.blogs.status} = 'published')`,
            drafts: (0, drizzle_orm_1.sql) `count(*) filter (where ${blogs_1.blogs.status} = 'draft')`,
            featured: (0, drizzle_orm_1.sql) `count(*) filter (where ${blogs_1.blogs.is_featured} = true)`,
        }).from(blogs_1.blogs);
        return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
    },
};
