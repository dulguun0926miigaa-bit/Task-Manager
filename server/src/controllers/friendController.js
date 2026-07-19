import { prisma } from '../lib/prisma.js';
import { respondToConnectionRequest, sendConnectionRequest } from '../services/discoverPeopleService.js';

export const sendFriendRequest = async (req, res, next) => {
  try {
    const { receiverId } = req.body;
    if (!receiverId) {
      return res.status(400).json({ message: 'receiverId is required' });
    }

    const request = await sendConnectionRequest({ senderId: req.user.id, receiverId });
    res.status(201).json({ request });
  } catch (error) {
    if (error.message === 'Users are already friends' || error.message === 'A pending or previous request already exists') {
      return res.status(409).json({ message: error.message });
    }
    next(error);
  }
};

export const getFriendRequests = async (req, res, next) => {
  try {
    const requests = await prisma.friendRequest.findMany({
      where: { receiverId: req.user.id, status: 'PENDING' },
      include: { sender: { select: { id: true, username: true, avatar: true } } },
    });
    res.json({ requests });
  } catch (error) {
    next(error);
  }
};

export const respondToFriendRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'action must be accept or reject' });
    }

    const result = await respondToConnectionRequest({ requestId: id, responderId: req.user.id, action });
    res.json(result);
  } catch (error) {
    if (error.message === 'Request not found') {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
};

export const getFriends = async (req, res, next) => {
  try {
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: req.user.id }, { userBId: req.user.id }] },
      include: { userA: { select: { id: true, username: true, avatar: true } }, userB: { select: { id: true, username: true, avatar: true } } },
    });
    const friends = friendships.map((entry) => entry.userAId === req.user.id ? entry.userB : entry.userA);
    res.json({ friends });
  } catch (error) {
    next(error);
  }
};
