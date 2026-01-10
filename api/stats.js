import { supabaseAdmin } from '../config/supabase.js';

const GLOBAL_BOT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Stats API - Hem player stats hem de bot learning için
 * GET ?user_id=xxx : Player stats
 * GET ?bot_learning=true : Global bot learning verisi
 * POST (body: gameResult) : Bot learning güncelleme
 */
export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Check if supabaseAdmin is available
    if (!supabaseAdmin) {
        console.error('[STATS API] supabaseAdmin is null - missing env variables');
        return res.status(500).json({ 
            error: 'Database connection not available',
            hint: 'Check SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables'
        });
    }

    try {
        // POST = Bot learning güncelleme
        if (req.method === 'POST') {
            return await updateBotLearning(req, res);
        }
        
        // GET with bot_learning = Bot learning verisi çek
        if (req.query.bot_learning === 'true') {
            return await getBotLearning(req, res);
        }
        
        // GET with user_id = Player stats
        if (req.method === 'GET') {
            return await getPlayerStats(req, res);
        }
        
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Stats API error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}

// ==================== PLAYER STATS ====================
async function getPlayerStats(req, res) {
    const { user_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
    }

    const { data: stats, error } = await supabaseAdmin
        .from('player_stats')
        .select('*')
        .eq('user_id', user_id)
        .single();

    if (error || !stats) {
        return res.status(200).json({
            wins: 0,
            losses: 0,
            draws: 0,
            total_games: 0,
            total_score: 0,
            win_streak: 0,
            best_streak: 0,
            rating: 1000,
            win_rate: 0
        });
    }

    const winRate = stats.total_games > 0 
        ? ((stats.wins / stats.total_games) * 100).toFixed(1)
        : 0;

    const { count: rank } = await supabaseAdmin
        .from('player_stats')
        .select('*', { count: 'exact', head: true })
        .gt('rating', stats.rating);

    return res.status(200).json({
        ...stats,
        win_rate: parseFloat(winRate),
        rank: (rank || 0) + 1
    });
}

// ==================== BOT LEARNING - GET ====================
async function getBotLearning(req, res) {
    try {
        const { data, error } = await supabaseAdmin
            .from('bot_learning_global')
            .select('*')
            .eq('id', GLOBAL_BOT_ID)
            .single();

        if (error) {
            console.error('[BOT LEARNING GET] Error:', error);
        }

        if (error || !data) {
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

    return res.status(200).json({
        version: data.version || 1,
        stats: {
            gamesPlayed: data.total_games || 0,
            wins: data.total_wins || 0,
            losses: data.total_losses || 0,
            draws: data.total_draws || 0
        },
        powers: {
            freeze: { used: data.freeze_uses || 0, wonAfter: data.freeze_wins || 0, effectiveness: data.freeze_effectiveness || 0.5 },
            shield: { used: data.shield_uses || 0, savedMines: 0, effectiveness: data.shield_effectiveness || 0.5 },
            radar: { used: data.radar_uses || 0, minesFound: 0, effectiveness: data.radar_effectiveness || 0.5 },
            safeburst: { used: data.safeburst_uses || 0, pointsGained: 0, effectiveness: data.safeburst_effectiveness || 0.5 }
        },
        strategies: {
            aggressive: { used: data.aggressive_games || 0, won: data.aggressive_wins || 0, rate: data.aggressive_rate || 0.33 },
            defensive: { used: data.defensive_games || 0, won: data.defensive_wins || 0, rate: data.defensive_rate || 0.33 },
            balanced: { used: data.balanced_games || 0, won: data.balanced_wins || 0, rate: data.balanced_rate || 0.34 }
        },
        patterns: {
            avgPlayerSpeed: data.avg_player_speed || 5,
            avgPlayerScore: data.avg_player_score || 200,
            avgGameDuration: data.avg_game_duration || 60000
        }
    });
    } catch (error) {
        console.error('[BOT LEARNING GET] Exception:', error);
        return res.status(500).json({ error: 'Failed to get bot learning data', details: error.message });
    }
}

// ==================== BOT LEARNING - UPDATE ====================
async function updateBotLearning(req, res) {
    try {
        const { gameResult } = req.body;

        if (!gameResult) {
        return res.status(400).json({ error: 'gameResult required' });
    }

    const { data: current, error: fetchError } = await supabaseAdmin
        .from('bot_learning_global')
        .select('*')
        .eq('id', GLOBAL_BOT_ID)
        .single();

    if (fetchError || !current) {
        console.error('[BOT LEARNING] Fetch error:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch current data' });
    }

    const updates = {
        total_games: (current.total_games || 0) + 1,
        updated_at: new Date().toISOString()
    };

    // Win/Loss/Draw
    if (gameResult.botWon) {
        updates.total_wins = (current.total_wins || 0) + 1;
    } else if (gameResult.draw) {
        updates.total_draws = (current.total_draws || 0) + 1;
    } else {
        updates.total_losses = (current.total_losses || 0) + 1;
    }

    // Power usage
    if (gameResult.powersUsed) {
        for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
            if (gameResult.powersUsed[power]) {
                updates[`${power}_uses`] = (current[`${power}_uses`] || 0) + gameResult.powersUsed[power];
                if (gameResult.botWon) {
                    updates[`${power}_wins`] = (current[`${power}_wins`] || 0) + gameResult.powersUsed[power];
                }
                const totalUses = updates[`${power}_uses`] || current[`${power}_uses`] || 1;
                const totalWins = updates[`${power}_wins`] || current[`${power}_wins`] || 0;
                updates[`${power}_effectiveness`] = Math.max(0.2, Math.min(0.8, totalWins / totalUses));
            }
        }
    }

    // Strategy
    if (gameResult.strategy) {
        const strat = gameResult.strategy;
        updates[`${strat}_games`] = (current[`${strat}_games`] || 0) + 1;
        if (gameResult.botWon) {
            updates[`${strat}_wins`] = (current[`${strat}_wins`] || 0) + 1;
        }
        const games = updates[`${strat}_games`] || current[`${strat}_games`] || 1;
        const wins = updates[`${strat}_wins`] || current[`${strat}_wins`] || 0;
        updates[`${strat}_rate`] = Math.max(0.1, Math.min(0.9, wins / games));
    }

    // Difficulty
    if (gameResult.difficulty) {
        const diff = gameResult.difficulty;
        updates[`${diff}_games`] = (current[`${diff}_games`] || 0) + 1;
        if (gameResult.botWon) {
            updates[`${diff}_wins`] = (current[`${diff}_wins`] || 0) + 1;
        }
    }

    // Player patterns (moving average)
    if (gameResult.playerScore) {
        updates.avg_player_score = (current.avg_player_score || 200) * 0.9 + gameResult.playerScore * 0.1;
    }
    if (gameResult.playerSpeed) {
        updates.avg_player_speed = (current.avg_player_speed || 5) * 0.9 + gameResult.playerSpeed * 0.1;
    }
    if (gameResult.gameDuration) {
        updates.avg_game_duration = (current.avg_game_duration || 60000) * 0.9 + gameResult.gameDuration * 0.1;
    }

    const { error: updateError } = await supabaseAdmin
        .from('bot_learning_global')
        .update(updates)
        .eq('id', GLOBAL_BOT_ID);

    if (updateError) {
        console.error('[BOT LEARNING] Update error:', updateError);
        return res.status(500).json({ error: 'Failed to update', details: updateError.message });
    }

    console.log(`[BOT LEARNING] Games: ${updates.total_games}, Win Rate: ${((updates.total_wins || current.total_wins || 0) / updates.total_games * 100).toFixed(1)}%`);

    return res.status(200).json({ 
        success: true, 
        totalGames: updates.total_games,
        winRate: ((updates.total_wins || current.total_wins || 0) / updates.total_games * 100).toFixed(1)
    });
    } catch (error) {
        console.error('[BOT LEARNING UPDATE] Exception:', error);
        return res.status(500).json({ error: 'Failed to update bot learning', details: error.message });
    }
}
