export const errorHandler = (err, _req, res, _next) => {
  console.error(err);

  if (err?.statusCode) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  if (err?.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
    return res.status(409).json({ message: `Unique constraint failed on the fields: (${target})` });
  }

  if (err?.code === 'P2025') {
    return res.status(404).json({ message: err.message || 'Resource not found' });
  }

  const lowerMessage = String(err?.message || '').toLowerCase();
  if (lowerMessage.includes('not authorized') || lowerMessage.includes('unauthorized')) {
    return res.status(403).json({ message: err.message || 'Forbidden' });
  }
  if (lowerMessage.includes('not found') || lowerMessage.includes('could not find')) {
    return res.status(404).json({ message: err.message || 'Not found' });
  }
  if (lowerMessage.includes('required') || lowerMessage.includes('missing')) {
    return res.status(400).json({ message: err.message || 'Bad request' });
  }

  res.status(500).json({
    message: err.message || 'Internal server error',
  });
};
