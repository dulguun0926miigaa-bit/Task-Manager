import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { signAccessToken, signRefreshToken } from '../utils/jwt.js';

export const authService = {
  async register(input) {
    const existing = await prisma.user.findFirst({ where: { OR: [{ email: input.email }, { username: input.username }] } });
    if (existing) {
      const error = new Error('User already exists');
      error.statusCode = 409;
      throw error;
    }

    const password = await bcrypt.hash(input.password, 12);
    return prisma.user.create({
      data: { username: input.username, email: input.email, password },
      select: { id: true, username: true, email: true, avatar: true, bio: true, createdAt: true },
    });
  },

  async login(input) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    const valid = await bcrypt.compare(input.password, user.password);
    if (!valid) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    const accessToken = signAccessToken({ id: user.id, email: user.email });
    const refreshToken = signRefreshToken({ id: user.id });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, bio: user.bio },
    };
  },

  async logout(userId) {
    await prisma.user.updateMany({ where: { id: userId }, data: { refreshToken: null } });
  },
};
