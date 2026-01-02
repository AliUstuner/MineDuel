// MineDuel Supabase Client for Frontend
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://gmlktqaggxzsbskgmazl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbGt0cWFnZ3h6c2Jza2dtYXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTE1NzYsImV4cCI6MjA4Mjc2NzU3Nn0.x3HtFTXqPEgDwguqUdGtMaJUaB2jDU1FNe6_I8UWels';

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

export async function signInWithGoogle() {
    // Use current origin for redirect (works for both localhost and production)
    const redirectUrl = window.location.origin;
    console.log('Google OAuth redirect URL:', redirectUrl);
    
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectUrl
        }
    });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
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

export async function createProfile(userId, email, username) {
    const { data, error } = await supabase
        .from('profiles')
        .insert({
            id: userId,
            email: email,
            username: username
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateProfile(userId, updates) {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
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

export async function getMyQueueStatus(userId) {
    const { data, error } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error) return null;
    return data;
}

export async function getGameInfo(gameId) {
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();

    if (error) return null;
    return data;
}

export async function getOpponentFromQueue(odaGameId, myUserId) {
    // Find the other player in the queue with same match_id
    const { data, error } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('match_id', odaGameId)
        .neq('user_id', myUserId)
        .single();

    if (error) return null;
    return data;
}

export async function findAllInQueue(difficulty, excludeUserId) {
    const { data, error } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('difficulty', difficulty)
        .neq('user_id', excludeUserId)
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) return [];
    return data || [];
}

export async function updateMatchStatus(odaId, odaUsers, odaStatus, matchId = null) {
    const { error } = await supabase
        .from('matchmaking_queue')
        .update({ status: odaStatus, match_id: matchId })
        .eq('user_id', odaUsers);
    if (error) throw error;
}

// ==================== GAMES ====================

export async function createGame(player1Id, player2Id, difficulty, player1Name = null, player2Name = null) {
    const gameData = {
        player1_id: player1Id,
        player2_id: player2Id,
        difficulty,
        status: 'in_progress',
        player1_score: 0,
        player2_score: 0
    };
    
    // Add player names to board_state for storage (since we don't have separate columns)
    if (player1Name || player2Name) {
        gameData.board_state = {
            player1_name: player1Name,
            player2_name: player2Name
        };
    }
    
    const { data, error } = await supabase
        .from('games')
        .insert(gameData)
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
