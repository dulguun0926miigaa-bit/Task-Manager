import { createServer } from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { initSocket } from './services/socketService.js';
import { prisma } from './lib/prisma.js';

// Ensure production DB has the `type` column on chat_rooms (idempotent)
const ensureChatRoomsTypeColumn = async () => {
  try {
    // Only run for Postgres-like DBs
    const result = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'chat_rooms' AND column_name = 'type'
    `;

    if (!result || result.length === 0) {
      console.log('[DB FIX] `type` column missing on chat_rooms, adding...');
      await prisma.$executeRawUnsafe(
        'ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS "type" varchar NOT NULL DEFAULT \'PROJECT\''
      );
      console.log('[DB FIX] `type` column added successfully');
    } else {
      console.log('[DB FIX] `type` column already exists on chat_rooms');
    }
    
    // Ensure workspaceId column exists (nullable)
    const workspaceCol = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'chat_rooms' AND column_name = 'workspaceId'
    `;
    if (!workspaceCol || workspaceCol.length === 0) {
      console.log('[DB FIX] `workspaceId` column missing on chat_rooms, adding...');
      await prisma.$executeRawUnsafe(
        'ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS "workspaceId" varchar NULL'
      );
      console.log('[DB FIX] `workspaceId` column added successfully');
    } else {
      console.log('[DB FIX] `workspaceId` column already exists on chat_rooms');
    }
  } catch (err) {
    console.error('[DB FIX] error ensuring chat_rooms.type column:', err?.message || err);
  }
};

const server = createServer(app);
initSocket(server);

// Run DB fix before starting server (best-effort, idempotent)
(async () => {
  try {
    await ensureChatRoomsTypeColumn();
  } catch (error) {
    console.error('[STARTUP] DB fix failed:', error?.message || error);
  }

  server.listen(env.port, () => {
    console.log(`TaskFlow Pro API listening on port ${env.port}`);
  });
})();
