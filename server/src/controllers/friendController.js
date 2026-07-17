import { prisma } from '../lib/prisma.js';
import { emitToUser } from '../services/socketService.js';

export const sendFriendRequest = async (req, res, next) => {
  try {
    const { receiverId } = req.body;
    const existing = await prisma.friendRequest.findFirst({ where: { senderId: req.user.id, receiverId } });
    if (existing) {
      return res.status(200).json({ request: existing, message: 'Friend request already exists' });
    }

    const request = await prisma.friendRequest.create({
      data: { senderId: req.user.id, receiverId, status: 'PENDING' },
      include: { sender: { select: { id: true, username: true, avatar: true } } },
    });

    await prisma.notification.create({
      data: {
        userId: receiverId,
        type: 'FRIEND_REQUEST',
        title: 'New friend request',
        message: `${req.user.username} sent you a friend request`,
      },
    });

    emitToUser(receiverId, 'friend-request', { request });
    emitToUser(receiverId, 'notification', { title: 'New friend request', message: `${req.user.username} sent you a friend request` });

    res.status(201).json({ request });
  } catch (error) {
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
    const request = await prisma.friendRequest.findUnique({ where: { id } });
    if (!request || request.receiverId !== req.user.id) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (action === 'accept') {
      await prisma.$transaction([
        prisma.friendRequest.update({ where: { id }, data: { status: 'ACCEPTED' } }),
        prisma.friendship.create({ data: { userAId: req.user.id, userBId: request.senderId } }),
      ]);
      await prisma.notification.create({
        data: {
          userId: request.senderId,
          type: 'FRIEND_ACCEPTED',
          title: 'Friend request accepted',
          message: `${req.user.username} accepted your friend request`,
        },
      });
      emitToUser(request.senderId, 'friend-accepted', { message: 'accepted' });
      emitToUser(request.senderId, 'notification', { title: 'Friend request accepted', message: `${req.user.username} accepted your friend request` });
    } else {
      await prisma.friendRequest.update({ where: { id }, data: { status: 'REJECTED' } });
    }

    res.json({ message: 'Request updated' });
  } catch (error) {
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
