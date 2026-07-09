import { prisma } from '../lib/prisma.js';

export const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, email: true, avatar: true, bio: true, createdAt: true, isAdmin: true },
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const term = req.query.q?.toString() || '';
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user.id } },
          {
            OR: [
              { username: { contains: term } },
              { email: { contains: term } },
            ],
          },
        ],
      },
      select: { id: true, username: true, email: true, avatar: true, bio: true },
      take: 20,
    });
    res.json({ users });
  } catch (error) {
    next(error);
  }
};
