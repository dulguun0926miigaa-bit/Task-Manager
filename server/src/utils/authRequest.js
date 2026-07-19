export const getBearerToken = (req, headerName = 'authorization') => {
  const headers = req?.headers || {};
  const header = headers[headerName] || headers[headerName.toLowerCase()] || '';

  if (Array.isArray(header)) {
    return header[0]?.startsWith('Bearer ') ? header[0].slice(7).trim() : '';
  }

  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  return '';
};

export const getRefreshTokenFromRequest = (req) => {
  const bearerToken = getBearerToken(req, 'authorization');
  if (bearerToken) return bearerToken;

  const bodyToken = req?.body?.refreshToken;
  if (typeof bodyToken === 'string' && bodyToken) return bodyToken;

  const headers = req?.headers || {};
  const headerToken = headers['x-refresh-token'] || headers['x-refresh-token'.toLowerCase()];
  if (typeof headerToken === 'string' && headerToken) return headerToken;

  return req?.cookies?.refreshToken || '';
};
