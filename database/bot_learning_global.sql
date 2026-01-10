-- Global Bot Learning Table
-- Tüm oyuncuların verileri burada toplanır
-- Bot bu verilerden öğrenir

-- Ana öğrenme tablosu
CREATE TABLE IF NOT EXISTS bot_learning_global (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Versiyon kontrolü
    version INTEGER DEFAULT 1,
    
    -- Toplam istatistikler
    total_games INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    total_draws INTEGER DEFAULT 0,
    
    -- Güç etkinlikleri (0-1 arası)
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
    
    -- Strateji başarıları
    aggressive_games INTEGER DEFAULT 0,
    aggressive_wins INTEGER DEFAULT 0,
    aggressive_rate FLOAT DEFAULT 0.33,
    
    defensive_games INTEGER DEFAULT 0,
    defensive_wins INTEGER DEFAULT 0,
    defensive_rate FLOAT DEFAULT 0.33,
    
    balanced_games INTEGER DEFAULT 0,
    balanced_wins INTEGER DEFAULT 0,
    balanced_rate FLOAT DEFAULT 0.34,
    
    -- Oyuncu kalıpları (ortalamalar)
    avg_player_score FLOAT DEFAULT 200,
    avg_player_speed FLOAT DEFAULT 5,
    avg_game_duration FLOAT DEFAULT 60000,
    
    -- Zorluk bazlı veriler
    easy_games INTEGER DEFAULT 0,
    easy_wins INTEGER DEFAULT 0,
    medium_games INTEGER DEFAULT 0,
    medium_wins INTEGER DEFAULT 0,
    hard_games INTEGER DEFAULT 0,
    hard_wins INTEGER DEFAULT 0,
    expert_games INTEGER DEFAULT 0,
    expert_wins INTEGER DEFAULT 0,
    
    -- Zaman
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tek satır olacak (global veri)
INSERT INTO bot_learning_global (id, version) 
VALUES ('00000000-0000-0000-0000-000000000001', 1)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE bot_learning_global ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir
CREATE POLICY "Bot learning readable by all"
    ON bot_learning_global FOR SELECT USING (true);

-- Herkes güncelleyebilir
CREATE POLICY "Bot learning updatable by all"
    ON bot_learning_global FOR UPDATE USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_bot_learning_updated 
    ON bot_learning_global(updated_at DESC);
