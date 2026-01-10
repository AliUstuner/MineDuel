import { supabase, supabaseAdmin } from '../../lib/supabase.js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Sign in with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Get user profile
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();

        // Get user stats
        const { data: stats } = await supabaseAdmin
            .from('player_stats')
            .select('*')
            .eq('user_id', authData.user.id)
            .single();

        // Update last login
        await supabaseAdmin
            .from('profiles')
            .update({ last_login: new Date().toISOString() })
            .eq('id', authData.user.id);

        return res.status(200).json({
            success: true,
            user: {
                id: authData.user.id,
                email: authData.user.email,
                username: profile?.username,
                avatar: profile?.avatar_url
            },
            stats: stats || {
                wins: 0,
                losses: 0,
                draws: 0,
                total_games: 0,
                rating: 1000
            },
            session: {
                access_token: authData.session.access_token,
                refresh_token: authData.session.refresh_token,
                expires_at: authData.session.expires_at
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
