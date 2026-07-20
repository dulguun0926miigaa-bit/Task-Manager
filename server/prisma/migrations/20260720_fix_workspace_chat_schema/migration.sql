-- Bring the production database in sync with the workspace chat Prisma models.
-- These statements are intentionally idempotent because some environments were
-- previously updated with `prisma db push`.

ALTER TABLE "activity_logs"
ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "chat_rooms"
ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'PROJECT',
ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

-- Project chat rooms originally required a project. Workspace/private rooms do not.
ALTER TABLE "chat_rooms"
ALTER COLUMN "projectId" DROP NOT NULL;

ALTER TABLE "messages"
ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "chat_members" (
  "id" TEXT NOT NULL,
  "chatRoomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_members_chatRoomId_userId_key"
ON "chat_members"("chatRoomId", "userId");

CREATE TABLE IF NOT EXISTS "message_attachments" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "name" TEXT,
  "mimeType" TEXT,
  "size" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_organizationId_fkey') THEN
    ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_rooms_workspaceId_fkey') THEN
    ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_members_chatRoomId_fkey') THEN
    ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_chatRoomId_fkey"
      FOREIGN KEY ("chatRoomId") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_members_userId_fkey') THEN
    ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_attachments_messageId_fkey') THEN
    ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
