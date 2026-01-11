/**
 * BotAdapter.js - Game Integration Adapter
 * 
 * Bridges the new modular BotCore AI with the existing game.js infrastructure.
 * Provides backward compatibility while enabling the enhanced AI capabilities.
 * 
 * @version 1.0
 */

import { BotCore } from './ai/BotCore.js';
import { BotDifficultyConfig } from './ai/BotDifficultyConfig.js';

export class BotAdapter {
    /**
     * Create a bot adapter
     * @param {Object} options - Configuration options
     * @param {Object} options.boardManager - The BoardManager instance
     * @param {Object} options.powerManager - The PowerManager instance
     * @param {string} options.difficulty - Difficulty level
     * @param {Object} options.game - Reference to game object
     * @param {Object} options.callbacks - Game callbacks
     */
    constructor(options = {}) {
        this.boardManager = options.boardManager;
        this.powerManager = options.powerManager;
        this.game = options.game;
        this.difficulty = options.difficulty || 'medium';
        
        // Callbacks for game actions
        this.callbacks = {
            onCellClick: options.onCellClick || (() => {}),
            onCellFlag: options.onCellFlag || (() => {}),
            onPowerUse: options.onPowerUse || (() => {}),
            onBotThinking: options.onBotThinking || (() => {}),
            onBotDecision: options.onBotDecision || (() => {})
        };
        
        // Create the core bot
        this.bot = null;
        this.isActive = false;
        this.moveQueue = [];
        this.gamePhase = 'early';
        
        // Performance tracking
        this.moveCount = 0;
        this.startTime = null;
        this.thinkingTime = 0;
    }
    
    /**
     * Initialize the bot for a new game
     */
    async initialize() {
        console.log('[BotAdapter] Initializing...');
        
        // Get difficulty configuration
        const config = BotDifficultyConfig.getConfig(this.difficulty);
        
        // Create initial game state
        const gameState = this.buildGameState();
        
        // Create the bot core
        this.bot = new BotCore({
            difficulty: this.difficulty,
            initialGameState: gameState
        });
        
        // Wait for bot to load learning data
        await this.bot.loadLearning();
        
        this.isActive = true;
        this.moveCount = 0;
        this.startTime = Date.now();
        
        console.log(`[BotAdapter] Initialized with difficulty: ${this.difficulty}`);
    }
    
    /**
     * Build game state from board manager
     */
    buildGameState() {
        const grid = [];
        
        if (this.boardManager && this.boardManager.grid) {
            for (let y = 0; y < this.boardManager.height; y++) {
                const row = [];
                for (let x = 0; x < this.boardManager.width; x++) {
                    const cell = this.boardManager.grid[y]?.[x];
                    
                    if (cell) {
                        row.push({
                            x,
                            y,
                            isRevealed: cell.isRevealed || false,
                            isFlagged: cell.isFlagged || false,
                            neighborCount: cell.isRevealed ? (cell.adjacentMines || 0) : -1,
                            // NEVER expose mine information
                            isMine: undefined // Fairness: hidden from bot
                        });
                    } else {
                        row.push({
                            x, y,
                            isRevealed: false,
                            isFlagged: false,
                            neighborCount: -1
                        });
                    }
                }
                grid.push(row);
            }
        }
        
        // Get game info
        const timeRemaining = this.game?.timeRemaining || 120;
        const totalTime = this.game?.matchDuration || 120;
        const timeProgress = 1 - (timeRemaining / totalTime);
        
        // Determine phase
        if (timeProgress < 0.25) {
            this.gamePhase = 'early';
        } else if (timeProgress < 0.6) {
            this.gamePhase = 'mid';
        } else if (timeProgress < 0.85) {
            this.gamePhase = 'late';
        } else {
            this.gamePhase = 'critical';
        }
        
        // Count revealed cells for phase
        let revealedCount = 0;
        let totalCells = 0;
        
        for (const row of grid) {
            for (const cell of row) {
                totalCells++;
                if (cell.isRevealed) revealedCount++;
            }
        }
        
        const revealProgress = totalCells > 0 ? revealedCount / totalCells : 0;
        
        return {
            grid,
            width: this.boardManager?.width || 10,
            height: this.boardManager?.height || 10,
            totalMines: this.boardManager?.mineCount || 15,
            
            bot: {
                score: this.game?.botScore || 0,
                energy: this.powerManager?.botEnergy || 100,
                activePowers: this.getActivePowers('bot')
            },
            
            player: {
                score: this.game?.playerScore || 0,
                energy: this.powerManager?.playerEnergy || 100,
                activePowers: this.getActivePowers('player')
            },
            
            timeRemaining,
            phase: this.gamePhase,
            revealProgress
        };
    }
    
    /**
     * Get active powers for a player
     */
    getActivePowers(playerType) {
        if (!this.powerManager) return [];
        
        const powers = [];
        
        // Check for shield
        if (playerType === 'bot') {
            if (this.powerManager.botShieldActive) powers.push('shield');
            if (this.powerManager.playerFrozen) powers.push('freeze_active');
        } else {
            if (this.powerManager.playerShieldActive) powers.push('shield');
            if (this.powerManager.botFrozen) powers.push('freeze_active');
        }
        
        return powers;
    }
    
    /**
     * Start the bot - begins the think-act loop
     */
    start() {
        if (!this.bot || !this.isActive) {
            console.warn('[BotAdapter] Cannot start - not initialized');
            return;
        }
        
        console.log('[BotAdapter] Starting bot...');
        this.bot.start();
        this.scheduleNextMove();
    }
    
    /**
     * Stop the bot
     */
    stop() {
        console.log('[BotAdapter] Stopping bot...');
        this.isActive = false;
        
        if (this.bot) {
            this.bot.stop();
        }
        
        if (this.moveTimeout) {
            clearTimeout(this.moveTimeout);
            this.moveTimeout = null;
        }
    }
    
    /**
     * Schedule the next bot move
     */
    scheduleNextMove() {
        if (!this.isActive) return;
        
        const config = BotDifficultyConfig.getConfig(this.difficulty);
        const delay = config.getReactionDelay();
        
        this.moveTimeout = setTimeout(() => {
            this.performMove();
        }, delay);
    }
    
    /**
     * Perform a single bot move
     */
    async performMove() {
        if (!this.isActive || !this.bot) return;
        
        // Update game state
        const gameState = this.buildGameState();
        
        // Notify thinking started
        this.callbacks.onBotThinking(true);
        
        const thinkStart = performance.now();
        
        try {
            // Get bot decision
            const action = await this.bot.think(gameState);
            
            this.thinkingTime += performance.now() - thinkStart;
            
            if (!action) {
                console.log('[BotAdapter] No action returned');
                this.callbacks.onBotThinking(false);
                this.scheduleNextMove();
                return;
            }
            
            // Apply difficulty-based error chance
            const modifiedAction = this.applyDifficultyModifiers(action, gameState);
            
            // Notify decision made
            this.callbacks.onBotDecision(modifiedAction);
            
            // Execute the action
            await this.executeAction(modifiedAction);
            
            this.moveCount++;
            
        } catch (error) {
            console.error('[BotAdapter] Error during move:', error);
        }
        
        // Notify thinking ended
        this.callbacks.onBotThinking(false);
        
        // Schedule next move
        if (this.isActive) {
            this.scheduleNextMove();
        }
    }
    
    /**
     * Apply difficulty-based modifiers to action
     */
    applyDifficultyModifiers(action, gameState) {
        const config = BotDifficultyConfig.getConfig(this.difficulty);
        
        // Random error chance
        if (config.shouldMakeError()) {
            console.log('[BotAdapter] Difficulty-based intentional error');
            
            // Pick a random hidden cell instead
            const hiddenCells = [];
            for (const row of gameState.grid) {
                for (const cell of row) {
                    if (!cell.isRevealed && !cell.isFlagged) {
                        hiddenCells.push(cell);
                    }
                }
            }
            
            if (hiddenCells.length > 0) {
                const randomCell = hiddenCells[Math.floor(Math.random() * hiddenCells.length)];
                return {
                    type: 'reveal',
                    x: randomCell.x,
                    y: randomCell.y,
                    reason: 'difficulty_error'
                };
            }
        }
        
        return action;
    }
    
    /**
     * Execute a bot action
     */
    async executeAction(action) {
        switch (action.type) {
            case 'reveal':
                await this.callbacks.onCellClick(action.x, action.y, 'bot');
                break;
                
            case 'flag':
                await this.callbacks.onCellFlag(action.x, action.y, 'bot');
                break;
                
            case 'power':
                await this.executePowerAction(action);
                break;
                
            default:
                console.warn('[BotAdapter] Unknown action type:', action.type);
        }
    }
    
    /**
     * Execute a power action
     */
    async executePowerAction(action) {
        const powerType = action.power;
        
        switch (powerType) {
            case 'radar':
                // Radar needs a target area
                const radarResult = await this.callbacks.onPowerUse('radar', action.target, 'bot');
                
                // Feed radar results back to bot
                if (radarResult && this.bot) {
                    this.bot.receiveRadarResults(radarResult);
                }
                break;
                
            case 'freeze':
                await this.callbacks.onPowerUse('freeze', null, 'bot');
                break;
                
            case 'shield':
                await this.callbacks.onPowerUse('shield', null, 'bot');
                break;
                
            case 'safeburst':
                await this.callbacks.onPowerUse('safeburst', action.target, 'bot');
                break;
                
            default:
                console.warn('[BotAdapter] Unknown power type:', powerType);
        }
    }
    
    /**
     * Notify bot of player action (for learning and adaptation)
     */
    watchPlayerMove(action) {
        if (this.bot) {
            this.bot.watchPlayerMove(action);
        }
    }
    
    /**
     * Notify bot that a cell was revealed (for learning)
     */
    notifyCellRevealed(x, y, wasMine, adjacentMines) {
        if (this.bot) {
            this.bot.notifyCellRevealed(x, y, wasMine, adjacentMines);
        }
    }
    
    /**
     * End the game and sync learning
     */
    async endGame(result) {
        console.log(`[BotAdapter] Game ended: ${result}`);
        
        this.isActive = false;
        
        if (this.bot) {
            const stats = {
                moveCount: this.moveCount,
                duration: Date.now() - this.startTime,
                avgThinkTime: this.moveCount > 0 ? this.thinkingTime / this.moveCount : 0
            };
            
            await this.bot.endGame(result, stats);
        }
    }
    
    /**
     * Get current bot stats
     */
    getStats() {
        return {
            moveCount: this.moveCount,
            isActive: this.isActive,
            difficulty: this.difficulty,
            gamePhase: this.gamePhase,
            avgThinkTime: this.moveCount > 0 ? this.thinkingTime / this.moveCount : 0
        };
    }
    
    /**
     * Set difficulty dynamically
     */
    setDifficulty(newDifficulty) {
        this.difficulty = newDifficulty;
        
        if (this.bot) {
            this.bot.setDifficulty(newDifficulty);
        }
        
        console.log(`[BotAdapter] Difficulty changed to: ${newDifficulty}`);
    }
}

// ==================== FACTORY FUNCTION ====================

/**
 * Create a bot adapter with the appropriate configuration
 * 
 * @param {Object} gameContext - The game context
 * @returns {BotAdapter} - The configured bot adapter
 */
export function createBotAdapter(gameContext) {
    return new BotAdapter({
        boardManager: gameContext.boardManager,
        powerManager: gameContext.powerManager,
        game: gameContext.game,
        difficulty: gameContext.difficulty || 'medium',
        callbacks: {
            onCellClick: gameContext.onCellClick,
            onCellFlag: gameContext.onCellFlag,
            onPowerUse: gameContext.onPowerUse,
            onBotThinking: gameContext.onBotThinking || (() => {}),
            onBotDecision: gameContext.onBotDecision || (() => {})
        }
    });
}

// ==================== LEGACY BRIDGE ====================

/**
 * LegacyBotBridge - Provides backward compatibility with existing BotAI interface
 * 
 * Use this if the existing game.js expects the old BotAI interface
 */
export class LegacyBotBridge {
    constructor(options = {}) {
        this.adapter = new BotAdapter(options);
        
        // Legacy state
        this.isThinking = false;
        this.lastDecision = null;
    }
    
    // Legacy methods that map to new adapter
    
    async initialize() {
        await this.adapter.initialize();
    }
    
    startBotGame() {
        this.adapter.start();
    }
    
    stopBot() {
        this.adapter.stop();
    }
    
    // Legacy property access
    get isActive() {
        return this.adapter.isActive;
    }
    
    get moveCount() {
        return this.adapter.moveCount;
    }
    
    // Legacy method: make a single move decision
    async makeMove(boardState, gameInfo) {
        // Build game state from legacy format
        const gameState = {
            grid: boardState,
            width: boardState[0]?.length || 10,
            height: boardState.length,
            totalMines: gameInfo?.totalMines || 15,
            bot: {
                score: gameInfo?.botScore || 0,
                energy: gameInfo?.botEnergy || 100,
                activePowers: []
            },
            player: {
                score: gameInfo?.playerScore || 0,
                energy: gameInfo?.playerEnergy || 100,
                activePowers: []
            },
            timeRemaining: gameInfo?.timeRemaining || 120,
            phase: 'mid'
        };
        
        if (this.adapter.bot) {
            this.isThinking = true;
            const decision = await this.adapter.bot.think(gameState);
            this.isThinking = false;
            this.lastDecision = decision;
            return decision;
        }
        
        return null;
    }
    
    // Legacy notification methods
    playerMoved(x, y, result) {
        this.adapter.watchPlayerMove({
            type: 'reveal',
            x, y,
            result
        });
    }
    
    gameEnded(result) {
        this.adapter.endGame(result);
    }
}

export default BotAdapter;
