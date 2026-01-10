import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const GLOBAL_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Bot Learning API
 * GET: Global bot öğrenme verisini çek
 * POST: Oyun sonucu ile öğrenme verisini güncelle
 */
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            return await getGlobalLearning(req, res);
        } else if (req.method === 'POST') {
            return await updateGlobalLearning(req, res);
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[BOT LEARNING API] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Global öğrenme verisini getir
async function getGlobalLearning(req, res) {
    const { data, error } = await supabase
        .from('bot_learning_global')
        .select('*')
        .eq('id', GLOBAL_ID)
        .single();

    if (error || !data) {
        // Varsayılan değerler döndür
        return res.status(200).json({
            version: 1,
            stats: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0 },
            powers: {
                freeze: { used: 0, wonAfter: 0, effectiveness: 0.5 },
                shield: { used: 0, savedMines: 0, effectiveness: 0.5 },
                radar: { used: 0, minesFound: 0, effectiveness: 0.5 },
                safeburst: { used: 0, pointsGained: 0, effectiveness: 0.5 }
            },
            strategies: {
                aggressive: { used: 0, won: 0, rate: 0.33 },
                defensive: { used: 0, won: 0, rate: 0.33 },
                balanced: { used: 0, won: 0, rate: 0.34 }
            },
            patterns: {
                avgPlayerSpeed: 5,
                avgPlayerScore: 200,
                avgGameDuration: 60000
            }
        });
    }

    // Veritabanından gelen veriyi bot formatına çevir
    return res.status(200).json({
        version: data.version || 1,
        stats: {
            gamesPlayed: data.total_games || 0,
            wins: data.total_wins || 0,
            losses: data.total_losses || 0,
            draws: data.total_draws || 0
        },
        powers: {
            freeze: { 
                used: data.freeze_uses || 0, 
                wonAfter: data.freeze_wins || 0, 
                effectiveness: data.freeze_effectiveness || 0.5 
            },
            shield: { 
                used: data.shield_uses || 0, 
                savedMines: 0, 
                effectiveness: data.shield_effectiveness || 0.5 
            },
            radar: { 
                used: data.radar_uses || 0, 
                minesFound: 0, 
                effectiveness: data.radar_effectiveness || 0.5 
            },
            safeburst: { 
                used: data.safeburst_uses || 0, 
                pointsGained: 0, 
                effectiveness: data.safeburst_effectiveness || 0.5 
            }
        },
        strategies: {
            aggressive: { 
                used: data.aggressive_games || 0, 
                won: data.aggressive_wins || 0, 
                rate: data.aggressive_rate || 0.33 
            },
            defensive: { 
                used: data.defensive_games || 0, 
                won: data.defensive_wins || 0, 
                rate: data.defensive_rate || 0.33 
            },
            balanced: { 
                used: data.balanced_games || 0, 
                won: data.balanced_wins || 0, 
                rate: data.balanced_rate || 0.34 
            }
        },
        patterns: {
            avgPlayerSpeed: data.avg_player_speed || 5,
            avgPlayerScore: data.avg_player_score || 200,
            avgGameDuration: data.avg_game_duration || 60000
        },
        difficultyStats: {
            easy: { games: data.easy_games || 0, wins: data.easy_wins || 0 },
            medium: { games: data.medium_games || 0, wins: data.medium_wins || 0 },
            hard: { games: data.hard_games || 0, wins: data.hard_wins || 0 },
            expert: { games: data.expert_games || 0, wins: data.expert_wins || 0 }
        }
    });
}

// Oyun sonucu ile öğrenme verisini güncelle
async function updateGlobalLearning(req, res) {
    const { gameResult } = req.body;

    if (!gameResult) {
        return res.status(400).json({ error: 'gameResult required' });
    }

    // Mevcut veriyi çek
    const { data: current, error: fetchError } = await supabase
        .from('bot_learning_global')
        .select('*')
        .eq('id', GLOBAL_ID)
        .single();

    if (fetchError) {
        console.error('[BOT LEARNING] Fetch error:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch current data' });
    }

    // Yeni değerleri hesapla
    const updates = {
        total_games: (current.total_games || 0) + 1,
        updated_at: new Date().toISOString()
    };

    // Kazanma/kaybetme
    if (gameResult.botWon) {
        updates.total_wins = (current.total_wins || 0) + 1;
    } else if (gameResult.draw) {
        updates.total_draws = (current.total_draws || 0) + 1;
    } else {
        updates.total_losses = (current.total_losses || 0) + 1;
    }

    // Güç kullanımları
    if (gameResult.powersUsed) {
        for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
            if (gameResult.powersUsed[power]) {
                updates[`${power}_uses`] = (current[`${power}_uses`] || 0) + gameResult.powersUsed[power];
                if (gameResult.botWon) {
                    updates[`${power}_wins`] = (current[`${power}_wins`] || 0) + gameResult.powersUsed[power];
                }
                // Etkinlik hesapla
                const totalUses = updates[`${power}_uses`] || current[`${power}_uses`] || 1;
                const totalWins = updates[`${power}_wins`] || current[`${power}_wins`] || 0;
                updates[`${power}_effectiveness`] = Math.max(0.2, Math.min(0.8, totalWins / totalUses));
            }
        }
    }

    // Strateji
    if (gameResult.strategy) {
        const strat = gameResult.strategy; // 'aggressive', 'defensive', 'balanced'
        updates[`${strat}_games`] = (current[`${strat}_games`] || 0) + 1;
        if (gameResult.botWon) {
            updates[`${strat}_wins`] = (current[`${strat}_wins`] || 0) + 1;
        }
        // Rate hesapla
        const games = updates[`${strat}_games`] || current[`${strat}_games`] || 1;
        const wins = updates[`${strat}_wins`] || current[`${strat}_wins`] || 0;
        updates[`${strat}_rate`] = Math.max(0.1, Math.min(0.9, wins / games));
    }

    // Zorluk bazlı
    if (gameResult.difficulty) {
        const diff = gameResult.difficulty; // 'easy', 'medium', 'hard', 'expert'
        updates[`${diff}_games`] = (current[`${diff}_games`] || 0) + 1;
        if (gameResult.botWon) {
            updates[`${diff}_wins`] = (current[`${diff}_wins`] || 0) + 1;
        }
    }

    // Oyuncu kalıpları (hareketli ortalama)
    if (gameResult.playerScore) {
        const weight = 0.1;
        updates.avg_player_score = (current.avg_player_score || 200) * (1 - weight) + gameResult.playerScore * weight;
    }
    if (gameResult.playerSpeed) {
        const weight = 0.1;
        updates.avg_player_speed = (current.avg_player_speed || 5) * (1 - weight) + gameResult.playerSpeed * weight;
    }
    if (gameResult.gameDuration) {
        const weight = 0.1;
        updates.avg_game_duration = (current.avg_game_duration || 60000) * (1 - weight) + gameResult.gameDuration * weight;
    }

    // Güncelle
    const { error: updateError } = await supabase
        .from('bot_learning_global')
        .update(updates)
        .eq('id', GLOBAL_ID);

    if (updateError) {
        console.error('[BOT LEARNING] Update error:', updateError);
        return res.status(500).json({ error: 'Failed to update' });
    }

    console.log(`[BOT LEARNING] Updated - Games: ${updates.total_games}, Win Rate: ${((updates.total_wins || current.total_wins || 0) / updates.total_games * 100).toFixed(1)}%`);

    return res.status(200).json({ 
        success: true, 
        totalGames: updates.total_games,
        winRate: ((updates.total_wins || current.total_wins || 0) / updates.total_games * 100).toFixed(1)
    });
}
