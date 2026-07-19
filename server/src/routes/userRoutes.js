import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { discoverPeople, getMe, searchUsers } from '../controllers/userController.js';

const router = Router();

router.get('/me', authenticate, getMe);
router.get('/search', authenticate, searchUsers);
router.get('/discover', authenticate, discoverPeople);

export default router;
