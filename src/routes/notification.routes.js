import { Router } from 'express';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { getNotifications, markAllAsRead, markAsRead } from '../controllers/notification.controller.js';

const router = Router();

// Protect all notification routes
router.use(verifyJWT);

router.get('/', getNotifications);
router.put('/read/all', markAllAsRead);
router.put('/read/:id', markAsRead);

export default router;
