"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlogController = void 0;
const zod_1 = require("zod");
const blog_service_1 = require("../models/services/blog.service");
const upload_service_1 = require("../models/services/upload.service");
const blogContent_1 = require("../utils/blogContent");
const parseId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};
const imageUrl = (req, value) => {
    if (!value)
        return null;
    if (/^https?:\/\//i.test(value))
        return value;
    return `${req.protocol}://${req.get('host')}/api/blogs/media?key=${encodeURIComponent(value)}`;
};
const serializePublic = (req, blog) => ({
    id: blog.id, title: blog.title, slug: blog.slug, excerpt: blog.excerpt,
    content: blog.content, category: blog.category, tags: blog.tags,
    cover_image_url: imageUrl(req, blog.og_image || blog.featured_image),
    featured_image_alt: blog.featured_image_alt, meta_title: blog.meta_title,
    meta_description: blog.meta_description, author_name: blog.author_name,
    author_role: blog.author_role, read_time_minutes: blog.read_time_minutes,
    accent_color: blog.accent_color, is_featured: blog.is_featured,
    published_at: blog.published_at, updated_at: blog.updated_at,
});
const handleError = (error, res, next) => {
    if (error instanceof zod_1.ZodError) {
        return res.status(400).json({
            message: 'Please correct the highlighted fields.', errors: error.flatten().fieldErrors,
        });
    }
    if (error instanceof Error && /slug|required|Scheduled/i.test(error.message)) {
        return res.status(400).json({ message: error.message });
    }
    if (error?.code === '23505')
        return res.status(409).json({ message: 'This URL slug is already in use.' });
    return next(error);
};
exports.BlogController = {
    async create(req, res, next) {
        try {
            return res.status(201).json({ data: await blog_service_1.BlogService.create(req.body) });
        }
        catch (error) {
            return handleError(error, res, next);
        }
    },
    async update(req, res, next) {
        const id = parseId(req.params.id);
        if (!id)
            return res.status(400).json({ message: 'Invalid blog ID.' });
        try {
            const row = await blog_service_1.BlogService.update(id, req.body);
            return row ? res.json({ data: row }) : res.status(404).json({ message: 'Blog not found.' });
        }
        catch (error) {
            return handleError(error, res, next);
        }
    },
    async remove(req, res, next) {
        const id = parseId(req.params.id);
        if (!id)
            return res.status(400).json({ message: 'Invalid blog ID.' });
        try {
            const row = await blog_service_1.BlogService.remove(id);
            return row ? res.status(204).send() : res.status(404).json({ message: 'Blog not found.' });
        }
        catch (error) {
            return next(error);
        }
    },
    async listPublic(req, res, next) {
        try {
            const result = await blog_service_1.BlogService.listPublic(req.query, {
                page: Number(req.query.page), limit: Number(req.query.limit),
            });
            res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
            return res.json({ ...result, data: result.rows.map((row) => serializePublic(req, row)) });
        }
        catch (error) {
            return next(error);
        }
    },
    async listAdmin(req, res, next) {
        try {
            const result = await blog_service_1.BlogService.listAdmin(req.query, {
                page: Number(req.query.page), limit: Number(req.query.limit || req.query.perPage),
            });
            return res.json({ ...result, data: result.rows });
        }
        catch (error) {
            return next(error);
        }
    },
    async stats(_req, res, next) {
        try {
            return res.json({ data: await blog_service_1.BlogService.getStats() });
        }
        catch (error) {
            return next(error);
        }
    },
    async getAdmin(req, res, next) {
        const id = parseId(req.params.id);
        if (!id)
            return res.status(400).json({ message: 'Invalid blog ID.' });
        try {
            const row = await blog_service_1.BlogService.getAdmin(id);
            return row ? res.json({ data: row }) : res.status(404).json({ message: 'Blog not found.' });
        }
        catch (error) {
            return next(error);
        }
    },
    async getPublic(req, res, next) {
        try {
            const row = await blog_service_1.BlogService.getPublic(req.params.slug);
            if (!row)
                return res.status(404).json({ message: 'Blog not found.' });
            res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
            return res.json({ data: serializePublic(req, row) });
        }
        catch (error) {
            return next(error);
        }
    },
    categories(_req, res) { return res.json({ data: blogContent_1.BLOG_CATEGORIES }); },
    async media(req, res, next) {
        try {
            const key = (0, upload_service_1.normalizeR2ObjectKey)(String(req.query.key || ''));
            if (!key || !/(^|\/)blogs\//.test(key))
                return res.status(400).json({ message: 'Invalid blog image.' });
            const url = await (0, upload_service_1.presignDownload)(key, { checkExists: true });
            if (!url || Array.isArray(url))
                return res.status(404).json({ message: 'Image not found.' });
            res.set('Cache-Control', 'public, max-age=300');
            return res.redirect(302, url);
        }
        catch (error) {
            return next(error);
        }
    },
};
