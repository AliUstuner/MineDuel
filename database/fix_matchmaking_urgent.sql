-- URGENT FIX: Enable matchmaking for all users
-- Run this in Supabase SQL Editor IMMEDIATELY

-- Step 1: Clear stuck entries in queue
DELETE FROM matchmaking_queue WHERE created_at < NOW() - INTERVAL '10 minutes';
DELETE FROM matchmaking_queue WHERE status != 'waiting';

-- Step 2: Fix RLS for matchmaking_queue
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all matchmaking operations" ON matchmaking_queue;
DROP POLICY IF EXISTS "Enable read access for all users" ON matchmaking_queue;
DROP POLICY IF EXISTS "Enable insert for all users" ON matchmaking_queue;
DROP POLICY IF EXISTS "Enable update for all users" ON matchmaking_queue;
DROP POLICY IF EXISTS "Enable delete for all users" ON matchmaking_queue;

-- Create a single permissive policy
CREATE POLICY "Allow all matchmaking operations" ON matchmaking_queue
    FOR ALL 
    TO anon, authenticated
    USING (true) 
    WITH CHECK (true);

-- Step 3: Grant permissions
GRANT ALL ON matchmaking_queue TO anon;
GRANT ALL ON matchmaking_queue TO authenticated;

-- Step 4: Fix games table RLS
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all game operations" ON games;
CREATE POLICY "Allow all game operations" ON games
    FOR ALL 
    TO anon, authenticated
    USING (true) 
    WITH CHECK (true);

GRANT ALL ON games TO anon;
GRANT ALL ON games TO authenticated;

-- Step 5: Verify matchmaking_queue is accessible
SELECT COUNT(*) as queue_count FROM matchmaking_queue;

-- Step 6: Test insert (should work)
-- INSERT INTO matchmaking_queue (user_id, username, difficulty, status) 
-- VALUES ('test_user', 'TestPlayer', 'medium', 'waiting');
-- DELETE FROM matchmaking_queue WHERE user_id = 'test_user';
