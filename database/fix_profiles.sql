-- FIX: Remove password_hash requirement and fix RLS for profiles
-- Run this in Supabase SQL Editor

-- Step 1: Check if password_hash column exists and make it nullable
ALTER TABLE profiles 
ALTER COLUMN password_hash DROP NOT NULL;

-- If that fails, the column might not exist or have a different name
-- In that case, just ensure profiles table is correct:

-- Step 2: Drop and recreate RLS policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON profiles;
DROP POLICY IF EXISTS "Enable update for users based on id" ON profiles;
DROP POLICY IF EXISTS "Allow all profile operations" ON profiles;

-- Create permissive policies
CREATE POLICY "Allow all profile operations" ON profiles
    FOR ALL USING (true) WITH CHECK (true);

-- Step 3: Same for player_stats
DROP POLICY IF EXISTS "Allow all stats operations" ON player_stats;
CREATE POLICY "Allow all stats operations" ON player_stats
    FOR ALL USING (true) WITH CHECK (true);

-- Step 4: Same for games
DROP POLICY IF EXISTS "Allow all game operations" ON games;
CREATE POLICY "Allow all game operations" ON games
    FOR ALL USING (true) WITH CHECK (true);

-- Step 5: Verify tables exist with correct structure
-- If profiles has password_hash, remove it
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'password_hash') THEN
        ALTER TABLE profiles DROP COLUMN password_hash;
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles';
