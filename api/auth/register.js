import { supabaseAdmin } from '../../lib/supabase.js';

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
        const { email, password, username } = req.body;

        if (!email || !password || !username) {
            return res.status(400).json({ error: 'Email, password and username are required' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be 3-20 characters' });
        }

        // Check if username already exists
        const { data: existingUser } = await supabaseAdmin
            .from('profiles')
            .select('username')
            .eq('username', username)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Create auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });

        if (authError) {
            return res.status(400).json({ error: authError.message });
        }

        // Create profile
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
                id: authData.user.id,
                username,
                email,
                created_at: new Date().toISOString()
            });

        if (profileError) {
            // Rollback: delete auth user if profile creation fails
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return res.status(400).json({ error: 'Failed to create profile' });
        }

        // Create initial stats
        await supabaseAdmin
            .from('player_stats')
            .insert({
                user_id: authData.user.id,
                wins: 0,
                losses: 0,
                draws: 0,
                total_games: 0,
                win_streak: 0,
                best_streak: 0,
                total_score: 0,
                rating: 1000
            });

        return res.status(201).json({
            success: true,
            message: 'Account created successfully',
            user: {
                id: authData.user.id,
                email,
                username
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
