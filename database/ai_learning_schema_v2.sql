-- MineDuel AI Learning Schema v2
-- Enhanced schema for deep learning training data collection
-- Run this in Supabase SQL Editor

-- ==================== GLOBAL BOT LEARNING TABLE ====================
-- Single row containing aggregated learning data for all players

CREATE TABLE IF NOT EXISTS bot_learning_global_v2 (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Version for migrations
    version INTEGER DEFAULT 2,
    
    -- Core Statistics
    total_games INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    total_draws INTEGER DEFAULT 0,
    
    -- Power Effectiveness (0.0 - 1.0)
    freeze_uses INTEGER DEFAULT 0,
    freeze_wins INTEGER DEFAULT 0,
    freeze_effectiveness FLOAT DEFAULT 0.5,
    
    shield_uses INTEGER DEFAULT 0,
    shield_wins INTEGER DEFAULT 0,
    shield_effectiveness FLOAT DEFAULT 0.5,
    
    radar_uses INTEGER DEFAULT 0,
    radar_wins INTEGER DEFAULT 0,
    radar_effectiveness FLOAT DEFAULT 0.5,
    
    safeburst_uses INTEGER DEFAULT 0,
    safeburst_wins INTEGER DEFAULT 0,
    safeburst_effectiveness FLOAT DEFAULT 0.5,
    
    -- Strategy Success Rates
    aggressive_games INTEGER DEFAULT 0,
    aggressive_wins INTEGER DEFAULT 0,
    aggressive_rate FLOAT DEFAULT 0.33,
    
    defensive_games INTEGER DEFAULT 0,
    defensive_wins INTEGER DEFAULT 0,
    defensive_rate FLOAT DEFAULT 0.33,
    
    balanced_games INTEGER DEFAULT 0,
    balanced_wins INTEGER DEFAULT 0,
    balanced_rate FLOAT DEFAULT 0.34,
    
    -- Difficulty-specific stats
    easy_games INTEGER DEFAULT 0,
    easy_wins INTEGER DEFAULT 0,
    medium_games INTEGER DEFAULT 0,
    medium_wins INTEGER DEFAULT 0,
    hard_games INTEGER DEFAULT 0,
    hard_wins INTEGER DEFAULT 0,
    expert_games INTEGER DEFAULT 0,
    expert_wins INTEGER DEFAULT 0,
    
    -- Player Behavior Patterns (moving averages)
    avg_player_score FLOAT DEFAULT 200,
    avg_player_speed FLOAT DEFAULT 5,
    avg_game_duration FLOAT DEFAULT 60000,
    avg_moves_per_game FLOAT DEFAULT 50,
    avg_mines_hit FLOAT DEFAULT 2,
    
    -- Advanced metrics
    avg_deterministic_moves FLOAT DEFAULT 0.7, -- % of moves from deterministic layer
    avg_probabilistic_moves FLOAT DEFAULT 0.25, -- % from probabilistic layer
    avg_emergency_moves FLOAT DEFAULT 0.05, -- % emergency actions
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert singleton row
INSERT INTO bot_learning_global_v2 (id, version) 
VALUES ('00000000-0000-0000-0000-000000000002', 2)
ON CONFLICT (id) DO NOTHING;

-- ==================== GAME SESSIONS TABLE ====================
-- Records each complete game for training

CREATE TABLE IF NOT EXISTS ai_game_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id TEXT UNIQUE NOT NULL,
    
    -- Game Configuration
    grid_size INTEGER NOT NULL DEFAULT 10,
    mine_count INTEGER NOT NULL DEFAULT 15,
    difficulty VARCHAR(20) NOT NULL,
    match_duration INTEGER NOT NULL, -- milliseconds
    
    -- Players
    player_type VARCHAR(20) NOT NULL, -- 'human'
    bot_difficulty VARCHAR(20) NOT NULL, -- 'easy', 'medium', 'hard', 'expert'
    
    -- Results
    winner VARCHAR(20), -- 'player', 'bot', 'draw'
    player_score INTEGER DEFAULT 0,
    bot_score INTEGER DEFAULT 0,
    game_duration INTEGER, -- actual duration in ms
    
    -- Bot Performance
    bot_moves INTEGER DEFAULT 0,
    bot_safe_moves INTEGER DEFAULT 0,
    bot_mines_hit INTEGER DEFAULT 0,
    bot_correct_flags INTEGER DEFAULT 0,
    bot_wrong_flags INTEGER DEFAULT 0,
    
    -- Move Layer Distribution
    deterministic_moves INTEGER DEFAULT 0,
    probabilistic_moves INTEGER DEFAULT 0,
    strategic_moves INTEGER DEFAULT 0, -- powers
    emergency_moves INTEGER DEFAULT 0,
    
    -- Strategy Used
    primary_strategy VARCHAR(20), -- 'aggressive', 'defensive', 'balanced'
    strategy_changes INTEGER DEFAULT 0,
    
    -- Power Usage
    powers_used JSONB DEFAULT '{}',
    
    -- Quality Score (for training prioritization)
    quality_score FLOAT DEFAULT 0.5,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== MOVE RECORDS TABLE ====================
-- Individual move records for detailed analysis

CREATE TABLE IF NOT EXISTS ai_move_records (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES ai_game_sessions(game_id) ON DELETE CASCADE,
    
    -- Move Sequence
    move_number INTEGER NOT NULL,
    player VARCHAR(10) NOT NULL, -- 'player', 'bot'
    
    -- Move Details
    move_type VARCHAR(20) NOT NULL, -- 'reveal', 'flag', 'unflag', 'power'
    cell_x INTEGER,
    cell_y INTEGER,
    
    -- Result
    result VARCHAR(20), -- 'safe', 'mine', 'cascade', 'flag_correct', 'flag_wrong'
    cells_revealed INTEGER DEFAULT 1,
    
    -- For bot moves: decision layer
    decision_layer VARCHAR(20), -- 'deterministic', 'probabilistic', 'strategic', 'emergency'
    risk_score FLOAT, -- 0.0 - 1.0 for probabilistic moves
    
    -- Timing
    game_time INTEGER NOT NULL, -- ms since game start
    think_time INTEGER DEFAULT 0, -- ms to make decision
    
    -- Scores at time of move
    player_score INTEGER DEFAULT 0,
    bot_score INTEGER DEFAULT 0,
    
    -- Game Phase
    game_phase VARCHAR(20), -- 'early', 'mid', 'late', 'critical'
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== BOARD SNAPSHOTS TABLE ====================
-- Captures board state at key moments for training

CREATE TABLE IF NOT EXISTS ai_board_snapshots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES ai_game_sessions(game_id) ON DELETE CASCADE,
    move_number INTEGER NOT NULL,
    
    -- Board State (only visible information!)
    -- This is what a human player could see
    visible_state JSONB NOT NULL,
    -- Format: {
    --   cells: [[{revealed: bool, neighborCount: int, flagged: bool}]]
    --   revealedCount: int,
    --   flaggedCount: int
    -- }
    
    -- Decision made at this state
    chosen_action JSONB, -- {type, x, y, layer, risk}
    
    -- What was the optimal action? (labeled after game ends)
    optimal_action JSONB,
    
    -- Was the chosen action correct?
    was_optimal BOOLEAN,
    
    -- Difficulty of this situation (0.0 = easy, 1.0 = hard)
    situation_difficulty FLOAT DEFAULT 0.5,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== LEARNED PATTERNS TABLE ====================
-- Patterns learned from mistakes

CREATE TABLE IF NOT EXISTS ai_learned_patterns (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Pattern identifier (hash of neighbor state)
    pattern_hash TEXT UNIQUE NOT NULL,
    
    -- Pattern details
    neighbor_state JSONB NOT NULL,
    -- Format: {
    --   revealedCount: int,
    --   flaggedCount: int,
    --   hiddenCount: int,
    --   numbers: [int]
    -- }
    
    -- Learning data
    times_seen INTEGER DEFAULT 0,
    times_was_mine INTEGER DEFAULT 0,
    times_was_safe INTEGER DEFAULT 0,
    
    -- Calculated risk (0.0 - 1.0)
    risk_score FLOAT DEFAULT 0.5,
    
    -- Last update
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== PLAYER BEHAVIOR PROFILES ====================
-- Anonymous player behavior patterns for adaptive difficulty

CREATE TABLE IF NOT EXISTS ai_player_profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Anonymous session identifier (not linked to account)
    session_hash TEXT UNIQUE NOT NULL,
    
    -- Skill metrics
    avg_move_time FLOAT DEFAULT 2000,
    avg_cascade_size FLOAT DEFAULT 3,
    mine_hit_rate FLOAT DEFAULT 0.15,
    flag_accuracy FLOAT DEFAULT 0.8,
    
    -- Play style
    risk_tolerance FLOAT DEFAULT 0.3,
    is_aggressive BOOLEAN DEFAULT FALSE,
    preferred_start_area VARCHAR(20), -- 'corner', 'edge', 'center'
    
    -- Power usage patterns
    power_usage_rate FLOAT DEFAULT 0.5,
    preferred_power VARCHAR(20),
    
    -- Skill level estimation
    estimated_skill VARCHAR(20) DEFAULT 'intermediate',
    
    -- Games count
    games_played INTEGER DEFAULT 0,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_ai_sessions_difficulty ON ai_game_sessions(difficulty);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_winner ON ai_game_sessions(winner);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_quality ON ai_game_sessions(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_created ON ai_game_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_moves_game ON ai_move_records(game_id);
CREATE INDEX IF NOT EXISTS idx_ai_moves_layer ON ai_move_records(decision_layer);
CREATE INDEX IF NOT EXISTS idx_ai_moves_result ON ai_move_records(result);

CREATE INDEX IF NOT EXISTS idx_ai_snapshots_game ON ai_board_snapshots(game_id);
CREATE INDEX IF NOT EXISTS idx_ai_snapshots_optimal ON ai_board_snapshots(was_optimal);

CREATE INDEX IF NOT EXISTS idx_ai_patterns_risk ON ai_learned_patterns(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_patterns_hash ON ai_learned_patterns(pattern_hash);

CREATE INDEX IF NOT EXISTS idx_ai_profiles_skill ON ai_player_profiles(estimated_skill);

-- ==================== RLS POLICIES ====================

ALTER TABLE bot_learning_global_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_move_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_board_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_player_profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read learning data
CREATE POLICY "Global learning readable" ON bot_learning_global_v2 FOR SELECT USING (true);
CREATE POLICY "Global learning updatable" ON bot_learning_global_v2 FOR UPDATE USING (true);

CREATE POLICY "Game sessions readable" ON ai_game_sessions FOR SELECT USING (true);
CREATE POLICY "Game sessions insertable" ON ai_game_sessions FOR INSERT WITH CHECK (true);

CREATE POLICY "Move records readable" ON ai_move_records FOR SELECT USING (true);
CREATE POLICY "Move records insertable" ON ai_move_records FOR INSERT WITH CHECK (true);

CREATE POLICY "Board snapshots readable" ON ai_board_snapshots FOR SELECT USING (true);
CREATE POLICY "Board snapshots insertable" ON ai_board_snapshots FOR INSERT WITH CHECK (true);

CREATE POLICY "Learned patterns readable" ON ai_learned_patterns FOR SELECT USING (true);
CREATE POLICY "Learned patterns modifiable" ON ai_learned_patterns FOR ALL USING (true);

CREATE POLICY "Player profiles readable" ON ai_player_profiles FOR SELECT USING (true);
CREATE POLICY "Player profiles modifiable" ON ai_player_profiles FOR ALL USING (true);

-- ==================== FUNCTIONS ====================

-- Update global learning when game ends
CREATE OR REPLACE FUNCTION update_global_learning_v2()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE bot_learning_global_v2 SET
        total_games = total_games + 1,
        total_wins = total_wins + CASE WHEN NEW.winner = 'bot' THEN 1 ELSE 0 END,
        total_losses = total_losses + CASE WHEN NEW.winner = 'player' THEN 1 ELSE 0 END,
        total_draws = total_draws + CASE WHEN NEW.winner = 'draw' THEN 1 ELSE 0 END,
        
        -- Update difficulty-specific stats
        easy_games = easy_games + CASE WHEN NEW.difficulty = 'easy' THEN 1 ELSE 0 END,
        easy_wins = easy_wins + CASE WHEN NEW.difficulty = 'easy' AND NEW.winner = 'bot' THEN 1 ELSE 0 END,
        medium_games = medium_games + CASE WHEN NEW.difficulty = 'medium' THEN 1 ELSE 0 END,
        medium_wins = medium_wins + CASE WHEN NEW.difficulty = 'medium' AND NEW.winner = 'bot' THEN 1 ELSE 0 END,
        hard_games = hard_games + CASE WHEN NEW.difficulty = 'hard' THEN 1 ELSE 0 END,
        hard_wins = hard_wins + CASE WHEN NEW.difficulty = 'hard' AND NEW.winner = 'bot' THEN 1 ELSE 0 END,
        expert_games = expert_games + CASE WHEN NEW.difficulty = 'expert' THEN 1 ELSE 0 END,
        expert_wins = expert_wins + CASE WHEN NEW.difficulty = 'expert' AND NEW.winner = 'bot' THEN 1 ELSE 0 END,
        
        -- Update moving averages
        avg_player_score = avg_player_score * 0.95 + NEW.player_score * 0.05,
        avg_game_duration = avg_game_duration * 0.95 + NEW.game_duration * 0.05,
        avg_moves_per_game = avg_moves_per_game * 0.95 + NEW.bot_moves * 0.05,
        avg_mines_hit = avg_mines_hit * 0.95 + NEW.bot_mines_hit * 0.05,
        
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000002';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_global_learning
    AFTER INSERT ON ai_game_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_global_learning_v2();

-- Calculate game quality score
CREATE OR REPLACE FUNCTION calculate_game_quality_v2(game_id_param TEXT)
RETURNS FLOAT AS $$
DECLARE
    quality FLOAT := 0.5;
    move_count INTEGER;
    deterministic_ratio FLOAT;
    has_variety BOOLEAN;
BEGIN
    -- Get move count
    SELECT COUNT(*) INTO move_count 
    FROM ai_move_records 
    WHERE game_id = game_id_param;
    
    -- More moves = more training data = higher quality
    quality := quality + LEAST(move_count / 100.0, 0.25);
    
    -- Calculate deterministic ratio
    SELECT COUNT(*) FILTER (WHERE decision_layer = 'deterministic')::FLOAT / NULLIF(COUNT(*), 0)
    INTO deterministic_ratio
    FROM ai_move_records 
    WHERE game_id = game_id_param AND player = 'bot';
    
    -- Games with mix of decision types are more valuable
    IF deterministic_ratio BETWEEN 0.4 AND 0.8 THEN
        quality := quality + 0.15;
    END IF;
    
    -- Check for variety in game phases
    SELECT COUNT(DISTINCT game_phase) > 2 INTO has_variety
    FROM ai_move_records 
    WHERE game_id = game_id_param;
    
    IF has_variety THEN
        quality := quality + 0.1;
    END IF;
    
    RETURN LEAST(quality, 1.0);
END;
$$ LANGUAGE plpgsql;

-- Update learned pattern from new data
CREATE OR REPLACE FUNCTION update_learned_pattern(
    p_pattern_hash TEXT,
    p_neighbor_state JSONB,
    p_was_mine BOOLEAN
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO ai_learned_patterns (pattern_hash, neighbor_state, times_seen, times_was_mine, times_was_safe, risk_score)
    VALUES (
        p_pattern_hash,
        p_neighbor_state,
        1,
        CASE WHEN p_was_mine THEN 1 ELSE 0 END,
        CASE WHEN NOT p_was_mine THEN 1 ELSE 0 END,
        CASE WHEN p_was_mine THEN 0.7 ELSE 0.3 END
    )
    ON CONFLICT (pattern_hash) DO UPDATE SET
        times_seen = ai_learned_patterns.times_seen + 1,
        times_was_mine = ai_learned_patterns.times_was_mine + CASE WHEN p_was_mine THEN 1 ELSE 0 END,
        times_was_safe = ai_learned_patterns.times_was_safe + CASE WHEN NOT p_was_mine THEN 1 ELSE 0 END,
        risk_score = (ai_learned_patterns.times_was_mine + CASE WHEN p_was_mine THEN 1 ELSE 0 END)::FLOAT / 
                     (ai_learned_patterns.times_seen + 1)::FLOAT,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ==================== CLEANUP FUNCTIONS ====================

-- Clean old game sessions (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_ai_data()
RETURNS void AS $$
BEGIN
    DELETE FROM ai_game_sessions
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Also clean orphaned player profiles
    DELETE FROM ai_player_profiles
    WHERE last_seen < NOW() - INTERVAL '90 days'
    AND games_played < 5;
END;
$$ LANGUAGE plpgsql;

-- ==================== TRAINING DATA EXPORT VIEW ====================

CREATE OR REPLACE VIEW training_data_export AS
SELECT 
    s.game_id,
    s.difficulty,
    s.winner,
    s.quality_score,
    m.move_number,
    m.move_type,
    m.cell_x,
    m.cell_y,
    m.result,
    m.decision_layer,
    m.risk_score,
    m.game_phase,
    m.player_score,
    m.bot_score,
    snap.visible_state,
    snap.chosen_action,
    snap.was_optimal,
    snap.situation_difficulty
FROM ai_game_sessions s
JOIN ai_move_records m ON s.game_id = m.game_id
LEFT JOIN ai_board_snapshots snap ON s.game_id = snap.game_id AND m.move_number = snap.move_number
WHERE s.quality_score >= 0.5 -- Only high-quality games
ORDER BY s.created_at DESC, m.move_number;
