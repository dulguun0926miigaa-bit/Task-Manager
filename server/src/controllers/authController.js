import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { normalizeEmail } from '../utils/authUtils.js';
import { getCookieOptions } from '../utils/cookies.js';
import { getRefreshTokenFromRequest } from '../utils/authRequest.js';

export const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const existing = await prisma.user.findFirst({ where: { OR: [{ email: normalizedEmail }, { username }] } });
    if (existing) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, email: normalizedEmail, password: hashedPassword },
      select: { id: true, username: true, email: true, avatar: true, bio: true, createdAt: true },
    });

    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;
    const normalizedEmail = normalizeEmail(email);
    console.log('[AUTH] Login attempt:', { normalizedEmail, hasPassword: Boolean(password) });
    
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      console.log('[AUTH] User not found:', normalizedEmail);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.log('[AUTH] Password mismatch for:', normalizedEmail);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('[AUTH] Login successful for:', normalizedEmail);
    const accessToken = signAccessToken({ id: user.id, email: user.email });
    const refreshToken = signRefreshToken({ id: user.id });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('refreshToken', refreshToken, {
      ...getCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie('accessToken', accessToken, {
      ...getCookieOptions(),
      maxAge: 15 * 60 * 1000,
    });

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, bio: user.bio },
      rememberMe: Boolean(rememberMe),
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error?.message, error?.stack);
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    console.log('[AUTH] Refresh attempt:', { hasToken: Boolean(refreshToken), source: refreshToken ? 'request' : 'none' });
    
    if (!refreshToken) {
      console.log('[AUTH] No refresh token in request');
      return res.status(401).json({ message: 'Authentication required' });
    }

    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || user.refreshToken !== refreshToken) {
      console.log('[AUTH] Invalid or mismatched refresh token');
      return res.status(401).json({ message: 'Invalid token' });
    }

    console.log('[AUTH] Refresh successful for userId:', payload.id);
    const accessToken = signAccessToken({ id: user.id, email: user.email });
    res.cookie('accessToken', accessToken, {
      ...getCookieOptions(),
      maxAge: 15 * 60 * 1000,
    });

    res.json({ accessToken, refreshToken, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, bio: user.bio } });
  } catch (error) {
    console.error('[AUTH] Refresh error:', error?.message, error?.stack);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const logout = async (req, res, next) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      await prisma.user.updateMany({ where: { id: payload.id }, data: { refreshToken: null } });
    }
    res.clearCookie('refreshToken', getCookieOptions());
    res.clearCookie('accessToken', getCookieOptions());
    res.json({ message: 'Logged out' });
  } catch (error) {
    next(error);
  }
};
