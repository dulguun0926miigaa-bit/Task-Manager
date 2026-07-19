-- Migration: add type column to chat_rooms
ALTER TABLE chat_rooms
ADD COLUMN IF NOT EXISTS "type" varchar NOT NULL DEFAULT 'PROJECT';
