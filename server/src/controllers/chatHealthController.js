import { prisma } from '../lib/prisma.js';

export const getChatSchemaHealth = async (_req, res) => {
  try {
    const columns = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'chat_rooms'
    `;

    res.json({
      ok: true,
      columns: columns.map((column) => column.column_name),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
};
