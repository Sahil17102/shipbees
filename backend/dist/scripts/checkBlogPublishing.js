"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const blogContent_1 = require("../utils/blogContent");
strict_1.default.equal((0, blogContent_1.normalizeBlogSlug)('  Better Shipping, Today! '), 'better-shipping-today');
strict_1.default.equal((0, blogContent_1.calculateReadTime)('<p>Short article</p>'), 1);
strict_1.default.equal((0, blogContent_1.sanitizeBlogContent)('<p>Hello</p><script>alert(1)</script>'), '<p>Hello</p>');
const draft = (0, blogContent_1.prepareBlogInput)({
    title: 'A complete shipping guide', slug: 'A Complete Shipping Guide',
    excerpt: 'A useful excerpt for shipping teams.',
    content: '<h2>Start here</h2><p>Useful article content for sellers.</p>',
    category: 'Guides', status: 'draft', author_name: 'Shipray',
    author_role: 'Editorial Team', is_featured: false, accent_color: '#6C4DFF',
});
strict_1.default.equal(draft.status, 'draft');
strict_1.default.equal(draft.published_at, null);
strict_1.default.equal(draft.slug, 'a-complete-shipping-guide');
const published = (0, blogContent_1.prepareBlogInput)({ ...draft, status: 'published', published_at: null });
strict_1.default.equal(published.status, 'published');
strict_1.default.ok(published.published_at instanceof Date);
strict_1.default.throws(() => (0, blogContent_1.prepareBlogInput)({ ...draft, status: 'scheduled', published_at: new Date(0).toISOString() }));
console.log('Blog publishing checks passed.');
