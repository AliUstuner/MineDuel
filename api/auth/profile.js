import { supabaseAdmin } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Verify token
    const user = await verifyToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method === 'GET') {
        try {
            // Get profile
            const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profileError) {
                return res.status(404).json({ error: 'Profile not found' });
            }

            // Get stats
            const { data: stats } = await supabaseAdmin
                .from('player_stats')
                .select('*')
                .eq('user_id', user.id)
                .single();

            // Get recent games
            const { data: recentGames } = await supabaseAdmin
                .from('games')
                .select(`
                    id,
                    difficulty,
                    winner_id,
                    player1_score,
                    player2_score,
                    duration,
                    created_at,
                    player1:profiles!games_player1_id_fkey(username),
                    player2:profiles!games_player2_id_fkey(username)
                `)
                .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
                .order('created_at', { ascending: false })
                .limit(10);

            return res.status(200).json({
                profile,
                stats: stats || { wins: 0, losses: 0, draws: 0, total_games: 0, rating: 1000 },
                recentGames: recentGames || []
            });
        } catch (error) {
            console.error('Get profile error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { username, avatar_url } = req.body;

            const updates = {};
            if (username) {
                // Check if username is taken
                const { data: existing } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('username', username)
                    .neq('id', user.id)
                    .single();

                if (existing) {
                    return res.status(400).json({ error: 'Username already taken' });
                }
                updates.username = username;
            }
            if (avatar_url) {
                updates.avatar_url = avatar_url;
            }

            const { data, error } = await supabaseAdmin
                .from('profiles')
                .update(updates)
                .eq('id', user.id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ error: error.message });
            }

            return res.status(200).json({
                success: true,
                profile: data
            });
        } catch (error) {
            console.error('Update profile error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
