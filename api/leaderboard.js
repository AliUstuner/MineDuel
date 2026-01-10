import { supabaseAdmin } from '../lib/supabase.js';

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
        const { type = 'rating', limit = 50, difficulty } = req.query;

        let query = supabaseAdmin
            .from('player_stats')
            .select(`
                user_id,
                wins,
                losses,
                draws,
                total_games,
                total_score,
                win_streak,
                best_streak,
                rating,
                profile:profiles!player_stats_user_id_fkey(username, avatar_url)
            `)
            .gte('total_games', 1);

        // Sort by type
        switch (type) {
            case 'wins':
                query = query.order('wins', { ascending: false });
                break;
            case 'streak':
                query = query.order('best_streak', { ascending: false });
                break;
            case 'score':
                query = query.order('total_score', { ascending: false });
                break;
            case 'rating':
            default:
                query = query.order('rating', { ascending: false });
                break;
        }

        query = query.limit(parseInt(limit));

        const { data: leaderboard, error } = await query;

        if (error) {
            console.error('Leaderboard error:', error);
            return res.status(400).json({ error: error.message });
        }

        // Add rank to each entry
        const rankedLeaderboard = leaderboard?.map((entry, index) => ({
            rank: index + 1,
            ...entry,
            username: entry.profile?.username || 'Unknown',
            avatar_url: entry.profile?.avatar_url
        }));

        return res.status(200).json({
            type,
            leaderboard: rankedLeaderboard || []
        });
    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
