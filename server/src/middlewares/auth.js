import { prisma } from '../lib/prisma.js';
import { signAccessToken, verifyAccessToken, verifyRefreshToken } from '../utils/jwt.js';
import { getCookieOptions } from '../utils/cookies.js';
import { getRefreshTokenFromRequest } from '../utils/authRequest.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.id } });
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      req.user = user;
      return next();
    } catch (accessError) {
      const refreshToken = getRefreshTokenFromRequest(req);
      if (!refreshToken) {
        return res.status(401).json({ message: 'Invalid token' });
      }

      try {
        const payload = verifyRefreshToken(refreshToken);
        const user = await prisma.user.findUnique({ where: { id: payload.id } });
        if (!user || user.refreshToken !== refreshToken) {
          return res.status(401).json({ message: 'Invalid token' });
        }

        const newAccessToken = signAccessToken({ id: user.id, email: user.email });
        res.cookie('accessToken', newAccessToken, {
          ...getCookieOptions(),
          maxAge: 15 * 60 * 1000,
        });

        req.user = user;
        req.newAccessToken = newAccessToken;
        res.setHeader('x-access-token', newAccessToken);
        return next();
      } catch (refreshError) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    }
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
