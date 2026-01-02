-- FIX: Allow guest users in matchmaking queue
-- Run this in Supabase SQL Editor

-- Step 1: Drop the foreign key constraint and change user_id to TEXT
ALTER TABLE matchmaking_queue 
DROP CONSTRAINT IF EXISTS matchmaking_queue_user_id_fkey;

-- Step 2: Change user_id column type to TEXT to support guest_xxx IDs
ALTER TABLE matchmaking_queue 
ALTER COLUMN user_id TYPE TEXT;

-- Step 3: Recreate the unique constraint on user_id
ALTER TABLE matchmaking_queue 
DROP CONSTRAINT IF EXISTS matchmaking_queue_user_id_key;

ALTER TABLE matchmaking_queue 
ADD CONSTRAINT matchmaking_queue_user_id_key UNIQUE (user_id);

-- Step 4: Clear any old/stuck entries
DELETE FROM matchmaking_queue WHERE status != 'waiting' OR created_at < NOW() - INTERVAL '5 minutes';

-- Step 5: Update RLS policies to allow guest access
DROP POLICY IF EXISTS "Allow all matchmaking operations" ON matchmaking_queue;

CREATE POLICY "Allow all matchmaking operations" ON matchmaking_queue
    FOR ALL USING (true) WITH CHECK (true);

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'matchmaking_queue';
