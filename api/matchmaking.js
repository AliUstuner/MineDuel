import { supabaseAdmin } from '../lib/supabase.js';
import { verifyToken } from '../lib/authMiddleware.js';

// In-memory matchmaking queue (for serverless, consider using Redis/Supabase Realtime in production)
const matchmakingQueues = {
    easy: [],
    medium: [],
    hard: []
};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const user = await verifyToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // POST - Join matchmaking queue
    if (req.method === 'POST') {
        try {
            const { difficulty = 'medium' } = req.body;

            // Get user profile and stats
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('username, avatar_url')
                .eq('id', user.id)
                .single();

            const { data: stats } = await supabaseAdmin
                .from('player_stats')
                .select('rating')
                .eq('user_id', user.id)
                .single();

            const playerData = {
                id: user.id,
                username: profile?.username || 'Player',
                avatar_url: profile?.avatar_url,
                rating: stats?.rating || 1000,
                joinedAt: Date.now()
            };

            // Check if already in queue (using Supabase)
            const { data: existingQueue } = await supabaseAdmin
                .from('matchmaking_queue')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (existingQueue) {
                return res.status(400).json({ error: 'Already in matchmaking queue' });
            }

            // Add to queue
            await supabaseAdmin
                .from('matchmaking_queue')
                .insert({
                    user_id: user.id,
                    username: playerData.username,
                    avatar_url: playerData.avatar_url,
                    rating: playerData.rating,
                    difficulty,
                    status: 'waiting',
                    created_at: new Date().toISOString()
                });

            // Try to find a match
            const { data: waitingPlayers } = await supabaseAdmin
                .from('matchmaking_queue')
                .select('*')
                .eq('difficulty', difficulty)
                .eq('status', 'waiting')
                .neq('user_id', user.id)
                .order('created_at', { ascending: true })
                .limit(1);

            if (waitingPlayers && waitingPlayers.length > 0) {
                const opponent = waitingPlayers[0];

                // Create match
                const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                // Update both players in queue
                await supabaseAdmin
                    .from('matchmaking_queue')
                    .update({ status: 'matched', match_id: matchId })
                    .in('user_id', [user.id, opponent.user_id]);

                return res.status(200).json({
                    status: 'matched',
                    matchId,
                    opponent: {
                        id: opponent.user_id,
                        username: opponent.username,
                        avatar_url: opponent.avatar_url,
                        rating: opponent.rating
                    },
                    difficulty
                });
            }

            return res.status(200).json({
                status: 'waiting',
                message: 'Added to matchmaking queue',
                difficulty,
                position: 1
            });
        } catch (error) {
            console.error('Matchmaking error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // GET - Check matchmaking status
    if (req.method === 'GET') {
        try {
            const { data: queueEntry } = await supabaseAdmin
                .from('matchmaking_queue')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (!queueEntry) {
                return res.status(200).json({ status: 'not_in_queue' });
            }

            if (queueEntry.status === 'matched') {
                // Get opponent info
                const { data: matchedPlayers } = await supabaseAdmin
                    .from('matchmaking_queue')
                    .select('*')
                    .eq('match_id', queueEntry.match_id)
                    .neq('user_id', user.id);

                const opponent = matchedPlayers?.[0];

                // Clean up queue entries
                await supabaseAdmin
                    .from('matchmaking_queue')
                    .delete()
                    .eq('match_id', queueEntry.match_id);

                return res.status(200).json({
                    status: 'matched',
                    matchId: queueEntry.match_id,
                    opponent: opponent ? {
                        id: opponent.user_id,
                        username: opponent.username,
                        avatar_url: opponent.avatar_url,
                        rating: opponent.rating
                    } : null,
                    difficulty: queueEntry.difficulty
                });
            }

            // Get queue position
            const { count } = await supabaseAdmin
                .from('matchmaking_queue')
                .select('*', { count: 'exact', head: true })
                .eq('difficulty', queueEntry.difficulty)
                .eq('status', 'waiting')
                .lt('created_at', queueEntry.created_at);

            return res.status(200).json({
                status: 'waiting',
                difficulty: queueEntry.difficulty,
                position: (count || 0) + 1,
                waitTime: Math.floor((Date.now() - new Date(queueEntry.created_at).getTime()) / 1000)
            });
        } catch (error) {
            console.error('Check matchmaking error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // DELETE - Leave matchmaking queue
    if (req.method === 'DELETE') {
        try {
            await supabaseAdmin
                .from('matchmaking_queue')
                .delete()
                .eq('user_id', user.id);

            return res.status(200).json({
                success: true,
                message: 'Left matchmaking queue'
            });
        } catch (error) {
            console.error('Leave queue error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
