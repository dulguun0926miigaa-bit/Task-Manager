import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signAccessToken = (payload) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: '15m' });

export const signRefreshToken = (payload) =>
  jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: '7d' });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret);

export const verifyRefreshToken = (token) => jwt.verify(token, env.jwtRefreshSecret);
