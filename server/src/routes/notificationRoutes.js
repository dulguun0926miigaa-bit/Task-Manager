import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getNotifications, markNotificationsRead } from '../controllers/notificationController.js';

const router = Router();

router.get('/', authenticate, getNotifications);
router.post('/read', authenticate, markNotificationsRead);

export default router;
