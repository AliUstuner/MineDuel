import { supabaseAdmin } from '../config/supabase.js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
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

        // Calculate win rate
        const winRate = stats.total_games > 0 
            ? ((stats.wins / stats.total_games) * 100).toFixed(1)
            : 0;

        // Get rank
        const { count: rank } = await supabaseAdmin
            .from('player_stats')
            .select('*', { count: 'exact', head: true })
            .gt('rating', stats.rating);

        return res.status(200).json({
            ...stats,
            win_rate: parseFloat(winRate),
            rank: (rank || 0) + 1
        });
    } catch (error) {
        console.error('Stats error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
