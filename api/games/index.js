import { supabaseAdmin } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // POST - Save game result
    if (req.method === 'POST') {
        const user = await verifyToken(req);
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const {
                opponent_id,
                winner_id,
                player1_score,
                player2_score,
                difficulty,
                duration,
                board_state
            } = req.body;

            // Create game record
            const { data: game, error: gameError } = await supabaseAdmin
                .from('games')
                .insert({
                    player1_id: user.id,
                    player2_id: opponent_id,
                    winner_id,
                    player1_score,
                    player2_score,
                    difficulty,
                    duration,
                    board_state,
                    status: 'completed',
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (gameError) {
                console.error('Game save error:', gameError);
                return res.status(400).json({ error: 'Failed to save game' });
            }

            // Update player stats
            const isWinner = winner_id === user.id;
            const isDraw = winner_id === null;

            // Get current stats
            const { data: currentStats } = await supabaseAdmin
                .from('player_stats')
                .select('*')
                .eq('user_id', user.id)
                .single();

            const newWinStreak = isWinner ? (currentStats?.win_streak || 0) + 1 : 0;
            const bestStreak = Math.max(currentStats?.best_streak || 0, newWinStreak);

            // Calculate rating change (ELO-like system)
            const ratingChange = isWinner ? 25 : (isDraw ? 0 : -20);
            const newRating = Math.max(0, (currentStats?.rating || 1000) + ratingChange);

            await supabaseAdmin
                .from('player_stats')
                .upsert({
                    user_id: user.id,
                    wins: (currentStats?.wins || 0) + (isWinner ? 1 : 0),
                    losses: (currentStats?.losses || 0) + (!isWinner && !isDraw ? 1 : 0),
                    draws: (currentStats?.draws || 0) + (isDraw ? 1 : 0),
                    total_games: (currentStats?.total_games || 0) + 1,
                    total_score: (currentStats?.total_score || 0) + (player1_score || 0),
                    win_streak: newWinStreak,
                    best_streak: bestStreak,
                    rating: newRating
                });

            // Also update opponent stats if they exist
            if (opponent_id) {
                const { data: opponentStats } = await supabaseAdmin
                    .from('player_stats')
                    .select('*')
                    .eq('user_id', opponent_id)
                    .single();

                const opponentIsWinner = winner_id === opponent_id;
                const opponentNewStreak = opponentIsWinner ? (opponentStats?.win_streak || 0) + 1 : 0;
                const opponentBestStreak = Math.max(opponentStats?.best_streak || 0, opponentNewStreak);
                const opponentRatingChange = opponentIsWinner ? 25 : (isDraw ? 0 : -20);
                const opponentNewRating = Math.max(0, (opponentStats?.rating || 1000) + opponentRatingChange);

                await supabaseAdmin
                    .from('player_stats')
                    .upsert({
                        user_id: opponent_id,
                        wins: (opponentStats?.wins || 0) + (opponentIsWinner ? 1 : 0),
                        losses: (opponentStats?.losses || 0) + (!opponentIsWinner && !isDraw ? 1 : 0),
                        draws: (opponentStats?.draws || 0) + (isDraw ? 1 : 0),
                        total_games: (opponentStats?.total_games || 0) + 1,
                        total_score: (opponentStats?.total_score || 0) + (player2_score || 0),
                        win_streak: opponentNewStreak,
                        best_streak: opponentBestStreak,
                        rating: opponentNewRating
                    });
            }

            return res.status(201).json({
                success: true,
                game,
                newRating,
                ratingChange
            });
        } catch (error) {
            console.error('Save game error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // GET - Get game history
    if (req.method === 'GET') {
        try {
            const { user_id, limit = 20, offset = 0 } = req.query;

            let query = supabaseAdmin
                .from('games')
                .select(`
                    id,
                    difficulty,
                    winner_id,
                    player1_score,
                    player2_score,
                    duration,
                    status,
                    created_at,
                    player1:profiles!games_player1_id_fkey(id, username, avatar_url),
                    player2:profiles!games_player2_id_fkey(id, username, avatar_url)
                `)
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

            if (user_id) {
                query = query.or(`player1_id.eq.${user_id},player2_id.eq.${user_id}`);
            }

            const { data: games, error } = await query;

            if (error) {
                return res.status(400).json({ error: error.message });
            }

            return res.status(200).json({
                games,
                count: games?.length || 0
            });
        } catch (error) {
            console.error('Get games error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
