-- MineDuel Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    country VARCHAR(2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_online BOOLEAN DEFAULT FALSE,
    CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20)
);

-- Player statistics table
CREATE TABLE IF NOT EXISTS player_stats (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    total_games INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    win_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    rating INTEGER DEFAULT 1000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Games history table
CREATE TABLE IF NOT EXISTS games (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    player1_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    player2_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    duration INTEGER, -- in seconds
    board_state JSONB, -- store final board state
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Matchmaking queue table (supports both registered and guest users)
CREATE TABLE IF NOT EXISTS matchmaking_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    username VARCHAR(50) NOT NULL,
    avatar_url TEXT,
    rating INTEGER DEFAULT 1000,
    difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled')),
    match_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_games_player1 ON games(player1_id);
CREATE INDEX IF NOT EXISTS idx_games_player2 ON games(player2_id);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_player_stats_rating ON player_stats(rating DESC);
CREATE INDEX IF NOT EXISTS idx_player_stats_wins ON player_stats(wins DESC);
CREATE INDEX IF NOT EXISTS idx_matchmaking_difficulty ON matchmaking_queue(difficulty, status);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Player stats policies
CREATE POLICY "Player stats are viewable by everyone"
    ON player_stats FOR SELECT
    USING (true);

CREATE POLICY "System can update player stats"
    ON player_stats FOR UPDATE
    USING (true);

CREATE POLICY "System can insert player stats"
    ON player_stats FOR INSERT
    WITH CHECK (true);

-- Games policies
CREATE POLICY "Games are viewable by everyone"
    ON games FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create games"
    ON games FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Game participants can update games"
    ON games FOR UPDATE
    USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Matchmaking policies
CREATE POLICY "Users can view matchmaking queue"
    ON matchmaking_queue FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can join queue"
    ON matchmaking_queue FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queue entry"
    ON matchmaking_queue FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can leave queue"
    ON matchmaking_queue FOR DELETE
    USING (auth.uid() = user_id);

-- Functions

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for player_stats
CREATE TRIGGER update_player_stats_updated_at
    BEFORE UPDATE ON player_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean old matchmaking entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_matchmaking()
RETURNS void AS $$
BEGIN
    DELETE FROM matchmaking_queue
    WHERE created_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Create a cron job to clean matchmaking queue every 5 minutes (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-matchmaking', '*/5 * * * *', 'SELECT cleanup_old_matchmaking();');
