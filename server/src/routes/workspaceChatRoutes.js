import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  createChatMessage,
  createPrivateChatRoom,
  createProjectChatRoom,
  createWorkspaceChatRoom,
  deleteChatMessage,
  getChatMessages,
  getChatPresence,
  getChatRooms,
  joinChatRoom,
  leaveChatRoom,
  markChatRead,
  reactToChatMessage,
  stopTypingChatMessage,
  typingChatMessage,
  updateChatMessage,
} from '../controllers/workspaceChatController.js';

const router = Router();

router.get('/rooms', authenticate, getChatRooms);
router.get('/rooms/presence', authenticate, getChatPresence);
router.post('/rooms/private', authenticate, createPrivateChatRoom);
router.post('/rooms/workspace', authenticate, createWorkspaceChatRoom);
router.post('/rooms/project', authenticate, createProjectChatRoom);
router.post('/rooms/:roomId/join', authenticate, joinChatRoom);
router.post('/rooms/:roomId/leave', authenticate, leaveChatRoom);
router.get('/rooms/:roomId/messages', authenticate, getChatMessages);
router.post('/rooms/:roomId/messages', authenticate, createChatMessage);
router.put('/rooms/:roomId/messages/:messageId', authenticate, updateChatMessage);
router.delete('/rooms/:roomId/messages/:messageId', authenticate, deleteChatMessage);
router.post('/rooms/:roomId/messages/:messageId/read', authenticate, markChatRead);
router.post('/rooms/:roomId/messages/:messageId/reactions', authenticate, reactToChatMessage);
router.post('/rooms/:roomId/typing', authenticate, typingChatMessage);
router.post('/rooms/:roomId/stop-typing', authenticate, stopTypingChatMessage);

export default router;
