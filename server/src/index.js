import { createServer } from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { initSocket } from './services/socketService.js';
import { prisma } from './lib/prisma.js';

const ensureColumn = async ({ tableName, columnName, columnDefinition }) => {
  const result = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = ${tableName} AND column_name = ${columnName}
  `;

  if (!result || result.length === 0) {
    console.log(`[DB FIX] \`${columnName}\` column missing on ${tableName}, adding...`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS "${columnName}" ${columnDefinition}`);
    console.log(`[DB FIX] \`${columnName}\` column added successfully to ${tableName}`);
  } else {
    console.log(`[DB FIX] \`${columnName}\` column already exists on ${tableName}`);
  }
};

const ensureDatabaseSchemaCompatibility = async () => {
  try {
    await ensureColumn({ tableName: 'chat_rooms', columnName: 'type', columnDefinition: 'varchar NOT NULL DEFAULT \'PROJECT\'' });
    await ensureColumn({ tableName: 'chat_rooms', columnName: 'workspaceId', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'pinnedAt', columnDefinition: 'timestamp(3) NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'editedAt', columnDefinition: 'timestamp(3) NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'deletedAt', columnDefinition: 'timestamp(3) NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'imageUrl', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'fileUrl', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'fileName', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'fileType', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'fileSize', columnDefinition: 'integer NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'replyToId', columnDefinition: 'varchar NULL' });
  } catch (err) {
    console.error('[DB FIX] error ensuring schema compatibility:', err?.message || err);
  }
};

const server = createServer(app);
initSocket(server);

// Run DB fix before starting server (best-effort, idempotent)
(async () => {
  try {
    await ensureDatabaseSchemaCompatibility();
  } catch (error) {
    console.error('[STARTUP] DB fix failed:', error?.message || error);
  }

  server.listen(env.port, () => {
    console.log(`TaskFlow Pro API listening on port ${env.port}`);
  });
})();
