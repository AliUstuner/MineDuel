/**
 * BotCore.js - Advanced Minesweeper AI Core
 * 
 * Three-layer AI architecture for fair, competitive gameplay:
 * 1. Deterministic Layer - Guaranteed Minesweeper rules (CSP-based)
 * 2. Probabilistic Layer - Risk estimation when no safe moves exist
 * 3. Strategic Layer - Speed, power usage, PvP decisions
 * 
 * CRITICAL FAIRNESS RULES:
 * - Bot NEVER accesses hidden mine locations
 * - Bot only uses information visible to a human player
 * - Bot has configurable reaction delays (human-like)
 * 
 * @version 9.0 - Complete Rewrite
 * @author MineDuel AI System
 */

import { DeterministicLayer } from './DeterministicLayer.js';
import { ProbabilisticLayer } from './ProbabilisticLayer.js';
import { StrategicLayer } from './StrategicLayer.js';
import { BotDifficultyConfig } from './BotDifficultyConfig.js';
import { BotLearningSystem } from './BotLearningSystem.js';

export class BotCore {
    constructor(game, difficulty = 'medium') {
        this.game = game;
        this.difficulty = difficulty;
        
        // Grid reference (set by start())
        this.board = null;
        this.gridSize = 10;
        
        // State flags
        this.isActive = false;
        this.isThinking = false;
        this.isFrozen = false;
        this.frozenUntil = 0;
        
        // Think timer
        this.thinkTimer = null;
        
        // Load difficulty configuration
        this.config = new BotDifficultyConfig(difficulty);
        
        // Initialize three AI layers
        this.deterministicLayer = new DeterministicLayer(this);
        this.probabilisticLayer = new ProbabilisticLayer(this);
        this.strategicLayer = new StrategicLayer(this);
        
        // Initialize learning system
        this.learningSystem = new BotLearningSystem(this);
        
        // Game state perception
        this.gameState = {
            myScore: 0,
            opponentScore: 0,
            scoreDiff: 0,
            timeRemaining: 100,
            phase: 'early',       // early, mid, late, critical
            urgency: 0,           // 0-100
            movesThisGame: 0,
            minesHit: 0,
            correctFlags: 0,
            wrongFlags: 0
        };
        
        // Move history for pattern learning
        this.moveHistory = [];
        
        // Power usage tracking
        this.powerUsage = {
            freeze: 0,
            shield: 0,
            radar: 0,
            safeburst: 0,
            lastUseTime: 0
        };
        
        // Known information (visible state only!)
        this.visibleState = {
            revealedCells: new Map(),    // key -> {neighborCount, x, y}
            flaggedCells: new Set(),     // cells we've flagged
            radarMines: new Set(),       // mines revealed by radar
            pendingRadarFlags: []        // radar mines to be flagged
        };
        
        console.log(`[BotCore v9] Initialized | Difficulty: ${difficulty} | Config: ${JSON.stringify(this.config.getParams())}`);
    }
    
    // ==================== LIFECYCLE ====================
    
    /**
     * Start the bot for a new game
     */
    start(board, gridSize) {
        this.stop(); // Clean up any previous game
        
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        this.isThinking = false;
        this.isFrozen = false;
        this.frozenUntil = 0;
        
        // Reset state
        this.resetState();
        
        // Notify learning system
        this.learningSystem.startGame({
            gridSize,
            difficulty: this.difficulty,
            timestamp: Date.now()
        });
        
        console.log(`[BotCore] Started | Grid: ${gridSize}x${gridSize}`);
        
        // Begin thinking loop
        this.scheduleThink();
    }
    
    /**
     * Stop the bot
     */
    stop() {
        this.isActive = false;
        this.isThinking = false;
        
        if (this.thinkTimer) {
            clearTimeout(this.thinkTimer);
            this.thinkTimer = null;
        }
        
        console.log('[BotCore] Stopped');
    }
    
    /**
     * Reset all state for a new game
     */
    resetState() {
        this.gameState = {
            myScore: 0,
            opponentScore: 0,
            scoreDiff: 0,
            timeRemaining: 100,
            phase: 'early',
            urgency: 0,
            movesThisGame: 0,
            minesHit: 0,
            correctFlags: 0,
            wrongFlags: 0
        };
        
        this.moveHistory = [];
        this.powerUsage = {
            freeze: 0,
            shield: 0,
            radar: 0,
            safeburst: 0,
            lastUseTime: 0
        };
        
        this.visibleState = {
            revealedCells: new Map(),
            flaggedCells: new Set(),
            radarMines: new Set(),
            pendingRadarFlags: []
        };
        
        // Reset layers
        this.deterministicLayer.reset();
        this.probabilisticLayer.reset();
        this.strategicLayer.reset();
    }
    
    /**
     * Freeze the bot temporarily (opponent power)
     * @param {number} durationMs - Duration in milliseconds
     */
    freeze(durationMs) {
        this.isFrozen = true;
        this.frozenUntil = Date.now() + durationMs;
        console.log(`[BotCore] Frozen for ${durationMs}ms`);
    }
    
    /**
     * Legacy compatibility: endGameLearning wrapper
     * Called by gameSupabase.js
     * @param {boolean} botWon - Did the bot win?
     * @param {number} playerScore - Player's final score
     * @param {number} botScore - Bot's final score
     * @param {boolean} isDraw - Was it a draw?
     */
    endGameLearning(botWon, playerScore, botScore, isDraw = false) {
        this.endGame({
            botWon,
            draw: isDraw,
            botScore,
            playerScore
        });
    }
    
    // ==================== MAIN THINKING LOOP ====================
    
    /**
     * Schedule next think cycle with human-like delay
     */
    scheduleThink() {
        if (!this.isActive || this.game?.gameEnded) return;
        
        const delay = this.config.getThinkDelay();
        this.thinkTimer = setTimeout(() => this.think(), delay);
    }
    
    /**
     * Main think cycle - the brain of the bot
     */
    async think() {
        if (!this.isActive || this.isThinking || this.game?.gameEnded) return;
        
        // Check if frozen
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.scheduleThink();
            return;
        }
        this.isFrozen = false;
        
        this.isThinking = true;
        this.game?.showBotThinking?.();
        
        try {
            // STEP 1: Perceive the game state
            this.perceive();
            
            // STEP 2: Analyze visible board (never access hidden info!)
            this.analyzeVisibleBoard();
            
            // STEP 3: Run three-layer decision process
            const action = this.decide();
            
            // STEP 4: Execute the chosen action
            if (action) {
                this.execute(action);
            } else {
                // No valid action found - take emergency action
                this.emergencyAction();
            }
            
        } catch (error) {
            console.error('[BotCore] Think error:', error);
            this.emergencyAction();
        }
        
        this.isThinking = false;
        this.game?.hideBotThinking?.();
        
        // Continue thinking loop
        if (this.isActive && !this.game?.gameEnded) {
            this.scheduleThink();
        }
    }
    
    // ==================== PERCEPTION ====================
    
    /**
     * Perceive the current game state from visible information
     */
    perceive() {
        const gs = this.gameState;
        
        // Scores
        gs.myScore = this.game?.opponentScore || 0;
        gs.opponentScore = this.game?.score || 0;
        gs.scoreDiff = gs.myScore - gs.opponentScore;
        
        // Time
        const elapsed = Date.now() - (this.game?.matchStartTime || Date.now());
        const total = this.game?.matchDuration || 120000;
        gs.timeRemaining = Math.max(0, 100 - (elapsed / total) * 100);
        
        // Game phase
        if (gs.timeRemaining > 70) gs.phase = 'early';
        else if (gs.timeRemaining > 40) gs.phase = 'mid';
        else if (gs.timeRemaining > 15) gs.phase = 'late';
        else gs.phase = 'critical';
        
        // Urgency calculation
        const timePressure = (100 - gs.timeRemaining) / 2;
        const scorePressure = Math.max(0, -gs.scoreDiff) / 2;
        gs.urgency = Math.min(100, timePressure + scorePressure);
    }
    
    /**
     * Analyze the visible board state (cells that are revealed)
     * NEVER access hidden mine positions!
     */
    analyzeVisibleBoard() {
        if (!this.board?.grid) return;
        
        const revealed = this.visibleState.revealedCells;
        revealed.clear();
        
        // Scan the board for visible (revealed) cells only
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                
                if (cell.isRevealed) {
                    // We can only see revealed cells' neighbor counts
                    // We CANNOT see if unrevealed cells are mines!
                    revealed.set(`${x},${y}`, {
                        x, y,
                        neighborCount: cell.neighborCount,
                        isMine: cell.isMine // Only visible because it was revealed (game over)
                    });
                }
                
                // Track our own flags
                if (cell.isFlagged) {
                    this.visibleState.flaggedCells.add(`${x},${y}`);
                } else {
                    this.visibleState.flaggedCells.delete(`${x},${y}`);
                }
            }
        }
    }
    
    // ==================== THREE-LAYER DECISION PROCESS ====================
    
    /**
     * Main decision function - uses three layers
     * @returns {Object|null} The chosen action
     */
    decide() {
        const candidates = [];
        
        // LAYER 1: Deterministic (guaranteed moves)
        const safeCells = this.deterministicLayer.findSafeCells();
        const mineCells = this.deterministicLayer.findMineCells();
        
        // Add safe moves (highest priority)
        for (const cell of safeCells) {
            candidates.push({
                type: 'reveal',
                x: cell.x,
                y: cell.y,
                priority: 100,
                reason: 'Deterministic: Guaranteed safe',
                layer: 'deterministic'
            });
        }
        
        // Add flag moves for confirmed mines
        for (const cell of mineCells) {
            if (!this.visibleState.flaggedCells.has(`${cell.x},${cell.y}`)) {
                candidates.push({
                    type: 'flag',
                    x: cell.x,
                    y: cell.y,
                    priority: 95,
                    reason: 'Deterministic: Confirmed mine',
                    layer: 'deterministic'
                });
            }
        }
        
        // Add radar mine flags (highest flag priority)
        for (const pos of this.visibleState.pendingRadarFlags) {
            candidates.push({
                type: 'flag',
                x: pos.x,
                y: pos.y,
                priority: 98,
                reason: 'Radar: Revealed mine',
                layer: 'deterministic'
            });
        }
        
        // LAYER 2: Probabilistic (when no deterministic moves)
        if (candidates.filter(c => c.type === 'reveal').length === 0) {
            const riskyMoves = this.probabilisticLayer.findLowRiskCells();
            
            for (const move of riskyMoves) {
                candidates.push({
                    type: 'reveal',
                    x: move.x,
                    y: move.y,
                    priority: 60 - (move.risk * 50), // Lower risk = higher priority
                    reason: `Probabilistic: ${(move.risk * 100).toFixed(1)}% risk`,
                    layer: 'probabilistic',
                    risk: move.risk
                });
            }
        }
        
        // LAYER 3: Strategic (power usage, timing)
        const powerAction = this.strategicLayer.evaluatePowerUsage();
        if (powerAction) {
            candidates.push(powerAction);
        }
        
        // No candidates? Return null for emergency action
        if (candidates.length === 0) return null;
        
        // Sort by priority
        candidates.sort((a, b) => b.priority - a.priority);
        
        // Apply difficulty-based selection
        return this.selectActionByDifficulty(candidates);
    }
    
    /**
     * Select action based on difficulty (accuracy, mistakes)
     */
    selectActionByDifficulty(candidates) {
        const accuracy = this.config.getAccuracy();
        
        // Check for intentional mistake (human-like imperfection)
        if (Math.random() > accuracy) {
            // Make a suboptimal choice
            const suboptimalIndex = Math.min(
                Math.floor(Math.random() * 3),
                candidates.length - 1
            );
            const chosen = candidates[suboptimalIndex];
            console.log(`[BotCore] Suboptimal choice (difficulty): ${chosen.reason}`);
            return chosen;
        }
        
        // Optimal choice
        return candidates[0];
    }
    
    // ==================== ACTION EXECUTION ====================
    
    /**
     * Execute an action
     */
    execute(action) {
        const logPrefix = `[BotCore] ${action.layer?.toUpperCase() || 'ACTION'}`;
        console.log(`${logPrefix}: ${action.type} (${action.x},${action.y}) - ${action.reason}`);
        
        switch (action.type) {
            case 'reveal':
                this.executeReveal(action);
                break;
                
            case 'flag':
                this.executeFlag(action);
                break;
                
            case 'unflag':
                this.executeUnflag(action);
                break;
                
            case 'power':
                this.executePower(action);
                break;
        }
        
        // Record move for learning
        this.recordMove(action);
    }
    
    /**
     * Execute a reveal action
     */
    executeReveal(action) {
        const result = this.game?.makeBotMove?.(action.x, action.y);
        this.gameState.movesThisGame++;
        
        if (result?.hitMine) {
            this.gameState.minesHit++;
            this.learningSystem.recordMistake({
                type: 'mine_hit',
                x: action.x,
                y: action.y,
                risk: action.risk || 0,
                layer: action.layer
            });
        } else {
            this.learningSystem.recordSuccess({
                type: 'safe_reveal',
                x: action.x,
                y: action.y,
                layer: action.layer
            });
        }
    }
    
    /**
     * Execute a flag action
     */
    executeFlag(action) {
        this.game?.makeBotFlag?.(action.x, action.y);
        this.visibleState.flaggedCells.add(`${action.x},${action.y}`);
        
        // Remove from pending radar flags
        this.visibleState.pendingRadarFlags = 
            this.visibleState.pendingRadarFlags.filter(
                p => !(p.x === action.x && p.y === action.y)
            );
        
        this.gameState.correctFlags++; // Assume correct, validate later
    }
    
    /**
     * Execute an unflag action
     */
    executeUnflag(action) {
        this.game?.makeBotUnflag?.(action.x, action.y);
        this.visibleState.flaggedCells.delete(`${action.x},${action.y}`);
    }
    
    /**
     * Execute a power usage
     */
    executePower(action) {
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        const result = this.game?.useBotPower?.(action.power, costs[action.power]);
        
        if (result) {
            this.powerUsage[action.power]++;
            this.powerUsage.lastUseTime = Date.now();
            
            this.learningSystem.recordPowerUsage({
                power: action.power,
                gameState: { ...this.gameState },
                reason: action.reason
            });
            
            console.log(`[BotCore] Power used: ${action.power.toUpperCase()}`);
        }
    }
    
    /**
     * Record a move for learning
     */
    recordMove(action) {
        this.moveHistory.push({
            ...action,
            timestamp: Date.now(),
            gameState: { ...this.gameState }
        });
        
        // Keep last 100 moves
        if (this.moveHistory.length > 100) {
            this.moveHistory.shift();
        }
    }
    
    /**
     * Emergency action when stuck
     */
    emergencyAction() {
        console.log('[BotCore] Emergency action - finding any valid move');
        
        // Try corners first (statistically safer in Minesweeper)
        const corners = [
            { x: 0, y: 0 },
            { x: this.gridSize - 1, y: 0 },
            { x: 0, y: this.gridSize - 1 },
            { x: this.gridSize - 1, y: this.gridSize - 1 }
        ];
        
        for (const pos of corners) {
            const cell = this.board?.grid?.[pos.y]?.[pos.x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                this.game?.makeBotMove?.(pos.x, pos.y);
                return;
            }
        }
        
        // Try edges
        for (let i = 0; i < this.gridSize; i++) {
            const edges = [
                { x: i, y: 0 },
                { x: i, y: this.gridSize - 1 },
                { x: 0, y: i },
                { x: this.gridSize - 1, y: i }
            ];
            
            for (const pos of edges) {
                const cell = this.board?.grid?.[pos.y]?.[pos.x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    this.game?.makeBotMove?.(pos.x, pos.y);
                    return;
                }
            }
        }
        
        // Last resort: any unrevealed cell
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    this.game?.makeBotMove?.(x, y);
                    return;
                }
            }
        }
    }
    
    // ==================== EXTERNAL EVENTS ====================
    
    /**
     * Receive radar results (mines revealed by power)
     * This is FAIR because radar is a game mechanic
     */
    receiveRadarResults(mines) {
        if (!mines || mines.length === 0) return;
        
        console.log(`[BotCore] Radar revealed ${mines.length} mines`);
        
        for (const mine of mines) {
            const key = `${mine.x},${mine.y}`;
            this.visibleState.radarMines.add(key);
            
            // Add to pending flags
            const cell = this.board?.grid?.[mine.y]?.[mine.x];
            if (cell && !cell.isFlagged && !cell.isRevealed) {
                this.visibleState.pendingRadarFlags.push({ x: mine.x, y: mine.y });
            }
        }
    }
    
    /**
     * Watch player moves for learning
     */
    watchPlayerMove(moveData) {
        this.learningSystem.observePlayerMove(moveData);
        this.strategicLayer.updateOpponentAnalysis(moveData);
    }
    
    /**
     * Update player score for strategic decisions
     */
    updatePlayerScore(score) {
        this.gameState.opponentScore = score;
        this.gameState.scoreDiff = this.gameState.myScore - score;
        this.strategicLayer.updateOpponentScore(score);
    }
    
    /**
     * End game learning
     */
    endGame(result) {
        const gameData = {
            won: result.botWon,
            draw: result.draw,
            myScore: result.botScore,
            opponentScore: result.playerScore,
            moves: this.moveHistory,
            powerUsage: { ...this.powerUsage },
            duration: Date.now() - (this.game?.matchStartTime || Date.now()),
            difficulty: this.difficulty
        };
        
        this.learningSystem.endGame(gameData);
        
        const emoji = result.botWon ? '🏆' : (result.draw ? '🤝' : '💔');
        console.log(`[BotCore] Game ended ${emoji} | Score: ${result.botScore} vs ${result.playerScore}`);
    }
    
    // ==================== UTILITY ====================
    
    /**
     * Get neighbors of a cell
     */
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
}
