import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getMe, searchUsers } from '../controllers/userController.js';

const router = Router();

router.get('/me', authenticate, getMe);
router.get('/search', authenticate, searchUsers);

export default router;
