/**
 * BotAI.js - Advanced AI System for MineDuel
 * Features:
 * - Machine Learning-like pattern recognition
 * - Strategic power usage at optimal moments
 * - Adaptive difficulty that learns from games
 * - Opponent board analysis
 * - Pattern-based mine detection
 */

export class BotAI {
    constructor(game, difficulty = 'medium') {
        this.game = game;
        this.difficulty = difficulty;
        this.board = null;
        this.gridSize = 10;
        this.isActive = false;
        this.isThinking = false;
        this.moveInterval = null;
        this.isFrozen = false;
        this.frozenUntil = 0;
        
        // Learning system - persists in localStorage
        this.learningData = this.loadLearningData();
        
        // Move history for pattern analysis
        this.moveHistory = [];
        this.gameHistory = [];
        
        // Pattern recognition cache
        this.patternCache = new Map();
        
        // Strategic state tracking
        this.strategicState = {
            lastPowerUsed: 0,
            powerCooldown: 5000,
            consecutiveSafeMoves: 0,
            consecutiveMineHits: 0,
            isDefensive: false,
            isAggressive: false,
            playerThreatLevel: 0
        };
        
        // Difficulty settings with enhanced parameters
        this.settings = this.getDifficultySettings();
        
        console.log(`[BotAI] Created ADVANCED AI with difficulty: ${difficulty}`);
        console.log(`[BotAI] Learning data loaded: ${this.learningData.gamesPlayed} games played`);
    }

    getDifficultySettings() {
        const baseSettings = {
            easy: {
                minDelay: 2000,
                maxDelay: 3500,
                mistakeChance: 0.30,
                powerUsageChance: 0.08,
                patternRecognition: 0.4,
                strategicThinking: 0.3,
                learningRate: 0.1,
                reactionSpeed: 0.5,
                boardAnalysisDepth: 1
            },
            medium: {
                minDelay: 1200,
                maxDelay: 2200,
                mistakeChance: 0.18,
                powerUsageChance: 0.15,
                patternRecognition: 0.6,
                strategicThinking: 0.5,
                learningRate: 0.2,
                reactionSpeed: 0.7,
                boardAnalysisDepth: 2
            },
            hard: {
                minDelay: 600,
                maxDelay: 1200,
                mistakeChance: 0.08,
                powerUsageChance: 0.25,
                patternRecognition: 0.85,
                strategicThinking: 0.75,
                learningRate: 0.35,
                reactionSpeed: 0.85,
                boardAnalysisDepth: 3
            },
            expert: {
                minDelay: 300,
                maxDelay: 700,
                mistakeChance: 0.02,
                powerUsageChance: 0.35,
                patternRecognition: 0.98,
                strategicThinking: 0.95,
                learningRate: 0.5,
                reactionSpeed: 0.95,
                boardAnalysisDepth: 4
            }
        };
        
        let settings = baseSettings[this.difficulty] || baseSettings.medium;
        
        // Apply learning bonuses based on games played
        const learningBonus = Math.min(0.15, this.learningData.gamesPlayed * 0.005);
        settings.patternRecognition = Math.min(1, settings.patternRecognition + learningBonus);
        settings.strategicThinking = Math.min(1, settings.strategicThinking + learningBonus);
        
        return settings;
    }

    // ==================== LEARNING SYSTEM ====================
    
    loadLearningData() {
        try {
            const saved = localStorage.getItem('mineduel_bot_learning');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('[BotAI] Failed to load learning data:', e);
        }
        
        return {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            // Pattern learning: which cell positions are often safe/dangerous
            cellPatterns: {},
            // Move patterns: successful opening strategies
            openingMoves: [],
            // Power usage patterns: when powers were used successfully
            powerPatterns: {
                freeze: { successfulUses: [], optimalConditions: {} },
                shield: { successfulUses: [], optimalConditions: {} },
                radar: { successfulUses: [], optimalConditions: {} },
                safeburst: { successfulUses: [], optimalConditions: {} }
            },
            // Human behavior patterns
            humanPatterns: {
                averageMovesPerGame: 0,
                preferredStartPositions: {},
                commonMistakes: [],
                speedPattern: 'normal'
            },
            // Board state patterns that lead to wins/losses
            winningPatterns: [],
            losingPatterns: []
        };
    }

    saveLearningData() {
        try {
            localStorage.setItem('mineduel_bot_learning', JSON.stringify(this.learningData));
        } catch (e) {
            console.error('[BotAI] Failed to save learning data:', e);
        }
    }

    recordMove(x, y, result) {
        this.moveHistory.push({
            x, y,
            result: result.hitMine ? 'mine' : 'safe',
            points: result.points || 0,
            cellsRevealed: result.cellsRevealed || 1,
            timestamp: Date.now(),
            gameState: this.captureGameState()
        });
        
        // Update pattern cache
        const patternKey = this.generatePatternKey(x, y);
        if (!this.learningData.cellPatterns[patternKey]) {
            this.learningData.cellPatterns[patternKey] = { safe: 0, mine: 0 };
        }
        
        if (result.hitMine) {
            this.learningData.cellPatterns[patternKey].mine++;
            this.strategicState.consecutiveMineHits++;
            this.strategicState.consecutiveSafeMoves = 0;
            // Only increment stuck counter on mine hit
            this.stuckCounter++;
        } else {
            this.learningData.cellPatterns[patternKey].safe++;
            this.strategicState.consecutiveSafeMoves++;
            this.strategicState.consecutiveMineHits = 0;
            // Reset stuck counter on successful safe reveal
            this.stuckCounter = 0;
        }
    }

    recordPowerUsage(power, success, gameState) {
        this.learningData.powerPatterns[power].successfulUses.push({
            success,
            gameState,
            timestamp: Date.now()
        });
        
        // Update optimal conditions
        if (success) {
            const conditions = this.learningData.powerPatterns[power].optimalConditions;
            conditions.avgPlayerScore = (conditions.avgPlayerScore || 0) * 0.9 + gameState.playerScore * 0.1;
            conditions.avgBotScore = (conditions.avgBotScore || 0) * 0.9 + gameState.botScore * 0.1;
            conditions.avgTimeRemaining = (conditions.avgTimeRemaining || 0) * 0.9 + gameState.timeRemaining * 0.1;
        }
    }

    captureGameState() {
        return {
            playerScore: this.game?.score || 0,
            botScore: this.game?.opponentScore || 0,
            timeRemaining: this.getTimeRemaining(),
            boardCompletion: this.calculateBoardCompletion(),
            playerCompletion: this.game?.playerCompletion || 0
        };
    }

    endGameLearning(won) {
        this.learningData.gamesPlayed++;
        if (won) {
            this.learningData.wins++;
            // Record winning pattern
            this.learningData.winningPatterns.push({
                moves: this.moveHistory.slice(-20),
                finalState: this.captureGameState()
            });
        } else {
            this.learningData.losses++;
            this.learningData.losingPatterns.push({
                moves: this.moveHistory.slice(-20),
                finalState: this.captureGameState()
            });
        }
        
        // Keep only last 50 patterns
        if (this.learningData.winningPatterns.length > 50) {
            this.learningData.winningPatterns = this.learningData.winningPatterns.slice(-50);
        }
        if (this.learningData.losingPatterns.length > 50) {
            this.learningData.losingPatterns = this.learningData.losingPatterns.slice(-50);
        }
        
        this.saveLearningData();
        console.log(`[BotAI] Learning updated: ${this.learningData.gamesPlayed} games, ${this.learningData.wins} wins`);
    }

    generatePatternKey(x, y) {
        // Generate a pattern based on position type (corner, edge, center)
        let type = 'center';
        if ((x === 0 || x === this.gridSize - 1) && (y === 0 || y === this.gridSize - 1)) {
            type = 'corner';
        } else if (x === 0 || x === this.gridSize - 1 || y === 0 || y === this.gridSize - 1) {
            type = 'edge';
        }
        
        // Include surrounding revealed pattern
        const surroundingPattern = this.getSurroundingPattern(x, y);
        return `${type}_${surroundingPattern}`;
    }

    getSurroundingPattern(x, y) {
        if (!this.board || !this.board.grid) return 'unknown';
        
        let pattern = '';
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize) {
                    const cell = this.board.grid[ny][nx];
                    if (cell.isRevealed) {
                        pattern += cell.neighborCount.toString();
                    } else if (cell.isFlagged) {
                        pattern += 'F';
                    } else {
                        pattern += 'X';
                    }
                } else {
                    pattern += 'B'; // Border
                }
            }
        }
        return pattern;
    }

    // ==================== CORE AI FUNCTIONS ====================

    start(board, gridSize) {
        console.log('[BotAI] Starting advanced bot...');
        
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        this.isThinking = false;
        this.moveHistory = [];
        this.strategicState = {
            lastPowerUsed: 0,
            powerCooldown: 5000,
            consecutiveSafeMoves: 0,
            consecutiveMineHits: 0,
            isDefensive: false,
            isAggressive: false,
            playerThreatLevel: 0
        };
        
        if (!this.board || !this.board.grid) {
            console.error('[BotAI] Board is null, cannot start!');
            return;
        }
        
        this.scheduleNextMove();
    }

    stop() {
        console.log('[BotAI] Stopping bot...');
        this.isActive = false;
        this.isThinking = false;
        if (this.moveInterval) {
            clearTimeout(this.moveInterval);
            this.moveInterval = null;
        }
    }

    getAdaptiveDelay() {
        const { minDelay, maxDelay, reactionSpeed } = this.settings;
        
        // Faster when behind, slower when ahead
        let modifier = 1;
        const playerScore = this.game?.score || 0;
        const botScore = this.game?.opponentScore || 0;
        const scoreDiff = playerScore - botScore;
        
        if (scoreDiff > 50) {
            // Player is ahead, play faster
            modifier = 0.7;
        } else if (scoreDiff < -30) {
            // Bot is ahead, can play more carefully
            modifier = 1.2;
        }
        
        // Time pressure - play faster near end
        const timeRemaining = this.getTimeRemaining();
        if (timeRemaining < 30000) {
            modifier *= 0.6;
        } else if (timeRemaining < 60000) {
            modifier *= 0.8;
        }
        
        const baseDelay = minDelay + Math.random() * (maxDelay - minDelay);
        return Math.max(200, baseDelay * modifier);
    }

    scheduleNextMove() {
        if (!this.isActive || this.game?.gameEnded) return;
        
        this.moveInterval = setTimeout(() => {
            this.makeMove();
        }, this.getAdaptiveDelay());
    }

    async makeMove() {
        if (!this.isActive || this.isThinking || this.game?.gameEnded) {
            return;
        }
        
        if (!this.board || !this.board.grid) {
            console.error('[BotAI] Board not available!');
            return;
        }
        
        // Check if frozen
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            const waitTime = this.frozenUntil - Date.now();
            this.moveInterval = setTimeout(() => this.makeMove(), waitTime + 100);
            return;
        }
        this.isFrozen = false;
        
        if (this.shouldStopPlaying()) {
            console.log('[BotAI] No more valid moves, stopping');
            this.stop();
            return;
        }
        
        this.isThinking = true;
        this.game?.showBotThinking?.();

        try {
            await new Promise(resolve => setTimeout(resolve, 150));
            
            if (!this.isActive || this.game?.gameEnded) {
                this.isThinking = false;
                this.game?.hideBotThinking?.();
                return;
            }
            
            // 1. STRATEGIC POWER DECISION - Most important
            const powerDecision = this.makeStrategicPowerDecision();
            if (powerDecision) {
                console.log('[BotAI] Strategic power used:', powerDecision);
                this.stuckCounter = 0; // Reset on successful power use
                this.isThinking = false;
                this.game?.hideBotThinking?.();
                this.scheduleNextMove();
                return;
            }
            
            // 2. Check for stuck state and fix wrong flags
            if (this.isStuck()) {
                console.log('[BotAI] Detected stuck state, re-analyzing board...');
                const wrongFlag = this.findAndRemoveWrongFlag();
                if (wrongFlag) {
                    console.log('[BotAI] Removed wrong flag at:', wrongFlag);
                    this.stuckCounter = 0; // Reset on flag removal
                    this.isThinking = false;
                    this.game?.hideBotThinking?.();
                    this.scheduleNextMove();
                    return;
                }
            }
            
            // 3. Flag known mines
            const mineToFlag = this.findCellToFlag();
            if (mineToFlag) {
                console.log('[BotAI] Flagging mine at:', mineToFlag);
                this.game?.makeBotFlag?.(mineToFlag.x, mineToFlag.y);
                this.stuckCounter = 0; // Reset on successful flag
                this.isThinking = false;
                this.game?.hideBotThinking?.();
                this.scheduleNextMove();
                return;
            }
            
            // 4. Make intelligent move
            const move = this.findOptimalMove();
            
            if (move) {
                const result = this.game?.makeBotMove?.(move.x, move.y);
                if (result) {
                    this.recordMove(move.x, move.y, result);
                } else {
                    // Move failed - increment stuck counter
                    this.stuckCounter = (this.stuckCounter || 0) + 1;
                }
            } else {
                // No move found - increment stuck counter and try to fix flags
                this.stuckCounter = (this.stuckCounter || 0) + 1;
                console.log('[BotAI] No valid move found, deep analysis... (stuck:', this.stuckCounter, ')');
                const forcedFlagRemoval = this.forceRemoveAnyInconsistentFlag();
                if (forcedFlagRemoval) {
                    console.log('[BotAI] Force removed inconsistent flag at:', forcedFlagRemoval);
                }
            }
            
        } catch (error) {
            console.error('[BotAI] Error:', error);
        }

        this.isThinking = false;
        this.game?.hideBotThinking?.();

        if (this.isActive && !this.game?.gameEnded) {
            this.scheduleNextMove();
        }
    }

    // ==================== STRATEGIC POWER SYSTEM ====================

    makeStrategicPowerDecision() {
        if (!this.game) return null;
        
        const gameState = this.captureGameState();
        const timeSinceLastPower = Date.now() - this.strategicState.lastPowerUsed;
        
        // Don't spam powers
        if (timeSinceLastPower < this.strategicState.powerCooldown) {
            return null;
        }
        
        const playerScore = gameState.playerScore;
        const botScore = gameState.botScore;
        const timeRemaining = gameState.timeRemaining;
        const timePercent = timeRemaining / (this.game?.matchDuration || 120000);
        
        // Calculate threat level
        this.strategicState.playerThreatLevel = this.calculatePlayerThreat(gameState);
        
        // ============ FREEZE STRATEGY ============
        // Use when:
        // 1. Player is about to win (high score, high completion)
        // 2. Time is running out and player is ahead
        // 3. Player just had a big score spike
        const freezeConditions = [
            // Critical: Player about to win
            playerScore > botScore + 60 && timePercent < 0.4,
            // Player on a streak and significantly ahead
            this.strategicState.playerThreatLevel > 0.8 && playerScore > botScore + 30,
            // Time pressure: Player ahead near end
            timePercent < 0.25 && playerScore > botScore + 20,
            // Player completion too high
            gameState.playerCompletion > 70 && playerScore > botScore
        ];
        
        if (freezeConditions.some(c => c) && this.canUsePower('freeze')) {
            if (this.usePower('freeze')) {
                this.strategicState.lastPowerUsed = Date.now();
                this.recordPowerUsage('freeze', true, gameState);
                return 'freeze';
            }
        }
        
        // ============ SHIELD STRATEGY ============
        // Use when:
        // 1. Bot is ahead and wants to protect lead
        // 2. About to make risky move (no safe cells)
        // 3. Near end of game with lead
        const shieldConditions = [
            // Protecting lead near end
            botScore > playerScore + 20 && timePercent < 0.35 && !this.game?.opponentHasShield,
            // No safe moves, about to take risk
            this.findGuaranteedSafeCells().length === 0 && botScore > 40 && !this.game?.opponentHasShield,
            // Multiple consecutive mine hits
            this.strategicState.consecutiveMineHits >= 2 && !this.game?.opponentHasShield
        ];
        
        if (shieldConditions.some(c => c) && this.canUsePower('shield')) {
            if (this.usePower('shield')) {
                this.strategicState.lastPowerUsed = Date.now();
                this.recordPowerUsage('shield', true, gameState);
                return 'shield';
            }
        }
        
        // ============ RADAR STRATEGY ============
        // Use when stuck or to avoid mines
        const radarConditions = [
            // Stuck with no safe moves
            this.findGuaranteedSafeCells().length === 0 && this.strategicState.consecutiveMineHits >= 1,
            // Early game reconnaissance
            timePercent > 0.8 && botScore >= 35 && this.moveHistory.length < 5,
            // High uncertainty, many unrevealed cells
            this.calculateBoardUncertainty() > 0.7 && botScore >= 40
        ];
        
        if (radarConditions.some(c => c) && this.canUsePower('radar')) {
            if (this.usePower('radar')) {
                this.strategicState.lastPowerUsed = Date.now();
                this.recordPowerUsage('radar', true, gameState);
                return 'radar';
            }
        }
        
        // ============ SAFEBURST STRATEGY ============
        // Use for quick points when behind or to catch up
        const safeburstConditions = [
            // Behind and need quick points
            playerScore > botScore + 40 && botScore >= 50,
            // Early game acceleration
            timePercent > 0.7 && botScore >= 55 && this.strategicState.consecutiveSafeMoves >= 3,
            // Mid game boost when neck and neck
            timePercent > 0.4 && timePercent < 0.7 && Math.abs(playerScore - botScore) < 20 && botScore >= 45
        ];
        
        if (safeburstConditions.some(c => c) && this.canUsePower('safeburst')) {
            if (this.usePower('safeburst')) {
                this.strategicState.lastPowerUsed = Date.now();
                this.recordPowerUsage('safeburst', true, gameState);
                return 'safeburst';
            }
        }
        
        return null;
    }

    calculatePlayerThreat(gameState) {
        let threat = 0;
        
        // Score difference factor
        const scoreDiff = gameState.playerScore - gameState.botScore;
        threat += Math.max(0, scoreDiff / 100);
        
        // Completion factor
        threat += (gameState.playerCompletion || 0) / 100;
        
        // Time factor - threat increases as time decreases if player ahead
        if (scoreDiff > 0) {
            const timePercent = gameState.timeRemaining / (this.game?.matchDuration || 120000);
            threat += (1 - timePercent) * 0.3;
        }
        
        return Math.min(1, threat);
    }

    calculateBoardUncertainty() {
        if (!this.board || !this.board.grid) return 1;
        
        let unrevealed = 0;
        let total = 0;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                total++;
                if (!this.board.grid[y][x].isRevealed) {
                    unrevealed++;
                }
            }
        }
        
        return unrevealed / total;
    }

    calculateBoardCompletion() {
        if (!this.board || !this.board.grid) return 0;
        
        let revealed = 0;
        let totalSafe = 0;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (!cell.isMine) {
                    totalSafe++;
                    if (cell.isRevealed) revealed++;
                }
            }
        }
        
        return totalSafe > 0 ? (revealed / totalSafe) * 100 : 0;
    }

    getTimeRemaining() {
        if (!this.game) return 120000;
        const elapsed = Date.now() - (this.game.matchStartTime || Date.now());
        return Math.max(0, (this.game.matchDuration || 120000) - elapsed);
    }

    canUsePower(power) {
        const costs = this.game?.CONFIG?.POWER_COSTS || { radar: 30, safeburst: 40, shield: 50, freeze: 60 };
        const cost = costs[power] || 999;
        const botScore = this.game?.opponentScore || 0;
        const usesLeft = this.game?.botPowerUsesLeft?.[power];
        
        // If uses tracking exists, check it
        if (usesLeft !== undefined && usesLeft <= 0) {
            return false;
        }
        
        return botScore >= cost;
    }

    usePower(power) {
        if (!this.game) return false;
        
        const costs = this.game?.CONFIG?.POWER_COSTS || { radar: 30, safeburst: 40, shield: 50, freeze: 60 };
        const cost = costs[power] || 999;
        
        // Use the game's power system
        if (typeof this.game.useBotPower === 'function') {
            return this.game.useBotPower(power, cost);
        }
        
        // Fallback: Direct power execution
        return this.executePowerDirectly(power, cost);
    }

    executePowerDirectly(power, cost) {
        if (!this.game) return false;
        
        const botScore = this.game.opponentScore || 0;
        if (botScore < cost) return false;
        
        // Deduct cost
        this.game.opponentScore -= cost;
        this.game.updateScoreDisplay?.();
        
        switch (power) {
            case 'freeze':
                // Freeze the player
                this.freezePlayer(5000);
                this.game.showNotification?.('❄️ Bot used FREEZE on you!', 'warning');
                return true;
                
            case 'shield':
                // Bot gains shield
                this.game.opponentHasShield = true;
                this.game.showNotification?.('🛡️ Bot activated SHIELD!', 'info');
                return true;
                
            case 'radar':
                // Bot uses radar (internal use only)
                this.applyRadarKnowledge();
                this.game.showNotification?.('📡 Bot used RADAR!', 'info');
                return true;
                
            case 'safeburst':
                // Bot reveals safe cells
                this.applySafeBurst();
                this.game.showNotification?.('💥 Bot used SAFE BURST!', 'info');
                return true;
        }
        
        return false;
    }

    freezePlayer(duration) {
        if (!this.game) return;
        
        this.game.playerFrozen = true;
        this.game.playerFrozenUntil = Date.now() + duration;
        
        // Show freeze overlay
        const overlay = document.getElementById('player-frozen');
        const timerDisplay = document.getElementById('frozen-timer') || document.getElementById('player-freeze-timer');
        
        if (overlay) {
            overlay.classList.remove('hidden');
        }
        
        const updateTimer = () => {
            const remaining = Math.max(0, (this.game.playerFrozenUntil || 0) - Date.now());
            if (timerDisplay) {
                timerDisplay.textContent = `${Math.ceil(remaining / 1000)}s`;
            }
            
            if (remaining <= 0) {
                this.game.playerFrozen = false;
                if (overlay) {
                    overlay.classList.add('hidden');
                }
            } else {
                requestAnimationFrame(updateTimer);
            }
        };
        
        updateTimer();
    }

    applyRadarKnowledge() {
        // Mark some mines as known internally for better decision making
        if (!this.board || !this.board.grid) return;
        
        const mines = [];
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (this.board.grid[y][x].isMine && !this.board.grid[y][x].isRevealed) {
                    mines.push({ x, y });
                }
            }
        }
        
        // Mark 3 random mines as known
        const knownMines = mines.sort(() => Math.random() - 0.5).slice(0, 3);
        knownMines.forEach(pos => {
            const key = `${pos.x},${pos.y}`;
            this.patternCache.set(key, 'KNOWN_MINE');
        });
    }

    applySafeBurst() {
        if (!this.board || !this.board.grid) return;
        
        // Find and reveal 3 safe cells
        const safeCells = [];
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (!cell.isMine && !cell.isRevealed && !cell.isFlagged) {
                    safeCells.push({ x, y });
                }
            }
        }
        
        const toReveal = safeCells.sort(() => Math.random() - 0.5).slice(0, 3);
        let totalPoints = 0;
        
        toReveal.forEach(pos => {
            const result = this.game?.makeBotMove?.(pos.x, pos.y);
            if (result && result.points) {
                totalPoints += result.points;
            }
        });
        
        return totalPoints;
    }

    // ==================== MOVE FINDING ALGORITHMS ====================

    findOptimalMove() {
        // 1. Find guaranteed safe cells
        const safeCells = this.findGuaranteedSafeCells();
        
        if (safeCells.length > 0) {
            // Use learning to pick best safe cell
            return this.pickBestSafeCell(safeCells);
        }
        
        // 2. Find cells with probability analysis
        const probabilityMap = this.calculateMineProbabilities();
        
        // 3. Get all unrevealed cells sorted by safety
        const candidates = this.getAllUnrevealedCells()
            .filter(cell => {
                const key = `${cell.x},${cell.y}`;
                return this.patternCache.get(key) !== 'KNOWN_MINE';
            })
            .map(cell => ({
                ...cell,
                probability: probabilityMap.get(`${cell.x},${cell.y}`) || 0.5,
                learningScore: this.getLearningScore(cell.x, cell.y)
            }))
            .sort((a, b) => {
                // Combined score: lower probability and higher learning score is better
                const scoreA = a.probability - a.learningScore * 0.1;
                const scoreB = b.probability - b.learningScore * 0.1;
                return scoreA - scoreB;
            });
        
        if (candidates.length === 0) return null;
        
        // Apply mistake chance for non-expert bots
        if (Math.random() < this.settings.mistakeChance) {
            const randomIndex = Math.floor(Math.random() * Math.min(5, candidates.length));
            return candidates[randomIndex];
        }
        
        // Pick from top candidates with weighted randomness
        const topCount = Math.min(3, candidates.length);
        const topCandidates = candidates.slice(0, topCount);
        
        // Weighted selection favoring first (safest) candidate
        const weights = topCandidates.map((_, i) => Math.pow(0.5, i));
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < topCandidates.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return topCandidates[i];
            }
        }
        
        return topCandidates[0];
    }

    calculateMineProbabilities() {
        const probabilities = new Map();
        
        if (!this.board || !this.board.grid) return probabilities;
        
        // Initialize all unrevealed cells with base probability
        const totalMines = this.game?.mineCount || 15;
        let remainingMines = totalMines;
        let unrevealedCount = 0;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (cell.isRevealed && cell.isMine) remainingMines--;
                if (!cell.isRevealed && !cell.isFlagged) unrevealedCount++;
                if (cell.isFlagged) remainingMines--;
            }
        }
        
        const baseProbability = unrevealedCount > 0 ? remainingMines / unrevealedCount : 0;
        
        // Set base probability for all unrevealed cells
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (!cell.isRevealed && !cell.isFlagged) {
                    probabilities.set(`${x},${y}`, baseProbability);
                }
            }
        }
        
        // Refine based on numbered cells
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (!cell.isRevealed || cell.isMine || cell.neighborCount === 0) continue;
                
                const neighbors = this.getNeighbors(x, y);
                const unrevealedNeighbors = neighbors.filter(n => 
                    !this.board.grid[n.y][n.x].isRevealed && !this.board.grid[n.y][n.x].isFlagged
                );
                const flaggedCount = neighbors.filter(n => 
                    this.board.grid[n.y][n.x].isFlagged
                ).length;
                
                const remainingMinesAround = cell.neighborCount - flaggedCount;
                
                if (unrevealedNeighbors.length > 0 && remainingMinesAround > 0) {
                    const localProbability = remainingMinesAround / unrevealedNeighbors.length;
                    
                    // Update probabilities for these neighbors
                    for (const n of unrevealedNeighbors) {
                        const key = `${n.x},${n.y}`;
                        const current = probabilities.get(key) || baseProbability;
                        // Combine probabilities (take max for safety)
                        probabilities.set(key, Math.max(current, localProbability));
                    }
                } else if (remainingMinesAround === 0) {
                    // All remaining neighbors are safe
                    for (const n of unrevealedNeighbors) {
                        probabilities.set(`${n.x},${n.y}`, 0);
                    }
                } else if (unrevealedNeighbors.length === remainingMinesAround) {
                    // All remaining neighbors are mines
                    for (const n of unrevealedNeighbors) {
                        probabilities.set(`${n.x},${n.y}`, 1);
                    }
                }
            }
        }
        
        return probabilities;
    }

    getLearningScore(x, y) {
        const patternKey = this.generatePatternKey(x, y);
        const pattern = this.learningData.cellPatterns[patternKey];
        
        if (!pattern) return 0;
        
        const total = pattern.safe + pattern.mine;
        if (total === 0) return 0;
        
        // Return a score where higher is safer
        return (pattern.safe - pattern.mine) / total;
    }

    findGuaranteedSafeCells() {
        const safeCells = [];
        const checked = new Set();
        
        if (!this.board || !this.board.grid) return safeCells;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                
                if (!cell.isRevealed || cell.isMine) continue;
                
                const neighbors = this.getNeighbors(x, y);
                const unrevealedNeighbors = neighbors.filter(n => 
                    !this.board.grid[n.y][n.x].isRevealed
                );
                const flaggedNeighbors = neighbors.filter(n => 
                    this.board.grid[n.y][n.x].isFlagged
                );
                
                // If all mines are flagged, remaining are safe
                if (cell.neighborCount === flaggedNeighbors.length) {
                    for (const n of unrevealedNeighbors) {
                        if (!this.board.grid[n.y][n.x].isFlagged) {
                            const key = `${n.x},${n.y}`;
                            if (!checked.has(key)) {
                                checked.add(key);
                                safeCells.push(n);
                            }
                        }
                    }
                }
                
                // Zero cells mean all neighbors are safe
                if (cell.neighborCount === 0) {
                    for (const n of unrevealedNeighbors) {
                        const key = `${n.x},${n.y}`;
                        if (!checked.has(key)) {
                            checked.add(key);
                            safeCells.push(n);
                        }
                    }
                }
            }
        }
        
        return safeCells;
    }

    // Check if bot is stuck (no safe moves and no valid flags)
    isStuck() {
        const safeCells = this.findGuaranteedSafeCells();
        if (safeCells.length > 0) return false;
        
        const allUnrevealed = this.getAllUnrevealedCells();
        if (allUnrevealed.length === 0) return false;
        
        // Consider stuck after 3 attempts with no progress
        return (this.stuckCounter || 0) >= 3;
    }

    // Find and remove a wrong flag by analyzing board consistency
    findAndRemoveWrongFlag() {
        if (!this.board || !this.board.grid) return null;
        
        // Get all flagged cells
        const flaggedCells = [];
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (this.board.grid[y][x].isFlagged) {
                    flaggedCells.push({ x, y });
                }
            }
        }
        
        if (flaggedCells.length === 0) return null;
        
        // Check each flag for consistency
        for (const flag of flaggedCells) {
            if (this.isFlagInconsistent(flag.x, flag.y)) {
                // Remove this flag
                this.removeFlag(flag.x, flag.y);
                this.stuckCounter = 0; // Reset stuck counter
                return flag;
            }
        }
        
        return null;
    }

    // Check if a flag creates an impossible situation
    isFlagInconsistent(flagX, flagY) {
        if (!this.board || !this.board.grid) return false;
        
        const neighbors = this.getNeighbors(flagX, flagY);
        
        for (const n of neighbors) {
            const cell = this.board.grid[n.y][n.x];
            if (!cell.isRevealed || cell.isMine) continue;
            
            // Count flags around this revealed cell
            const cellNeighbors = this.getNeighbors(n.x, n.y);
            const flagCount = cellNeighbors.filter(cn => 
                this.board.grid[cn.y][cn.x].isFlagged
            ).length;
            
            // If there are more flags than the cell's number, something is wrong
            if (flagCount > cell.neighborCount) {
                console.log(`[BotAI] Flag at (${flagX},${flagY}) causes inconsistency: cell (${n.x},${n.y}) has ${flagCount} flags but needs ${cell.neighborCount}`);
                return true;
            }
        }
        
        return false;
    }

    // Force remove any flag that might be causing issues
    forceRemoveAnyInconsistentFlag() {
        if (!this.board || !this.board.grid) return null;
        
        // Get all flagged cells sorted by suspicion score
        const flaggedCells = [];
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (this.board.grid[y][x].isFlagged) {
                    const suspicionScore = this.calculateFlagSuspicion(x, y);
                    flaggedCells.push({ x, y, suspicion: suspicionScore });
                }
            }
        }
        
        if (flaggedCells.length === 0) return null;
        
        // Sort by suspicion (highest first)
        flaggedCells.sort((a, b) => b.suspicion - a.suspicion);
        
        // Remove the most suspicious flag
        const toRemove = flaggedCells[0];
        if (toRemove.suspicion > 0) {
            this.removeFlag(toRemove.x, toRemove.y);
            this.stuckCounter = 0;
            return toRemove;
        }
        
        // If no suspicious flags, try removing oldest flag
        if (flaggedCells.length > 0) {
            const oldest = flaggedCells[flaggedCells.length - 1];
            this.removeFlag(oldest.x, oldest.y);
            this.stuckCounter = 0;
            return oldest;
        }
        
        return null;
    }

    // Calculate how suspicious a flag is
    calculateFlagSuspicion(flagX, flagY) {
        if (!this.board || !this.board.grid) return 0;
        
        let suspicion = 0;
        const neighbors = this.getNeighbors(flagX, flagY);
        
        let hasRevealedNeighbor = false;
        
        for (const n of neighbors) {
            const cell = this.board.grid[n.y][n.x];
            if (!cell.isRevealed || cell.isMine) continue;
            
            hasRevealedNeighbor = true;
            
            const cellNeighbors = this.getNeighbors(n.x, n.y);
            const flagCount = cellNeighbors.filter(cn => 
                this.board.grid[cn.y][cn.x].isFlagged
            ).length;
            const unrevealedCount = cellNeighbors.filter(cn => 
                !this.board.grid[cn.y][cn.x].isRevealed && !this.board.grid[cn.y][cn.x].isFlagged
            ).length;
            
            // High suspicion if too many flags
            if (flagCount > cell.neighborCount) {
                suspicion += 10;
            }
            
            // Medium suspicion if flags equal to number but still have unrevealed cells
            // that could also be mines
            if (flagCount === cell.neighborCount && unrevealedCount > 0) {
                // This is actually a good flag, reduce suspicion
                suspicion -= 2;
            }
            
            // If cell has more remaining unrevealed than remaining mines, flag might be wrong
            const remainingMines = cell.neighborCount - flagCount;
            if (remainingMines < 0) {
                suspicion += 5;
            }
        }
        
        // Flags with no revealed neighbors are more suspicious
        if (!hasRevealedNeighbor) {
            suspicion += 3;
        }
        
        return suspicion;
    }

    // Remove a flag from the board
    removeFlag(x, y) {
        if (!this.board || !this.board.grid) return false;
        const cell = this.board.grid[y][x];
        if (cell.isFlagged) {
            // Use game's unflag function if available
            if (this.game?.makeBotUnflag) {
                return this.game.makeBotUnflag(x, y);
            } else {
                // Fallback: Direct modification
                cell.isFlagged = false;
                this.board.render();
                console.log('[BotAI] Removed flag at', x, y);
                return true;
            }
        }
        return false;
    }

    findCellToFlag() {
        if (!this.board || !this.board.grid) return null;
        
        // Find cells that are DEFINITELY mines based on constraint satisfaction
        const confirmedMines = new Map(); // Key: "x,y" -> confirmation count
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                
                if (!cell.isRevealed || cell.isMine || cell.neighborCount === 0) continue;
                
                const neighbors = this.getNeighbors(x, y);
                const unrevealedNeighbors = neighbors.filter(n => {
                    const nc = this.board.grid[n.y][n.x];
                    return !nc.isRevealed && !nc.isFlagged;
                });
                const flaggedCount = neighbors.filter(n => 
                    this.board.grid[n.y][n.x].isFlagged
                ).length;
                
                const remainingMines = cell.neighborCount - flaggedCount;
                
                // If number of unrevealed == remaining mines, all are mines
                if (remainingMines > 0 && unrevealedNeighbors.length === remainingMines) {
                    for (const n of unrevealedNeighbors) {
                        const key = `${n.x},${n.y}`;
                        confirmedMines.set(key, (confirmedMines.get(key) || 0) + 1);
                    }
                }
            }
        }
        
        // Find cells confirmed by at least 1 number cell
        // Prefer cells confirmed by multiple neighbors
        let bestCandidate = null;
        let bestConfirmations = 0;
        
        for (const [key, confirmations] of confirmedMines) {
            if (confirmations > bestConfirmations) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board.grid[y][x];
                
                // Double-check: make sure it's not already flagged or revealed
                if (!cell.isFlagged && !cell.isRevealed) {
                    bestCandidate = { x, y };
                    bestConfirmations = confirmations;
                }
            }
        }
        
        // Only flag if we have at least 1 confirmation
        if (bestCandidate && bestConfirmations >= 1) {
            console.log(`[BotAI] Flagging mine with ${bestConfirmations} confirmations`);
            return bestCandidate;
        }
        
        return null;
    }

    pickBestSafeCell(safeCells) {
        if (safeCells.length === 0) return null;
        
        // Score each cell
        const scored = safeCells.map(cell => {
            let score = 0;
            
            // Prefer cells that might reveal more (adjacent to 0 cells)
            const neighbors = this.getNeighbors(cell.x, cell.y);
            for (const n of neighbors) {
                const nc = this.board.grid[n.y][n.x];
                if (nc.isRevealed && nc.neighborCount === 0) {
                    score += 10; // High priority
                }
                if (nc.isRevealed && !nc.isMine) {
                    score += 2;
                }
            }
            
            // Add learning score
            score += this.getLearningScore(cell.x, cell.y) * 5;
            
            return { cell, score };
        });
        
        scored.sort((a, b) => b.score - a.score);
        
        // Pick from top candidates
        const topCount = Math.min(3, scored.length);
        const topCandidates = scored.slice(0, topCount);
        
        return this.pickRandom(topCandidates.map(s => s.cell));
    }

    shouldStopPlaying() {
        if (!this.board || !this.board.grid) return true;
        
        let unrevealedSafeCells = 0;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (!cell.isMine && !cell.isRevealed) {
                    unrevealedSafeCells++;
                }
            }
        }
        
        return unrevealedSafeCells === 0;
    }

    getAllUnrevealedCells() {
        const cells = [];
        if (!this.board || !this.board.grid) return cells;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (!cell.isRevealed && !cell.isFlagged) {
                    cells.push({ x, y });
                }
            }
        }
        return cells;
    }

    getNeighbors(x, y) {
        const neighbors = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize) {
                    neighbors.push({ x: nx, y: ny });
                }
            }
        }
        return neighbors;
    }

    pickRandom(array) {
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    // ==================== FREEZE HANDLING ====================

    freeze(duration = 5000) {
        this.isFrozen = true;
        this.frozenUntil = Date.now() + duration;
        
        const opponentFrozen = document.getElementById('opponent-frozen');
        const freezeTimer = document.getElementById('opponent-freeze-timer');
        
        if (opponentFrozen) {
            opponentFrozen.classList.remove('hidden');
        }
        
        const updateTimer = setInterval(() => {
            const remaining = Math.max(0, this.frozenUntil - Date.now());
            if (freezeTimer) {
                freezeTimer.textContent = `${Math.ceil(remaining / 1000)}s`;
            }
            
            if (remaining <= 0) {
                clearInterval(updateTimer);
                this.isFrozen = false;
                if (opponentFrozen) {
                    opponentFrozen.classList.add('hidden');
                }
            }
        }, 100);
    }

    // ==================== OPPONENT ANALYSIS ====================

    analyzeOpponentBoard() {
        // This would analyze the opponent's (player's) board for patterns
        // Used to predict where the player might move next
        if (!this.game?.playerBoard) return null;
        
        const playerBoard = this.game.playerBoard;
        const analysis = {
            completionRate: 0,
            safeAreasIdentified: [],
            riskyAreas: []
        };
        
        // Calculate player's progress
        let revealed = 0;
        let total = 0;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (playerBoard.grid && playerBoard.grid[y] && playerBoard.grid[y][x]) {
                    const cell = playerBoard.grid[y][x];
                    if (!cell.isMine) {
                        total++;
                        if (cell.isRevealed) revealed++;
                    }
                }
            }
        }
        
        analysis.completionRate = total > 0 ? revealed / total : 0;
        
        return analysis;
    }
}
