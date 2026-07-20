import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { acceptGroupInvitation, addMemberToGroup, archiveGroup, createGroup, deleteGroup, getGroupById, getGroups, inviteToGroup, restoreGroup, updateGroup } from '../controllers/groupController.js';

const router = Router();

router.get('/', authenticate, getGroups);
router.post('/', authenticate, createGroup);
router.post('/invitations/:token/accept', authenticate, acceptGroupInvitation);
router.get('/:id', authenticate, getGroupById);
router.put('/:id', authenticate, updateGroup);
router.post('/:id/archive', authenticate, archiveGroup);
router.post('/:id/restore', authenticate, restoreGroup);
router.post('/:id/invite', authenticate, inviteToGroup);
router.post('/:id/members', authenticate, addMemberToGroup);
router.delete('/:id', authenticate, deleteGroup);

export default router;
