import { Router } from 'express'
import { BlogController } from '../controllers/blogs.controller'
import { isAdminMiddleware } from '../middlewares/isAdmin'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()
const adminOnly = [requireAuth, isAdminMiddleware]

router.get('/', BlogController.listPublic)
router.get('/categories', BlogController.categories)
router.get('/media', BlogController.media)
router.get('/admin', ...adminOnly, BlogController.listAdmin)
router.get('/admin/stats', ...adminOnly, BlogController.stats)
router.get('/admin/:id', ...adminOnly, BlogController.getAdmin)
router.post('/admin', ...adminOnly, BlogController.create)
router.put('/admin/:id', ...adminOnly, BlogController.update)
router.delete('/admin/:id', ...adminOnly, BlogController.remove)
router.get('/:slug', BlogController.getPublic)

export default router
