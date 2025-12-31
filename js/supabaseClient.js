// MineDuel Supabase Client for Frontend
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://gmlktqaggxzsbskgmazl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Csv_EUq5LN8VVvt1vvuYtQ_CgYtx0dg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== AUTH ====================

export async function signUp(email, password, username) {
    // First create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { username }
        }
    });

    if (authError) throw authError;

    // Create profile
    if (authData.user) {
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authData.user.id,
                username,
                email,
                password_hash: 'supabase_auth' // Auth managed by Supabase
            });

        if (profileError) console.error('Profile error:', profileError);

        // Create initial stats
        await supabase
            .from('player_stats')
            .insert({
                user_id: authData.user.id,
                wins: 0,
                losses: 0,
                draws: 0,
                total_games: 0,
                rating: 1000
            });
    }

    return authData;
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function getProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data;
}

export async function getStats(userId) {
    const { data, error } = await supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (error) return { wins: 0, losses: 0, draws: 0, total_games: 0, rating: 1000 };
    return data;
}

// ==================== MATCHMAKING ====================

export async function joinMatchmaking(userId, username, difficulty, rating = 1000) {
    // Remove any existing queue entry
    await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', userId);

    // Add to queue
    const { data, error } = await supabase
        .from('matchmaking_queue')
        .insert({
            user_id: userId,
            username,
            difficulty,
            rating,
            status: 'waiting'
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function leaveMatchmaking(userId) {
    const { error } = await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', userId);
    if (error) throw error;
}

export async function findMatch(difficulty, currentUserId) {
    const { data, error } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('difficulty', difficulty)
        .eq('status', 'waiting')
        .neq('user_id', currentUserId)
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) throw error;
    return data?.[0] || null;
}

export async function updateMatchStatus(odaId, odaUsers, odaStatus, matchId = null) {
    const { error } = await supabase
        .from('matchmaking_queue')
        .update({ status: odaStatus, match_id: matchId })
        .eq('user_id', odaUsers);
    if (error) throw error;
}

// ==================== GAMES ====================

export async function createGame(player1Id, player2Id, difficulty) {
    const { data, error } = await supabase
        .from('games')
        .insert({
            player1_id: player1Id,
            player2_id: player2Id,
            difficulty,
            status: 'in_progress',
            player1_score: 0,
            player2_score: 0
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateGame(gameId, updates) {
    const { data, error } = await supabase
        .from('games')
        .update(updates)
        .eq('id', gameId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getGameHistory(userId, limit = 10) {
    const { data, error } = await supabase
        .from('games')
        .select(`
            *,
            player1:profiles!games_player1_id_fkey(username),
            player2:profiles!games_player2_id_fkey(username)
        `)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

// ==================== LEADERBOARD ====================

export async function getLeaderboard(type = 'rating', limit = 50) {
    let query = supabase
        .from('player_stats')
        .select(`
            *,
            profile:profiles!player_stats_user_id_fkey(username)
        `)
        .gte('total_games', 1);

    switch (type) {
        case 'wins':
            query = query.order('wins', { ascending: false });
            break;
        case 'streak':
            query = query.order('best_streak', { ascending: false });
            break;
        default:
            query = query.order('rating', { ascending: false });
    }

    const { data, error } = await query.limit(limit);
    if (error) throw error;
    
    return data?.map((entry, index) => ({
        rank: index + 1,
        ...entry,
        username: entry.profile?.username || 'Unknown'
    })) || [];
}

// ==================== REALTIME ====================

export function subscribeToMatchmaking(difficulty, callback) {
    return supabase
        .channel('matchmaking_' + difficulty)
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'matchmaking_queue', filter: `difficulty=eq.${difficulty}` },
            callback
        )
        .subscribe();
}

export function subscribeToGame(gameId, callback) {
    return supabase
        .channel('game_' + gameId)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
            callback
        )
        .subscribe();
}

// Game channel for real-time moves
export function createGameChannel(gameId) {
    return supabase.channel('game_room_' + gameId, {
        config: {
            broadcast: { self: false }
        }
    });
}

export function unsubscribe(channel) {
    supabase.removeChannel(channel);
}

// ==================== STATS UPDATE ====================

export async function updatePlayerStats(userId, isWinner, isDraw, score) {
    const currentStats = await getStats(userId);
    
    const newWinStreak = isWinner ? (currentStats.win_streak || 0) + 1 : 0;
    const bestStreak = Math.max(currentStats.best_streak || 0, newWinStreak);
    const ratingChange = isWinner ? 25 : (isDraw ? 0 : -20);
    const newRating = Math.max(0, (currentStats.rating || 1000) + ratingChange);

    const { error } = await supabase
        .from('player_stats')
        .update({
            wins: (currentStats.wins || 0) + (isWinner ? 1 : 0),
            losses: (currentStats.losses || 0) + (!isWinner && !isDraw ? 1 : 0),
            draws: (currentStats.draws || 0) + (isDraw ? 1 : 0),
            total_games: (currentStats.total_games || 0) + 1,
            total_score: (currentStats.total_score || 0) + score,
            win_streak: newWinStreak,
            best_streak: bestStreak,
            rating: newRating
        })
        .eq('user_id', userId);

    if (error) throw error;
    return { newRating, ratingChange };
}

export default supabase;
