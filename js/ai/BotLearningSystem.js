/**
 * BotLearningSystem.js - Global AI Learning System
 * 
 * This system handles:
 * 1. Recording game data for imitation learning
 * 2. Syncing with global learning database (Supabase)
 * 3. Loading learned patterns and strategies
 * 4. Tracking mistakes for pattern avoidance
 * 
 * The bot improves GLOBALLY across all players:
 * - Every game contributes to the global knowledge base
 * - New bot versions are deployed after retraining
 * - Older mistakes are reduced over time
 * 
 * @version 1.0
 */

export class BotLearningSystem {
    constructor(botCore) {
        this.bot = botCore;
        
        // API endpoint
        this.API_URL = '/api/stats';
        
        // Local storage key
        this.STORAGE_KEY = 'mineduel_bot_learning_v9';
        
        // Current game data
        this.currentGame = null;
        
        // Loaded global learning data
        this.globalData = null;
        this.globalDataLoaded = false;
        
        // Local learning data (fallback and cache)
        this.localData = this.loadLocalData();
        
        // Experience buffer for current game
        this.experienceBuffer = {
            moves: [],
            mistakes: [],
            successes: [],
            powers: [],
            playerMoves: []
        };
        
        // Load global data in background
        this.loadGlobalData();
    }
    
    // ==================== DATA LOADING ====================
    
    /**
     * Load local learning data
     */
    loadLocalData() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                if (this.isValidData(parsed)) {
                    console.log(`[Learning] Local data loaded: ${parsed.stats.gamesPlayed} games`);
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('[Learning] Failed to load local data:', e);
        }
        
        return this.getDefaultData();
    }
    
    /**
     * Get default learning data structure
     */
    getDefaultData() {
        return {
            version: 9,
            stats: {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                totalScore: 0
            },
            powers: {
                freeze: { used: 0, wonAfter: 0, effectiveness: 0.5 },
                shield: { used: 0, wonAfter: 0, effectiveness: 0.5 },
                radar: { used: 0, wonAfter: 0, effectiveness: 0.5 },
                safeburst: { used: 0, wonAfter: 0, effectiveness: 0.5 }
            },
            strategies: {
                aggressive: { used: 0, won: 0, rate: 0.33 },
                defensive: { used: 0, won: 0, rate: 0.33 },
                balanced: { used: 0, won: 0, rate: 0.34 }
            },
            patterns: {
                avgPlayerSpeed: 5,
                avgPlayerScore: 200,
                avgGameDuration: 60000
            },
            learnedPatterns: [],
            dangerZones: []
        };
    }
    
    /**
     * Validate data structure
     */
    isValidData(data) {
        if (!data || typeof data !== 'object') return false;
        if (!data.stats || !data.powers || !data.strategies) return false;
        if (typeof data.stats.gamesPlayed !== 'number') return false;
        if (data.stats.wins > data.stats.gamesPlayed) return false;
        return true;
    }
    
    /**
     * Load global data from Supabase
     */
    async loadGlobalData() {
        try {
            const response = await fetch(`${this.API_URL}?bot_learning=true`);
            
            if (!response.ok) {
                console.warn('[Learning] Failed to fetch global data:', response.status);
                return;
            }
            
            const data = await response.json();
            this.globalData = data;
            this.globalDataLoaded = true;
            
            // Merge global data with local
            this.mergeGlobalData(data);
            
            console.log(`[Learning] Global data loaded: ${data.stats?.gamesPlayed || 0} games, ${((data.stats?.wins / Math.max(1, data.stats?.gamesPlayed)) * 100).toFixed(1)}% win rate`);
            
        } catch (error) {
            console.warn('[Learning] Failed to load global data:', error);
        }
    }
    
    /**
     * Merge global data with local data
     */
    mergeGlobalData(global) {
        if (!global) return;
        
        const local = this.localData;
        const globalGames = global.stats?.gamesPlayed || 0;
        const localGames = local.stats?.gamesPlayed || 0;
        
        // Calculate weights based on game counts
        let globalWeight, localWeight;
        if (globalGames >= 20) {
            globalWeight = 0.8;
            localWeight = 0.2;
        } else if (globalGames >= 10) {
            globalWeight = 0.7;
            localWeight = 0.3;
        } else if (globalGames >= 5) {
            globalWeight = 0.6;
            localWeight = 0.4;
        } else {
            globalWeight = 0.5;
            localWeight = 0.5;
        }
        
        // Merge power effectiveness
        for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
            if (global.powers?.[power]) {
                const globalEff = global.powers[power].effectiveness || 0.5;
                const localEff = local.powers?.[power]?.effectiveness || 0.5;
                local.powers[power].effectiveness = 
                    globalEff * globalWeight + localEff * localWeight;
            }
        }
        
        // Merge strategy rates
        for (const strat of ['aggressive', 'defensive', 'balanced']) {
            if (global.strategies?.[strat]) {
                const globalRate = global.strategies[strat].rate || 0.33;
                const localRate = local.strategies?.[strat]?.rate || 0.33;
                local.strategies[strat].rate = 
                    globalRate * globalWeight + localRate * localWeight;
            }
        }
        
        // Merge patterns
        if (global.patterns) {
            local.patterns.avgPlayerSpeed = 
                (global.patterns.avgPlayerSpeed || 5) * globalWeight +
                (local.patterns?.avgPlayerSpeed || 5) * localWeight;
            local.patterns.avgPlayerScore = 
                (global.patterns.avgPlayerScore || 200) * globalWeight +
                (local.patterns?.avgPlayerScore || 200) * localWeight;
        }
        
        this.saveLocalData();
    }
    
    /**
     * Save local data
     */
    saveLocalData() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.localData));
        } catch (e) {
            console.warn('[Learning] Failed to save local data:', e);
        }
    }
    
    // ==================== GAME RECORDING ====================
    
    /**
     * Start recording a new game
     */
    startGame(config) {
        this.currentGame = {
            id: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            startTime: Date.now(),
            config: { ...config },
            moves: [],
            powers: [],
            playerMoves: []
        };
        
        this.experienceBuffer = {
            moves: [],
            mistakes: [],
            successes: [],
            powers: [],
            playerMoves: []
        };
    }
    
    /**
     * Record a successful move
     */
    recordSuccess(data) {
        const record = {
            ...data,
            timestamp: Date.now(),
            gamePhase: this.bot.gameState.phase,
            scoreDiff: this.bot.gameState.scoreDiff
        };
        
        this.experienceBuffer.successes.push(record);
        this.experienceBuffer.moves.push({ ...record, success: true });
    }
    
    /**
     * Record a mistake (mine hit or wrong flag)
     */
    recordMistake(data) {
        const record = {
            ...data,
            timestamp: Date.now(),
            gamePhase: this.bot.gameState.phase,
            scoreDiff: this.bot.gameState.scoreDiff,
            // Include neighbor state for pattern learning
            neighborState: this.getNeighborState(data.x, data.y)
        };
        
        this.experienceBuffer.mistakes.push(record);
        this.experienceBuffer.moves.push({ ...record, success: false });
        
        // Immediately learn from mistake
        this.learnFromMistake(record);
    }
    
    /**
     * Record power usage
     */
    recordPowerUsage(data) {
        const record = {
            ...data,
            timestamp: Date.now()
        };
        
        this.experienceBuffer.powers.push(record);
    }
    
    /**
     * Observe and record player move
     */
    observePlayerMove(moveData) {
        const record = {
            ...moveData,
            timestamp: Date.now()
        };
        
        this.experienceBuffer.playerMoves.push(record);
        
        // Learn from player's successful moves
        if (moveData.result !== 'mine' && moveData.cellsRevealed > 3) {
            this.learnFromPlayerSuccess(record);
        }
    }
    
    /**
     * Get neighbor state for pattern recording
     */
    getNeighborState(x, y) {
        if (!this.bot.board?.grid) return null;
        
        const neighbors = this.bot.getNeighbors(x, y);
        const state = {
            revealedCount: 0,
            flaggedCount: 0,
            hiddenCount: 0,
            numbers: []
        };
        
        for (const n of neighbors) {
            const cell = this.bot.board.grid[n.y]?.[n.x];
            if (!cell) continue;
            
            if (cell.isRevealed) {
                state.revealedCount++;
                if (cell.neighborCount > 0) {
                    state.numbers.push(cell.neighborCount);
                }
            } else if (cell.isFlagged) {
                state.flaggedCount++;
            } else {
                state.hiddenCount++;
            }
        }
        
        return state;
    }
    
    // ==================== LEARNING ====================
    
    /**
     * Learn from a mistake (immediate)
     */
    learnFromMistake(record) {
        if (!record.neighborState) return;
        
        // Add to probabilistic layer's danger patterns
        this.bot.probabilisticLayer.recordMistake(record.x, record.y, record);
        
        // Store pattern for global learning
        const pattern = {
            type: record.type,
            neighborState: record.neighborState,
            timestamp: Date.now()
        };
        
        this.localData.learnedPatterns.push(pattern);
        
        // Keep only last 50 patterns
        if (this.localData.learnedPatterns.length > 50) {
            this.localData.learnedPatterns.shift();
        }
        
        this.saveLocalData();
    }
    
    /**
     * Learn from player's successful move
     */
    learnFromPlayerSuccess(record) {
        // If player made a cascade, remember that area as potentially good
        if (record.cellsRevealed > 5) {
            console.log(`[Learning] Player cascade at (${record.x},${record.y}): ${record.cellsRevealed} cells`);
        }
    }
    
    /**
     * End game and sync to global
     */
    async endGame(result) {
        if (!this.currentGame) return;
        
        const gameData = {
            ...result,
            moves: this.experienceBuffer.moves.length,
            mistakes: this.experienceBuffer.mistakes.length,
            successes: this.experienceBuffer.successes.length,
            duration: Date.now() - this.currentGame.startTime
        };
        
        // Update local stats
        this.updateLocalStats(gameData);
        
        // Record strategy result
        this.bot.strategicLayer.recordStrategyResult(result.won);
        
        // Sync to global database
        await this.syncToGlobal(gameData);
        
        // Clear current game
        this.currentGame = null;
    }
    
    /**
     * Update local statistics
     */
    updateLocalStats(result) {
        const stats = this.localData.stats;
        
        stats.gamesPlayed++;
        stats.totalScore += result.myScore || 0;
        
        if (result.won) {
            stats.wins++;
        } else if (result.draw) {
            stats.draws++;
        } else {
            stats.losses++;
        }
        
        // Update power effectiveness
        for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
            const usage = this.bot.powerUsage[power];
            if (usage > 0) {
                const p = this.localData.powers[power];
                p.used += usage;
                if (result.won) {
                    p.wonAfter += usage;
                }
                p.effectiveness = p.used > 0 ? 
                    Math.max(0.2, Math.min(0.8, p.wonAfter / p.used)) : 0.5;
            }
        }
        
        // Update strategy rates
        const strategy = this.bot.strategicLayer.mood;
        const validStrategy = strategy === 'desperate' ? 'aggressive' : strategy;
        if (this.localData.strategies[validStrategy]) {
            this.localData.strategies[validStrategy].used++;
            if (result.won) {
                this.localData.strategies[validStrategy].won++;
            }
            const s = this.localData.strategies[validStrategy];
            s.rate = s.used > 0 ? Math.max(0.1, Math.min(0.9, s.won / s.used)) : 0.33;
        }
        
        // Update patterns
        const pat = this.localData.patterns;
        const weight = 0.1;
        if (result.opponentScore) {
            pat.avgPlayerScore = pat.avgPlayerScore * (1 - weight) + result.opponentScore * weight;
        }
        if (result.duration) {
            pat.avgGameDuration = pat.avgGameDuration * (1 - weight) + result.duration * weight;
        }
        
        this.saveLocalData();
    }
    
    /**
     * Sync game result to global database
     */
    async syncToGlobal(gameData) {
        try {
            const strategy = this.bot.strategicLayer.mood;
            const validStrategy = strategy === 'desperate' ? 'aggressive' : strategy;
            
            const payload = {
                gameResult: {
                    botWon: gameData.won,
                    draw: gameData.draw,
                    playerScore: gameData.opponentScore || 0,
                    botScore: gameData.myScore || 0,
                    playerSpeed: this.bot.strategicLayer.opponentAnalysis.moveSpeed || 5,
                    gameDuration: gameData.duration,
                    difficulty: this.bot.difficulty,
                    strategy: validStrategy,
                    powersUsed: { ...this.bot.powerUsage },
                    experience: {
                        totalMoves: gameData.moves,
                        successCount: gameData.successes,
                        mistakeCount: gameData.mistakes,
                        minesHit: this.bot.gameState.minesHit,
                        correctFlags: this.bot.gameState.correctFlags,
                        wrongFlags: this.bot.gameState.wrongFlags
                    }
                }
            };
            
            console.log('[Learning] Syncing to global...', {
                won: gameData.won,
                score: gameData.myScore,
                moves: gameData.moves
            });
            
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log(`[Learning] Synced! Global stats: ${result.totalGames} games, ${result.winRate}% win rate`);
            } else {
                console.warn('[Learning] Sync failed:', response.status);
                this.saveExperienceLocally(gameData);
            }
            
        } catch (error) {
            console.warn('[Learning] Sync error:', error);
            this.saveExperienceLocally(gameData);
        }
    }
    
    /**
     * Save experience locally when sync fails
     */
    saveExperienceLocally(gameData) {
        try {
            const queueKey = 'mineduel_learning_queue';
            const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
            
            queue.push({
                ...gameData,
                timestamp: Date.now()
            });
            
            // Keep max 50 queued games
            while (queue.length > 50) {
                queue.shift();
            }
            
            localStorage.setItem(queueKey, JSON.stringify(queue));
            console.log(`[Learning] Saved locally (queue: ${queue.length})`);
            
        } catch (e) {
            console.warn('[Learning] Failed to save locally:', e);
        }
    }
    
    // ==================== QUERY METHODS ====================
    
    /**
     * Get power effectiveness from learning
     */
    getPowerEffectiveness() {
        const result = {};
        for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
            result[power] = this.localData.powers[power]?.effectiveness || 0.5;
        }
        return result;
    }
    
    /**
     * Get best strategy from learning
     */
    getBestStrategy() {
        const strategies = this.localData.strategies;
        let best = 'balanced';
        let bestRate = 0;
        
        for (const [strategy, data] of Object.entries(strategies)) {
            if (data.used >= 2 && data.rate > bestRate) {
                bestRate = data.rate;
                best = strategy;
            }
        }
        
        return best;
    }
    
    /**
     * Get win rate
     */
    getWinRate() {
        const stats = this.localData.stats;
        if (stats.gamesPlayed === 0) return 0;
        return ((stats.wins / stats.gamesPlayed) * 100).toFixed(1);
    }
    
    /**
     * Get learning report
     */
    getLearningReport() {
        return {
            localStats: { ...this.localData.stats },
            globalDataLoaded: this.globalDataLoaded,
            globalStats: this.globalData?.stats || null,
            powerEffectiveness: this.getPowerEffectiveness(),
            bestStrategy: this.getBestStrategy(),
            learnedPatterns: this.localData.learnedPatterns.length,
            winRate: this.getWinRate()
        };
    }
}
