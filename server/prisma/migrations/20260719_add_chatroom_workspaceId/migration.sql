-- Migration: add workspaceId column to chat_rooms
ALTER TABLE chat_rooms
ADD COLUMN IF NOT EXISTS "workspaceId" varchar NULL;
