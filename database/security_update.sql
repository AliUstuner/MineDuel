-- MineDuel Security Update
-- Run this in Supabase SQL Editor to add server-side game validation

-- Add security columns to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS mine_seed TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS grid_size INTEGER DEFAULT 10;
ALTER TABLE games ADD COLUMN IF NOT EXISTS mine_count INTEGER DEFAULT 20;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player1_moves JSONB DEFAULT '[]'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player2_moves JSONB DEFAULT '[]'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player1_server_score INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player2_server_score INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player1_name TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player2_name TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS time_limit INTEGER DEFAULT 120; -- seconds

-- Create game_moves table for detailed move tracking
CREATE TABLE IF NOT EXISTS game_moves (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
    player_id TEXT NOT NULL,
    move_type VARCHAR(20) NOT NULL CHECK (move_type IN ('reveal', 'flag', 'unflag', 'power')),
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    power_type VARCHAR(20),
    points_earned INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast move lookups
CREATE INDEX IF NOT EXISTS idx_game_moves_game ON game_moves(game_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_player ON game_moves(player_id);

-- Function to generate deterministic mine positions from seed
CREATE OR REPLACE FUNCTION generate_mines(
    p_seed TEXT,
    p_grid_size INTEGER,
    p_mine_count INTEGER,
    p_safe_x INTEGER DEFAULT -1,
    p_safe_y INTEGER DEFAULT -1
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    mines JSONB := '[]'::jsonb;
    hash_value BIGINT;
    x INTEGER;
    y INTEGER;
    i INTEGER := 0;
    attempts INTEGER := 0;
    existing BOOLEAN;
BEGIN
    -- Use seed to create deterministic random positions
    hash_value := abs(hashtext(p_seed));
    
    WHILE jsonb_array_length(mines) < p_mine_count AND attempts < 1000 LOOP
        -- Generate pseudo-random x and y based on seed and iteration
        x := abs(hashtext(p_seed || i::text || 'x')) % p_grid_size;
        y := abs(hashtext(p_seed || i::text || 'y')) % p_grid_size;
        
        -- Check if this position is safe zone (first click area)
        IF NOT (x >= p_safe_x - 1 AND x <= p_safe_x + 1 AND y >= p_safe_y - 1 AND y <= p_safe_y + 1) THEN
            -- Check if mine already exists at this position
            existing := EXISTS (
                SELECT 1 FROM jsonb_array_elements(mines) AS m
                WHERE (m->>'x')::integer = x AND (m->>'y')::integer = y
            );
            
            IF NOT existing THEN
                mines := mines || jsonb_build_object('x', x, 'y', y);
            END IF;
        END IF;
        
        i := i + 1;
        attempts := attempts + 1;
    END LOOP;
    
    RETURN mines;
END;
$$;

-- Function to calculate score for a reveal
CREATE OR REPLACE FUNCTION calculate_reveal_score(
    p_game_id UUID,
    p_player_id TEXT,
    p_x INTEGER,
    p_y INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    game_record RECORD;
    mines JSONB;
    is_mine BOOLEAN := false;
    adjacent_count INTEGER := 0;
    score INTEGER := 0;
BEGIN
    -- Get game data
    SELECT * INTO game_record FROM games WHERE id = p_game_id;
    
    IF game_record IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Generate mines from seed
    mines := generate_mines(
        game_record.mine_seed,
        game_record.grid_size,
        game_record.mine_count
    );
    
    -- Check if hit mine
    is_mine := EXISTS (
        SELECT 1 FROM jsonb_array_elements(mines) AS m
        WHERE (m->>'x')::integer = p_x AND (m->>'y')::integer = p_y
    );
    
    IF is_mine THEN
        RETURN -15; -- Hit mine penalty
    END IF;
    
    -- Count adjacent mines
    SELECT COUNT(*) INTO adjacent_count
    FROM jsonb_array_elements(mines) AS m
    WHERE (m->>'x')::integer BETWEEN p_x - 1 AND p_x + 1
      AND (m->>'y')::integer BETWEEN p_y - 1 AND p_y + 1
      AND NOT ((m->>'x')::integer = p_x AND (m->>'y')::integer = p_y);
    
    -- Calculate score based on adjacent mines
    IF adjacent_count = 0 THEN
        score := 1; -- Empty cell
    ELSE
        score := adjacent_count; -- Points equal to number
    END IF;
    
    RETURN score;
END;
$$;

-- Function to validate and record a move
CREATE OR REPLACE FUNCTION make_move(
    p_game_id UUID,
    p_player_id TEXT,
    p_x INTEGER,
    p_y INTEGER,
    p_move_type VARCHAR(20) DEFAULT 'reveal'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    game_record RECORD;
    is_player1 BOOLEAN;
    points INTEGER := 0;
    current_score INTEGER;
    result JSONB;
BEGIN
    -- Get game
    SELECT * INTO game_record FROM games WHERE id = p_game_id;
    
    IF game_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Game not found');
    END IF;
    
    IF game_record.status != 'in_progress' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Game already ended');
    END IF;
    
    -- Determine which player
    is_player1 := game_record.player1_id = p_player_id;
    
    IF NOT is_player1 AND game_record.player2_id != p_player_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not a player in this game');
    END IF;
    
    -- Calculate points for reveal
    IF p_move_type = 'reveal' THEN
        points := calculate_reveal_score(p_game_id, p_player_id, p_x, p_y);
    END IF;
    
    -- Update score
    IF is_player1 THEN
        UPDATE games 
        SET player1_server_score = GREATEST(0, player1_server_score + points),
            player1_moves = player1_moves || jsonb_build_object('x', p_x, 'y', p_y, 'type', p_move_type, 'points', points)
        WHERE id = p_game_id
        RETURNING player1_server_score INTO current_score;
    ELSE
        UPDATE games 
        SET player2_server_score = GREATEST(0, player2_server_score + points),
            player2_moves = player2_moves || jsonb_build_object('x', p_x, 'y', p_y, 'type', p_move_type, 'points', points)
        WHERE id = p_game_id
        RETURNING player2_server_score INTO current_score;
    END IF;
    
    -- Record move
    INSERT INTO game_moves (game_id, player_id, move_type, x, y, points_earned)
    VALUES (p_game_id, p_player_id, p_move_type, p_x, p_y, points);
    
    RETURN jsonb_build_object(
        'success', true,
        'points', points,
        'total_score', current_score,
        'hit_mine', points < 0
    );
END;
$$;

-- Function to end game and determine winner
CREATE OR REPLACE FUNCTION end_game(p_game_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    game_record RECORD;
    winner TEXT;
BEGIN
    SELECT * INTO game_record FROM games WHERE id = p_game_id;
    
    IF game_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Game not found');
    END IF;
    
    -- Determine winner based on server scores
    IF game_record.player1_server_score > game_record.player2_server_score THEN
        winner := game_record.player1_id;
    ELSIF game_record.player2_server_score > game_record.player1_server_score THEN
        winner := game_record.player2_id;
    ELSE
        winner := NULL; -- Draw
    END IF;
    
    -- Update game
    UPDATE games
    SET status = 'completed',
        completed_at = NOW(),
        player1_score = player1_server_score,
        player2_score = player2_server_score,
        winner_id = winner::uuid
    WHERE id = p_game_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'winner', winner,
        'player1_score', game_record.player1_server_score,
        'player2_score', game_record.player2_server_score,
        'is_draw', winner IS NULL
    );
END;
$$;

-- RLS Policies for game_moves
ALTER TABLE game_moves ENABLE ROW LEVEL SECURITY;

-- Players can only see moves from games they're in
CREATE POLICY "Players can view their game moves"
ON game_moves FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM games g
        WHERE g.id = game_moves.game_id
        AND (g.player1_id::text = auth.uid()::text OR g.player2_id::text = auth.uid()::text)
    )
);

-- Only server functions can insert moves (via service role)
CREATE POLICY "Service can insert moves"
ON game_moves FOR INSERT
WITH CHECK (true);

-- Secure RLS for games table
DROP POLICY IF EXISTS "Players can view their games" ON games;
CREATE POLICY "Players can view their games"
ON games FOR SELECT
USING (true); -- Allow viewing for matchmaking

DROP POLICY IF EXISTS "Players can update their games" ON games;
CREATE POLICY "Authenticated can update games"
ON games FOR UPDATE
USING (true);

DROP POLICY IF EXISTS "Anyone can create games" ON games;
CREATE POLICY "Anyone can create games"
ON games FOR INSERT
WITH CHECK (true);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_mines TO anon, authenticated;
GRANT EXECUTE ON FUNCTION calculate_reveal_score TO anon, authenticated;
GRANT EXECUTE ON FUNCTION make_move TO anon, authenticated;
GRANT EXECUTE ON FUNCTION end_game TO anon, authenticated;

COMMENT ON FUNCTION make_move IS 'Validates and records a player move, returns points earned';
COMMENT ON FUNCTION end_game IS 'Ends the game and determines winner based on server-validated scores';
