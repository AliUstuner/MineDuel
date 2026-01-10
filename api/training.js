import { supabaseAdmin } from '../config/supabase.js';

/**
 * Training Data API
 * Deep Learning için oyun verilerini kaydeder
 */

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'POST') {
            return await saveTrainingData(req, res);
        } else if (req.method === 'GET') {
            return await getTrainingStats(req, res);
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[TRAINING API] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Oyun verisini kaydet
 */
async function saveTrainingData(req, res) {
    const { game, moves, powers, snapshots } = req.body;

    if (!game || !game.id) {
        return res.status(400).json({ error: 'Game data required' });
    }

    console.log(`[TRAINING] Saving game: ${game.id} with ${moves?.length || 0} moves`);

    try {
        // 1. Ana oyun kaydı
        const { error: gameError } = await supabaseAdmin
            .from('training_games')
            .upsert({
                game_id: game.id,
                grid_size: game.gridSize || 10,
                mine_count: game.mineCount || 15,
                difficulty: game.difficulty || 'medium',
                match_duration: game.matchDuration || 120000,
                player1_type: game.player1Type || 'human',
                player2_type: game.player2Type || 'bot_medium',
                player1_name: game.player1Name,
                player2_name: game.player2Name,
                winner: game.winner,
                win_reason: game.winReason,
                player1_score: game.player1Score || 0,
                player2_score: game.player2Score || 0,
                game_duration: game.duration,
                total_moves: moves?.length || 0,
                total_power_uses: powers?.length || 0,
                quality_score: calculateQuality(game, moves),
                mine_positions: game.minePositions || []
            }, {
                onConflict: 'game_id'
            });

        if (gameError) {
            console.error('[TRAINING] Game insert error:', gameError);
            // Tablo yoksa bile devam et
        }

        // 2. Hamleleri kaydet (batch insert)
        if (moves && moves.length > 0) {
            const moveRecords = moves.map((move, index) => ({
                game_id: game.id,
                move_number: index + 1,
                player: move.player,
                player_type: move.playerType || (move.player === 'player1' ? game.player1Type : game.player2Type),
                move_type: move.type,
                cell_x: move.x,
                cell_y: move.y,
                result: move.result,
                cell_value: move.cellValue,
                cells_revealed: move.cellsRevealed || 1,
                score_before: move.scoreBefore || 0,
                score_after: move.scoreAfter || move.currentScore || 0,
                score_change: move.scoreChange || 0,
                opponent_score: move.opponentScore || 0,
                game_time: move.gameTime || 0,
                think_time: move.thinkTime || move.timeSinceLastMove || 0,
                board_state: move.boardState || null
            }));

            // Batch insert - 50 kayıt aralıklarla
            for (let i = 0; i < moveRecords.length; i += 50) {
                const batch = moveRecords.slice(i, i + 50);
                const { error: movesError } = await supabaseAdmin
                    .from('training_moves')
                    .insert(batch);
                
                if (movesError) {
                    console.error('[TRAINING] Moves batch insert error:', movesError);
                }
            }
        }

        // 3. Güç kullanımlarını kaydet
        if (powers && powers.length > 0) {
            const powerRecords = powers.map(power => ({
                game_id: game.id,
                player: power.player,
                player_type: power.playerType || (power.player === 'player1' ? game.player1Type : game.player2Type),
                power_type: power.type || power.powerType,
                power_cost: power.cost || 0,
                game_time: power.gameTime || 0,
                time_remaining: power.timeRemaining,
                user_score: power.userScore || power.scoreBefore || 0,
                opponent_score: power.opponentScore || 0,
                score_diff: (power.userScore || 0) - (power.opponentScore || 0),
                effect_data: power.effectData || power.effect || null,
                decision_reason: power.reason || null
            }));

            const { error: powersError } = await supabaseAdmin
                .from('training_powers')
                .insert(powerRecords);

            if (powersError) {
                console.error('[TRAINING] Powers insert error:', powersError);
            }
        }

        // 4. Snapshot'ları kaydet (varsa)
        if (snapshots && snapshots.length > 0) {
            const snapshotRecords = snapshots.map(snap => ({
                game_id: game.id,
                move_number: snap.moveNumber,
                board_data: snap.boardData,
                optimal_move_x: snap.optimalX,
                optimal_move_y: snap.optimalY,
                optimal_move_type: snap.optimalType,
                situation_difficulty: snap.difficulty || 0.5
            }));

            const { error: snapError } = await supabaseAdmin
                .from('training_snapshots')
                .insert(snapshotRecords);

            if (snapError) {
                console.error('[TRAINING] Snapshots insert error:', snapError);
            }
        }

        console.log(`[TRAINING] Game ${game.id} saved successfully`);

        return res.status(200).json({
            success: true,
            gameId: game.id,
            movesCount: moves?.length || 0,
            powersCount: powers?.length || 0
        });

    } catch (error) {
        console.error('[TRAINING] Save error:', error);
        return res.status(500).json({ error: 'Failed to save training data' });
    }
}

/**
 * Eğitim istatistiklerini getir
 */
async function getTrainingStats(req, res) {
    try {
        const { data: stats, error } = await supabaseAdmin
            .from('training_stats')
            .select('*')
            .single();

        if (error) {
            // Tablo yoksa varsayılan döndür
            return res.status(200).json({
                totalGames: 0,
                totalMoves: 0,
                totalHumanMoves: 0,
                totalBotMoves: 0,
                avgGameQuality: 0
            });
        }

        return res.status(200).json({
            totalGames: stats.total_games || 0,
            totalMoves: stats.total_moves || 0,
            totalHumanMoves: stats.total_human_moves || 0,
            totalBotMoves: stats.total_bot_moves || 0,
            humanVsBotGames: stats.human_vs_bot_games || 0,
            avgGameQuality: stats.avg_game_quality || 0,
            verifiedGames: stats.verified_games || 0,
            lastUpdated: stats.last_updated
        });
    } catch (error) {
        console.error('[TRAINING] Stats error:', error);
        return res.status(500).json({ error: 'Failed to get stats' });
    }
}

/**
 * Oyun kalitesi hesapla (0-1)
 */
function calculateQuality(game, moves) {
    let quality = 0;

    // Hamle sayısı skoru
    const moveCount = moves?.length || 0;
    quality += Math.min(moveCount / 100, 0.3);

    // İnsan oranı
    if (game.player1Type === 'human' || game.player2Type === 'human') {
        quality += 0.3;
    }

    // Süre skoru
    const duration = game.duration || 0;
    if (duration >= 30000 && duration <= 120000) {
        quality += 0.3;
    } else if (duration >= 15000 && duration <= 150000) {
        quality += 0.2;
    } else {
        quality += 0.1;
    }

    // Tamamlanma skoru
    if (game.winner && game.winReason) {
        quality += 0.1;
    }

    return Math.min(quality, 1.0);
}
