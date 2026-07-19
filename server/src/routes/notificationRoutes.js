import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { deleteNotification, getNotifications, markNotificationRead, markNotificationsRead } from '../controllers/notificationController.js';

const router = Router();

router.get('/', authenticate, getNotifications);
router.post('/read', authenticate, markNotificationsRead);
router.post('/:id/read', authenticate, markNotificationRead);
router.delete('/:id', authenticate, deleteNotification);

export default router;
