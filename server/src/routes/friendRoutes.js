import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getFriendRequests, getFriends, respondToFriendRequest, sendFriendRequest } from '../controllers/friendController.js';

const router = Router();

router.get('/requests', authenticate, getFriendRequests);
router.post('/requests', authenticate, sendFriendRequest);
router.post('/requests/:id/respond', authenticate, respondToFriendRequest);
router.get('/', authenticate, getFriends);

export default router;
