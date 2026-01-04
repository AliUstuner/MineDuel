// MineDuel Supabase Client for Frontend
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://gmlktqaggxzsbskgmazl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbGt0cWFnZ3h6c2Jza2dtYXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTE1NzYsImV4cCI6MjA4Mjc2NzU3Nn0.x3HtFTXqPEgDwguqUdGtMaJUaB2jDU1FNe6_I8UWels';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test connection on load
(async () => {
    try {
        const { data, error } = await supabase.from('matchmaking_queue').select('count').limit(1);
        if (error) {
            console.error('[SUPABASE] Connection test FAILED:', error);
        } else {
            console.log('[SUPABASE] Connection OK');
        }
    } catch (e) {
        console.error('[SUPABASE] Connection exception:', e);
    }
})();

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
    // Use upsert to handle both create and update
    const { data, error } = await supabase
        .from('profiles')
        .upsert({
            id: userId,
            email: email,
            username: username
        }, { onConflict: 'id' })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateProfile(userId, updates) {
    // First try upsert in case profile doesn't exist
    const { data, error } = await supabase
        .from('profiles')
        .upsert({
            id: userId,
            ...updates
        }, { onConflict: 'id' })
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
    console.log('[SUPABASE] joinMatchmaking called:', { userId, username, difficulty });
    
    // Remove any existing queue entry
    const deleteResult = await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', userId);
    console.log('[SUPABASE] Delete old entry result:', deleteResult);

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

    console.log('[SUPABASE] Insert result:', { data, error });
    if (error) {
        console.error('[SUPABASE] Insert error:', error);
        throw error;
    }
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
    console.log('[SUPABASE] findMatch called:', { difficulty, currentUserId });
    
    const { data, error } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('difficulty', difficulty)
        .eq('status', 'waiting')
        .neq('user_id', currentUserId)
        .order('created_at', { ascending: true })
        .limit(1);

    console.log('[SUPABASE] findMatch result:', { data, error });
    
    if (error) {
        console.error('[SUPABASE] findMatch error:', error);
        throw error;
    }
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
    
    // Extract values from board_state if available
    if (data && data.board_state) {
        data.mine_seed = data.board_state.mine_seed;
        data.grid_size = data.board_state.grid_size;
        data.mine_count = data.board_state.mine_count;
        data.player1_name = data.board_state.player1_name;
        data.player2_name = data.board_state.player2_name;
    }
    
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
    // Same config as gameSupabase.js
    const config = {
        easy: { gridSize: 8, mineCount: 12 },
        medium: { gridSize: 10, mineCount: 20 },
        hard: { gridSize: 12, mineCount: 35 }
    };
    
    const { gridSize, mineCount } = config[difficulty] || config.medium;
    
    // Generate a unique seed for mines - this makes the game verifiable
    const mineSeed = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${player1Id}_${player2Id}`;
    
    // Base game data (compatible with old schema)
    const gameData = {
        player1_id: player1Id,
        player2_id: player2Id,
        difficulty,
        status: 'in_progress',
        player1_score: 0,
        player2_score: 0
    };
    
    // Store player names in board_state for backwards compatibility
    gameData.board_state = {
        player1_name: player1Name,
        player2_name: player2Name,
        mine_seed: mineSeed,
        grid_size: gridSize,
        mine_count: mineCount
    };
    
    console.log('[SUPABASE] createGame called');
    
    const { data, error } = await supabase
        .from('games')
        .insert(gameData)
        .select()
        .single();

    if (error) {
        console.error('[SUPABASE] createGame error:', error);
        throw error;
    }
    
    console.log('[SUPABASE] createGame success, id:', data.id);
    
    // Return with extracted values for easy access
    return { 
        ...data, 
        mineSeed, 
        gridSize, 
        mineCount,
        player1_name: player1Name,
        player2_name: player2Name
    };
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

// ==================== SECURE GAME FUNCTIONS ====================

// Create a secure game with server-generated mine seed
export async function createSecureGame(player1Id, player1Name, player2Id, player2Name, difficulty) {
    const config = {
        easy: { gridSize: 8, mineCount: 10 },
        medium: { gridSize: 10, mineCount: 20 },
        hard: { gridSize: 12, mineCount: 35 }
    };
    
    const { gridSize, mineCount } = config[difficulty] || config.medium;
    
    // Generate a unique seed for mines
    const mineSeed = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${player1Id}_${player2Id}`;
    
    const { data, error } = await supabase
        .from('games')
        .insert({
            player1_id: player1Id,
            player2_id: player2Id,
            player1_name: player1Name,
            player2_name: player2Name,
            difficulty,
            status: 'in_progress',
            player1_score: 0,
            player2_score: 0,
            player1_server_score: 0,
            player2_server_score: 0,
            mine_seed: mineSeed,
            grid_size: gridSize,
            mine_count: mineCount,
            player1_moves: [],
            player2_moves: [],
            started_at: new Date().toISOString(),
            time_limit: 120
        })
        .select()
        .single();

    if (error) throw error;
    return { ...data, mineSeed, gridSize, mineCount };
}

// Validate and record a move on the server
export async function makeSecureMove(gameId, playerId, x, y, moveType = 'reveal') {
    const { data, error } = await supabase
        .rpc('make_move', {
            p_game_id: gameId,
            p_player_id: playerId,
            p_x: x,
            p_y: y,
            p_move_type: moveType
        });
    
    if (error) {
        console.error('Secure move error:', error);
        return { success: false, error: error.message };
    }
    
    return data;
}

// End game and get server-validated results
export async function endSecureGame(gameId) {
    const { data, error } = await supabase
        .rpc('end_game', {
            p_game_id: gameId
        });
    
    if (error) {
        console.error('End game error:', error);
        return { success: false, error: error.message };
    }
    
    return data;
}

// Get server-validated scores
export async function getServerScores(gameId) {
    const { data, error } = await supabase
        .from('games')
        .select('player1_server_score, player2_server_score, player1_id, player2_id, status')
        .eq('id', gameId)
        .single();
    
    if (error) return null;
    return data;
}

// Generate mines from seed - each player gets different mines based on their ID
export function generateMinesFromSeed(seed, gridSize, mineCount, safeX = -1, safeY = -1, playerId = '') {
    const mines = [];
    let i = 0;
    let attempts = 0;
    
    // Combine seed with player ID and safe position for unique generation per player
    const uniqueSeed = seed + '_' + playerId + '_safe_' + safeX + '_' + safeY;
    
    // Better hash function for more randomness
    const hashString = (str) => {
        let hash = 5381;
        for (let j = 0; j < str.length; j++) {
            hash = ((hash << 5) + hash) ^ str.charCodeAt(j);
        }
        return Math.abs(hash);
    };
    
    // Seed a pseudo-random number generator for better distribution
    const seededRandom = (seedStr, index) => {
        const h1 = hashString(seedStr + index + 'a');
        const h2 = hashString(seedStr + index + 'b');
        return ((h1 * 2654435761) ^ h2) >>> 0;
    };
    
    while (mines.length < mineCount && attempts < 2000) {
        // Use seeded random for better distribution
        const randX = seededRandom(uniqueSeed, i * 2);
        const randY = seededRandom(uniqueSeed, i * 2 + 1);
        
        const x = randX % gridSize;
        const y = randY % gridSize;
        
        // Check safe zone (3x3 around first click)
        const inSafeZone = safeX >= 0 && safeY >= 0 && 
                          x >= safeX - 1 && x <= safeX + 1 && 
                          y >= safeY - 1 && y <= safeY + 1;
        
        // Check if already exists
        const exists = mines.some(m => m.x === x && m.y === y);
        
        if (!inSafeZone && !exists) {
            mines.push({ x, y });
        }
        
        i++;
        attempts++;
    }
    
    console.log(`[MINES] Generated ${mines.length} mines for grid ${gridSize}x${gridSize}`);
    return mines;
}

export default supabase;
