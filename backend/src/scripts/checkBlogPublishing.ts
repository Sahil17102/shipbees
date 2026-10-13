import assert from 'node:assert/strict'
import { calculateReadTime, normalizeBlogSlug, prepareBlogInput, sanitizeBlogContent } from '../utils/blogContent'

assert.equal(normalizeBlogSlug('  Better Shipping, Today! '), 'better-shipping-today')
assert.equal(calculateReadTime('<p>Short article</p>'), 1)
assert.equal(sanitizeBlogContent('<p>Hello</p><script>alert(1)</script>'), '<p>Hello</p>')
const draft = prepareBlogInput({
  title: 'A complete shipping guide', slug: 'A Complete Shipping Guide',
  excerpt: 'A useful excerpt for shipping teams.',
  content: '<h2>Start here</h2><p>Useful article content for sellers.</p>',
  category: 'Guides', status: 'draft', author_name: 'Shipray',
  author_role: 'Editorial Team', is_featured: false, accent_color: '#6C4DFF',
})
assert.equal(draft.status, 'draft')
assert.equal(draft.published_at, null)
assert.equal(draft.slug, 'a-complete-shipping-guide')
const published = prepareBlogInput({ ...draft, status: 'published', published_at: null })
assert.equal(published.status, 'published')
assert.ok(published.published_at instanceof Date)
assert.throws(() => prepareBlogInput({ ...draft, status: 'scheduled', published_at: new Date(0).toISOString() }))
console.log('Blog publishing checks passed.')
