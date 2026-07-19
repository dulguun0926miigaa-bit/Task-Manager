import { env } from '../config/env.js';

export const getCookieOptions = (nodeEnv = env.nodeEnv) => ({
  httpOnly: true,
  secure: nodeEnv === 'production',
  sameSite: nodeEnv === 'production' ? 'none' : 'lax',
  path: '/',
});
