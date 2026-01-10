-- MineDuel Deep Learning Training Data Schema
-- Bu şema, yapay zeka eğitimi için oyun verilerini saklar
-- Run this in Supabase SQL Editor

-- ==================== ANA EĞİTİM VERİSİ TABLOSU ====================

CREATE TABLE IF NOT EXISTS training_games (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id TEXT UNIQUE NOT NULL,
    
    -- Oyun Konfigürasyonu
    grid_size INTEGER NOT NULL DEFAULT 10,
    mine_count INTEGER NOT NULL DEFAULT 15,
    difficulty VARCHAR(20) NOT NULL,
    match_duration INTEGER NOT NULL, -- milisaniye
    
    -- Oyuncular
    player1_type VARCHAR(20) NOT NULL, -- 'human', 'bot_easy', 'bot_medium', 'bot_hard', 'bot_expert'
    player2_type VARCHAR(20) NOT NULL,
    player1_name VARCHAR(50),
    player2_name VARCHAR(50),
    
    -- Sonuçlar
    winner VARCHAR(20), -- 'player1', 'player2', 'draw'
    win_reason VARCHAR(50), -- 'score', 'completion', 'time', 'disconnect'
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    game_duration INTEGER, -- gerçek süre (ms)
    
    -- İstatistikler
    total_moves INTEGER DEFAULT 0,
    total_power_uses INTEGER DEFAULT 0,
    
    -- Oyun kalitesi (eğitim için)
    quality_score FLOAT DEFAULT 0, -- 0-1, yüksek kaliteli oyunlar daha değerli
    is_verified BOOLEAN DEFAULT FALSE, -- manuel doğrulanmış mı
    
    -- Zaman
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Mayın pozisyonları (JSON array)
    mine_positions JSONB
);

-- ==================== HAMLE GEÇMİŞİ TABLOSU ====================

CREATE TABLE IF NOT EXISTS training_moves (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES training_games(game_id) ON DELETE CASCADE,
    
    -- Hamle sırası
    move_number INTEGER NOT NULL,
    
    -- Kim yaptı
    player VARCHAR(20) NOT NULL, -- 'player1', 'player2'
    player_type VARCHAR(20) NOT NULL, -- 'human', 'bot_easy', etc.
    
    -- Hamle tipi
    move_type VARCHAR(20) NOT NULL, -- 'reveal', 'flag', 'unflag', 'power'
    
    -- Pozisyon (power için null olabilir)
    cell_x INTEGER,
    cell_y INTEGER,
    
    -- Sonuç
    result VARCHAR(20), -- 'safe', 'mine', 'cascade', null
    cell_value INTEGER, -- 0-8 veya -1 (mayın)
    cells_revealed INTEGER DEFAULT 1,
    
    -- Skorlar
    score_before INTEGER DEFAULT 0,
    score_after INTEGER DEFAULT 0,
    score_change INTEGER DEFAULT 0,
    opponent_score INTEGER DEFAULT 0,
    
    -- Zamanlama
    game_time INTEGER NOT NULL, -- oyun başlangıcından (ms)
    think_time INTEGER DEFAULT 0, -- son hareketten bu yana (ms)
    
    -- Tahta durumu (önemli hamleler için - JSON)
    board_state JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== GÜÇ KULLANIMI TABLOSU ====================

CREATE TABLE IF NOT EXISTS training_powers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES training_games(game_id) ON DELETE CASCADE,
    
    -- Kim kullandı
    player VARCHAR(20) NOT NULL,
    player_type VARCHAR(20) NOT NULL,
    
    -- Güç bilgisi
    power_type VARCHAR(20) NOT NULL, -- 'freeze', 'shield', 'radar', 'safeburst'
    power_cost INTEGER NOT NULL,
    
    -- Kullanım zamanı durumu
    game_time INTEGER NOT NULL,
    time_remaining INTEGER, -- kalan süre
    
    -- Kullanım anı durumu
    user_score INTEGER DEFAULT 0,
    opponent_score INTEGER DEFAULT 0,
    score_diff INTEGER DEFAULT 0,
    
    -- Güç sonucu (power-specific)
    effect_data JSONB, -- örn: radar için bulunan mayınlar
    
    -- Etkinlik (oyun sonu hesaplanır)
    was_effective BOOLEAN,
    effectiveness_score FLOAT,
    
    -- Karar açıklaması (bot için)
    decision_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== TAHTA SNAPSHOT TABLOSU ====================

CREATE TABLE IF NOT EXISTS training_snapshots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES training_games(game_id) ON DELETE CASCADE,
    move_number INTEGER NOT NULL,
    
    -- Tam tahta durumu (10x10 grid)
    board_data JSONB NOT NULL,
    
    -- Bu anki durumda en iyi hamle neydi (etiket)
    optimal_move_x INTEGER,
    optimal_move_y INTEGER,
    optimal_move_type VARCHAR(20),
    
    -- Durumun zorluk seviyesi
    situation_difficulty FLOAT, -- 0-1
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== EĞİTİM İSTATİSTİKLERİ TABLOSU ====================

CREATE TABLE IF NOT EXISTS training_stats (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Toplam veriler
    total_games INTEGER DEFAULT 0,
    total_moves INTEGER DEFAULT 0,
    total_human_moves INTEGER DEFAULT 0,
    total_bot_moves INTEGER DEFAULT 0,
    
    -- Oyun türleri
    human_vs_human_games INTEGER DEFAULT 0,
    human_vs_bot_games INTEGER DEFAULT 0,
    bot_vs_bot_games INTEGER DEFAULT 0,
    
    -- Kalite metrikleri
    avg_game_quality FLOAT DEFAULT 0,
    verified_games INTEGER DEFAULT 0,
    
    -- Zaman
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Tek satır olacak
    CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

-- İlk satırı oluştur
INSERT INTO training_stats (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ==================== INDEXLER ====================

CREATE INDEX IF NOT EXISTS idx_training_moves_game ON training_moves(game_id);
CREATE INDEX IF NOT EXISTS idx_training_moves_player ON training_moves(player_type);
CREATE INDEX IF NOT EXISTS idx_training_powers_game ON training_powers(game_id);
CREATE INDEX IF NOT EXISTS idx_training_games_quality ON training_games(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_training_games_verified ON training_games(is_verified);
CREATE INDEX IF NOT EXISTS idx_training_snapshots_game ON training_snapshots(game_id);

-- ==================== RLS POLİCİES ====================

ALTER TABLE training_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_powers ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_stats ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (araştırma için)
CREATE POLICY "Training data is viewable by everyone"
    ON training_games FOR SELECT USING (true);

CREATE POLICY "Training moves viewable"
    ON training_moves FOR SELECT USING (true);

CREATE POLICY "Training powers viewable"
    ON training_powers FOR SELECT USING (true);

CREATE POLICY "Training snapshots viewable"
    ON training_snapshots FOR SELECT USING (true);

CREATE POLICY "Training stats viewable"
    ON training_stats FOR SELECT USING (true);

-- Anonim insert (oyun kaydı için)
CREATE POLICY "Anyone can insert training games"
    ON training_games FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert training moves"
    ON training_moves FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert training powers"
    ON training_powers FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert training snapshots"
    ON training_snapshots FOR INSERT WITH CHECK (true);

-- Stats güncelleme
CREATE POLICY "Stats can be updated"
    ON training_stats FOR UPDATE USING (true);

-- ==================== FONKSİYONLAR ====================

-- Oyun kalitesi hesaplama
CREATE OR REPLACE FUNCTION calculate_game_quality(game_id_param TEXT)
RETURNS FLOAT AS $$
DECLARE
    quality FLOAT := 0;
    move_count INTEGER;
    human_ratio FLOAT;
    duration_score FLOAT;
BEGIN
    -- Hamle sayısı skoru (daha fazla hamle = daha değerli)
    SELECT COUNT(*) INTO move_count FROM training_moves WHERE game_id = game_id_param;
    quality := quality + LEAST(move_count / 100.0, 0.3);
    
    -- İnsan oranı (insan hareketleri daha değerli)
    SELECT COUNT(*)::FLOAT / NULLIF(move_count, 0) INTO human_ratio 
    FROM training_moves WHERE game_id = game_id_param AND player_type = 'human';
    quality := quality + COALESCE(human_ratio, 0) * 0.4;
    
    -- Süre skoru (ortalama süre etrafında)
    SELECT CASE 
        WHEN game_duration BETWEEN 30000 AND 120000 THEN 0.3
        WHEN game_duration BETWEEN 15000 AND 150000 THEN 0.2
        ELSE 0.1
    END INTO duration_score
    FROM training_games WHERE game_id = game_id_param;
    quality := quality + COALESCE(duration_score, 0.1);
    
    RETURN LEAST(quality, 1.0);
END;
$$ LANGUAGE plpgsql;

-- İstatistikleri güncelle
CREATE OR REPLACE FUNCTION update_training_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE training_stats SET
        total_games = (SELECT COUNT(*) FROM training_games),
        total_moves = (SELECT COUNT(*) FROM training_moves),
        total_human_moves = (SELECT COUNT(*) FROM training_moves WHERE player_type = 'human'),
        total_bot_moves = (SELECT COUNT(*) FROM training_moves WHERE player_type LIKE 'bot_%'),
        human_vs_bot_games = (SELECT COUNT(*) FROM training_games WHERE 
            (player1_type = 'human' AND player2_type LIKE 'bot_%') OR
            (player2_type = 'human' AND player1_type LIKE 'bot_%')),
        avg_game_quality = (SELECT AVG(quality_score) FROM training_games),
        verified_games = (SELECT COUNT(*) FROM training_games WHERE is_verified = true),
        last_updated = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000001';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-update stats
CREATE TRIGGER update_stats_on_game_insert
    AFTER INSERT ON training_games
    FOR EACH ROW
    EXECUTE FUNCTION update_training_stats();

