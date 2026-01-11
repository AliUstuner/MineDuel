/**
 * ai-learning.js - Enhanced AI Learning API
 * 
 * Endpoints:
 * GET ?learning=true - Get global learning data
 * GET ?patterns=true - Get learned patterns
 * POST - Record game session and moves
 * 
 * This API handles:
 * 1. Recording complete game sessions for training
 * 2. Storing individual moves with decision context
 * 3. Capturing board snapshots for imitation learning
 * 4. Managing learned patterns
 * 
 * @version 2.0
 */

import { supabaseAdmin } from '../lib/supabase.js';

const GLOBAL_BOT_ID = '00000000-0000-0000-0000-000000000002';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Check database connection
    if (!supabaseAdmin) {
        return res.status(500).json({ 
            error: 'Database not configured',
            hint: 'Check SUPABASE_URL and SUPABASE_SERVICE_KEY'
        });
    }

    try {
        // GET: Retrieve learning data
        if (req.method === 'GET') {
            if (req.query.learning === 'true') {
                return await getGlobalLearning(req, res);
            }
            if (req.query.patterns === 'true') {
                return await getLearnedPatterns(req, res);
            }
            if (req.query.stats === 'true') {
                return await getDetailedStats(req, res);
            }
            if (req.query.training_data === 'true') {
                return await getTrainingData(req, res);
            }
            
            return res.status(400).json({ error: 'Invalid query parameter' });
        }

        // POST: Record learning data
        if (req.method === 'POST') {
            const { type } = req.body;
            
            switch (type) {
                case 'game_session':
                    return await recordGameSession(req, res);
                case 'moves':
                    return await recordMoves(req, res);
                case 'snapshot':
                    return await recordSnapshot(req, res);
                case 'pattern':
                    return await updatePattern(req, res);
                case 'simple_update':
                    return await simpleUpdate(req, res);
                default:
                    // Legacy: simple learning update
                    return await simpleUpdate(req, res);
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });
        
    } catch (error) {
        console.error('[AI Learning API] Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}

// ==================== GET ENDPOINTS ====================

/**
 * Get global learning data for bot initialization
 */
async function getGlobalLearning(req, res) {
    try {
        const { data, error } = await supabaseAdmin
            .from('bot_learning_global_v2')
            .select('*')
            .eq('id', GLOBAL_BOT_ID)
            .single();

        if (error || !data) {
            // Return defaults if no data exists
            return res.status(200).json(getDefaultLearningData());
        }

        // Format response for client
        return res.status(200).json({
            version: data.version,
            stats: {
                gamesPlayed: data.total_games,
                wins: data.total_wins,
                losses: data.total_losses,
                draws: data.total_draws
            },
            powers: {
                freeze: { 
                    used: data.freeze_uses, 
                    effectiveness: data.freeze_effectiveness 
                },
                shield: { 
                    used: data.shield_uses, 
                    effectiveness: data.shield_effectiveness 
                },
                radar: { 
                    used: data.radar_uses, 
                    effectiveness: data.radar_effectiveness 
                },
                safeburst: { 
                    used: data.safeburst_uses, 
                    effectiveness: data.safeburst_effectiveness 
                }
            },
            strategies: {
                aggressive: { 
                    used: data.aggressive_games, 
                    rate: data.aggressive_rate 
                },
                defensive: { 
                    used: data.defensive_games, 
                    rate: data.defensive_rate 
                },
                balanced: { 
                    used: data.balanced_games, 
                    rate: data.balanced_rate 
                }
            },
            patterns: {
                avgPlayerScore: data.avg_player_score,
                avgPlayerSpeed: data.avg_player_speed,
                avgGameDuration: data.avg_game_duration,
                avgMovesPerGame: data.avg_moves_per_game,
                avgMinesHit: data.avg_mines_hit
            },
            difficultyStats: {
                easy: { games: data.easy_games, wins: data.easy_wins },
                medium: { games: data.medium_games, wins: data.medium_wins },
                hard: { games: data.hard_games, wins: data.hard_wins },
                expert: { games: data.expert_games, wins: data.expert_wins }
            }
        });
        
    } catch (error) {
        console.error('[Get Learning] Error:', error);
        return res.status(200).json(getDefaultLearningData());
    }
}

/**
 * Get learned patterns for risk estimation
 */
async function getLearnedPatterns(req, res) {
    try {
        const { data, error } = await supabaseAdmin
            .from('ai_learned_patterns')
            .select('*')
            .order('times_seen', { ascending: false })
            .limit(100);

        if (error) {
            throw error;
        }

        return res.status(200).json({
            patterns: data || [],
            count: data?.length || 0
        });
        
    } catch (error) {
        console.error('[Get Patterns] Error:', error);
        return res.status(200).json({ patterns: [], count: 0 });
    }
}

/**
 * Get detailed statistics for dashboard
 */
async function getDetailedStats(req, res) {
    try {
        // Get global stats
        const { data: global } = await supabaseAdmin
            .from('bot_learning_global_v2')
            .select('*')
            .eq('id', GLOBAL_BOT_ID)
            .single();

        // Get recent games count
        const { count: recentGames } = await supabaseAdmin
            .from('ai_game_sessions')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        // Get pattern count
        const { count: patternCount } = await supabaseAdmin
            .from('ai_learned_patterns')
            .select('*', { count: 'exact', head: true });

        // Calculate win rates
        const winRate = global?.total_games > 0 
            ? ((global.total_wins / global.total_games) * 100).toFixed(1)
            : 0;

        return res.status(200).json({
            status: 'ok',
            global: {
                totalGames: global?.total_games || 0,
                wins: global?.total_wins || 0,
                losses: global?.total_losses || 0,
                draws: global?.total_draws || 0,
                winRate: parseFloat(winRate)
            },
            recentActivity: {
                gamesLast24h: recentGames || 0
            },
            learning: {
                learnedPatterns: patternCount || 0,
                avgDecisionAccuracy: global?.avg_deterministic_moves || 0.7
            },
            powers: {
                mostEffective: getMostEffectivePower(global),
                freeze: global?.freeze_effectiveness || 0.5,
                shield: global?.shield_effectiveness || 0.5,
                radar: global?.radar_effectiveness || 0.5,
                safeburst: global?.safeburst_effectiveness || 0.5
            },
            difficulty: {
                easy: global?.easy_games > 0 ? (global.easy_wins / global.easy_games) : 0,
                medium: global?.medium_games > 0 ? (global.medium_wins / global.medium_games) : 0,
                hard: global?.hard_games > 0 ? (global.hard_wins / global.hard_games) : 0,
                expert: global?.expert_games > 0 ? (global.expert_wins / global.expert_games) : 0
            }
        });
        
    } catch (error) {
        console.error('[Get Stats] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Get training data for offline learning
 */
async function getTrainingData(req, res) {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        const minQuality = parseFloat(req.query.min_quality) || 0.5;
        
        // Get high-quality games with their moves
        const { data: sessions, error } = await supabaseAdmin
            .from('ai_game_sessions')
            .select(`
                *,
                ai_move_records (*)
            `)
            .gte('quality_score', minQuality)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return res.status(200).json({
            sessions: sessions || [],
            count: sessions?.length || 0,
            minQuality
        });
        
    } catch (error) {
        console.error('[Get Training Data] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// ==================== POST ENDPOINTS ====================

/**
 * Record a complete game session
 */
async function recordGameSession(req, res) {
    try {
        const { session } = req.body;
        
        if (!session || !session.gameId) {
            return res.status(400).json({ error: 'Missing session data' });
        }

        // Insert game session
        const { data, error } = await supabaseAdmin
            .from('ai_game_sessions')
            .insert({
                game_id: session.gameId,
                grid_size: session.gridSize || 10,
                mine_count: session.mineCount || 15,
                difficulty: session.difficulty || 'medium',
                match_duration: session.matchDuration || 120000,
                player_type: 'human',
                bot_difficulty: session.difficulty || 'medium',
                winner: session.winner,
                player_score: session.playerScore || 0,
                bot_score: session.botScore || 0,
                game_duration: session.duration || 0,
                bot_moves: session.botMoves || 0,
                bot_safe_moves: session.botSafeMoves || 0,
                bot_mines_hit: session.botMinesHit || 0,
                bot_correct_flags: session.botCorrectFlags || 0,
                bot_wrong_flags: session.botWrongFlags || 0,
                deterministic_moves: session.deterministicMoves || 0,
                probabilistic_moves: session.probabilisticMoves || 0,
                strategic_moves: session.strategicMoves || 0,
                emergency_moves: session.emergencyMoves || 0,
                primary_strategy: session.strategy || 'balanced',
                powers_used: session.powersUsed || {},
                quality_score: session.qualityScore || 0.5
            })
            .select()
            .single();

        if (error) throw error;

        return res.status(200).json({
            success: true,
            gameId: session.gameId,
            recorded: true
        });
        
    } catch (error) {
        console.error('[Record Session] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Record batch of moves for a game
 */
async function recordMoves(req, res) {
    try {
        const { gameId, moves } = req.body;
        
        if (!gameId || !moves || !Array.isArray(moves)) {
            return res.status(400).json({ error: 'Missing move data' });
        }

        // Format moves for insertion
        const moveRecords = moves.map((m, index) => ({
            game_id: gameId,
            move_number: m.moveNumber || index + 1,
            player: m.player || 'bot',
            move_type: m.type || 'reveal',
            cell_x: m.x,
            cell_y: m.y,
            result: m.result,
            cells_revealed: m.cellsRevealed || 1,
            decision_layer: m.layer,
            risk_score: m.risk,
            game_time: m.gameTime || 0,
            think_time: m.thinkTime || 0,
            player_score: m.playerScore || 0,
            bot_score: m.botScore || 0,
            game_phase: m.phase
        }));

        const { error } = await supabaseAdmin
            .from('ai_move_records')
            .insert(moveRecords);

        if (error) throw error;

        return res.status(200).json({
            success: true,
            movesRecorded: moves.length
        });
        
    } catch (error) {
        console.error('[Record Moves] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Record a board snapshot
 */
async function recordSnapshot(req, res) {
    try {
        const { gameId, snapshot } = req.body;
        
        if (!gameId || !snapshot) {
            return res.status(400).json({ error: 'Missing snapshot data' });
        }

        const { error } = await supabaseAdmin
            .from('ai_board_snapshots')
            .insert({
                game_id: gameId,
                move_number: snapshot.moveNumber,
                visible_state: snapshot.visibleState,
                chosen_action: snapshot.chosenAction,
                optimal_action: snapshot.optimalAction,
                was_optimal: snapshot.wasOptimal,
                situation_difficulty: snapshot.difficulty || 0.5
            });

        if (error) throw error;

        return res.status(200).json({ success: true });
        
    } catch (error) {
        console.error('[Record Snapshot] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Update learned pattern
 */
async function updatePattern(req, res) {
    try {
        const { patternHash, neighborState, wasMine } = req.body;
        
        if (!patternHash || !neighborState) {
            return res.status(400).json({ error: 'Missing pattern data' });
        }

        // Upsert pattern
        const { error } = await supabaseAdmin.rpc('update_learned_pattern', {
            p_pattern_hash: patternHash,
            p_neighbor_state: neighborState,
            p_was_mine: wasMine
        });

        if (error) throw error;

        return res.status(200).json({ success: true });
        
    } catch (error) {
        console.error('[Update Pattern] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Simple update for backward compatibility
 * Handles the basic gameResult format from existing BotAI
 */
async function simpleUpdate(req, res) {
    try {
        const { gameResult } = req.body;
        
        if (!gameResult) {
            return res.status(400).json({ error: 'Missing gameResult' });
        }

        // Get current global data
        const { data: current, error: fetchError } = await supabaseAdmin
            .from('bot_learning_global_v2')
            .select('*')
            .eq('id', GLOBAL_BOT_ID)
            .single();

        if (fetchError) {
            // Try to insert if doesn't exist
            await supabaseAdmin
                .from('bot_learning_global_v2')
                .insert({ id: GLOBAL_BOT_ID, version: 2 });
        }

        const updates = {
            total_games: (current?.total_games || 0) + 1,
            updated_at: new Date().toISOString()
        };

        // Win/Loss/Draw
        if (gameResult.botWon) {
            updates.total_wins = (current?.total_wins || 0) + 1;
        } else if (gameResult.draw) {
            updates.total_draws = (current?.total_draws || 0) + 1;
        } else {
            updates.total_losses = (current?.total_losses || 0) + 1;
        }

        // Difficulty stats
        const difficulty = gameResult.difficulty || 'medium';
        if (['easy', 'medium', 'hard', 'expert'].includes(difficulty)) {
            updates[`${difficulty}_games`] = (current?.[`${difficulty}_games`] || 0) + 1;
            if (gameResult.botWon) {
                updates[`${difficulty}_wins`] = (current?.[`${difficulty}_wins`] || 0) + 1;
            }
        }

        // Power usage
        if (gameResult.powersUsed) {
            for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
                const usage = gameResult.powersUsed[power] || 0;
                if (usage > 0) {
                    const newUses = (current?.[`${power}_uses`] || 0) + usage;
                    const newWins = (current?.[`${power}_wins`] || 0) + 
                        (gameResult.botWon ? usage : 0);
                    
                    updates[`${power}_uses`] = newUses;
                    updates[`${power}_wins`] = newWins;
                    updates[`${power}_effectiveness`] = Math.max(0.2, Math.min(0.8, newWins / Math.max(1, newUses)));
                }
            }
        }

        // Strategy stats
        const strategy = gameResult.strategy || 'balanced';
        if (['aggressive', 'defensive', 'balanced'].includes(strategy)) {
            const newGames = (current?.[`${strategy}_games`] || 0) + 1;
            const newWins = (current?.[`${strategy}_wins`] || 0) + (gameResult.botWon ? 1 : 0);
            
            updates[`${strategy}_games`] = newGames;
            updates[`${strategy}_wins`] = newWins;
            updates[`${strategy}_rate`] = Math.max(0.1, Math.min(0.9, newWins / newGames));
        }

        // Player patterns (moving average)
        if (gameResult.playerScore) {
            updates.avg_player_score = 
                (current?.avg_player_score || 200) * 0.9 + gameResult.playerScore * 0.1;
        }
        if (gameResult.gameDuration) {
            updates.avg_game_duration = 
                (current?.avg_game_duration || 60000) * 0.9 + gameResult.gameDuration * 0.1;
        }

        // Update database
        const { error: updateError } = await supabaseAdmin
            .from('bot_learning_global_v2')
            .update(updates)
            .eq('id', GLOBAL_BOT_ID);

        if (updateError) throw updateError;

        const winRate = ((updates.total_wins || current?.total_wins || 0) / 
            updates.total_games * 100).toFixed(1);

        console.log(`[AI Learning] Game recorded | Total: ${updates.total_games} | Win Rate: ${winRate}%`);

        return res.status(200).json({
            success: true,
            totalGames: updates.total_games,
            winRate
        });
        
    } catch (error) {
        console.error('[Simple Update] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// ==================== HELPERS ====================

function getDefaultLearningData() {
    return {
        version: 2,
        stats: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0 },
        powers: {
            freeze: { used: 0, effectiveness: 0.5 },
            shield: { used: 0, effectiveness: 0.5 },
            radar: { used: 0, effectiveness: 0.5 },
            safeburst: { used: 0, effectiveness: 0.5 }
        },
        strategies: {
            aggressive: { used: 0, rate: 0.33 },
            defensive: { used: 0, rate: 0.33 },
            balanced: { used: 0, rate: 0.34 }
        },
        patterns: {
            avgPlayerScore: 200,
            avgPlayerSpeed: 5,
            avgGameDuration: 60000
        }
    };
}

function getMostEffectivePower(global) {
    if (!global) return 'radar';
    
    const powers = {
        freeze: global.freeze_effectiveness || 0.5,
        shield: global.shield_effectiveness || 0.5,
        radar: global.radar_effectiveness || 0.5,
        safeburst: global.safeburst_effectiveness || 0.5
    };
    
    return Object.entries(powers)
        .sort(([,a], [,b]) => b - a)[0][0];
}
