/**
 * GameManager.js - Main game controller for MineDuel
 * Manages two boards, scoring, match timer, and game flow
 */

import { BoardManager } from './BoardManager.js';
import { PowerManager } from './PowerManager.js';
import { AudioManager } from './AudioManager.js';

export class GameManager {
    constructor() {
        // Game state
        this.gameRunning = false;
        this.gameStartTime = 0;
        this.matchDuration = 120000; // 2 minutes in milliseconds
        this.gameTimer = null;
        this.lastUpdateTime = 0;

        // Scoring
        this.playerScore = 0;
        this.opponentScore = 0;
        
        // Boards
        this.playerBoard = null;
        this.opponentBoard = null;
        
        // Power system
        this.powerManager = null;
        
        // Audio system
        this.audioManager = null;
        
        // AI opponent (simple simulation for now)
        this.opponentAI = {
            lastAction: 0,
            actionInterval: 2000, // AI acts every 2 seconds
            difficulty: 0.7 // 70% chance to make a good move
        };

        this.initializeGame();
    }

    /**
     * Initialize the game components
     */
    initializeGame() {
        // Get canvas elements
        const playerCanvas = document.getElementById('player-board');
        const opponentCanvas = document.getElementById('opponent-board');

        if (!playerCanvas || !opponentCanvas) {
            console.error('Canvas elements not found!');
            return;
        }

        // Create board managers
        this.playerBoard = new BoardManager(playerCanvas, 10, 15);
        this.opponentBoard = new BoardManager(opponentCanvas, 10, 15);

        // Create power manager
        this.powerManager = new PowerManager(this);
        
        // Create audio manager
        this.audioManager = new AudioManager();

        // Setup event handlers
        this.setupEventHandlers();
        
        // Override player board click handler to integrate scoring
        this.setupPlayerBoardIntegration();

        // Start game loop
        this.startGameLoop();
        
        // Update initial displays
        this.updateScoreDisplay();
        this.updateTimerDisplay();
        
        console.log('MineDuel initialized! Click on your board to start playing.');
    }

    /**
     * Setup event handlers for UI elements
     */
    setupEventHandlers() {
        // Play again button
        const playAgainBtn = document.getElementById('play-again');
        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => this.startNewGame());
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            setTimeout(() => {
                this.playerBoard.setupCanvas();
                this.opponentBoard.setupCanvas();
                this.playerBoard.render();
                this.opponentBoard.render();
            }, 100);
        });
    }

    /**
     * Integrate player board with scoring and power systems
     */
    setupPlayerBoardIntegration() {
        // Store original click handler
        const originalHandleClick = this.playerBoard.handleCellClick.bind(this.playerBoard);
        
        // Override with scoring integration
        this.playerBoard.handleCellClick = (screenX, screenY) => {
            if (!this.gameRunning) {
                this.startMatch();
            }

            const result = originalHandleClick(screenX, screenY);
            
            if (result) {
                this.handlePlayerAction(result);
            }
            
            return result;
        };
    }

    /**
     * Handle player action results
     * @param {object} result - Result from board action
     */
    handlePlayerAction(result) {
        if (result.hitMine) {
            // Handle mine hit
            const damage = 10; // Base mine damage
            const actualDamage = this.powerManager.handleMineHit(damage);
            
            if (actualDamage > 0) {
                this.playerScore = Math.max(0, this.playerScore - actualDamage);
                this.showScoreFeedback(-actualDamage, 'Mine hit!');
                this.audioManager.playMineHit();
            }
        } else {
            // Handle successful cell reveal
            this.addPlayerScore(result.points);
            
            // Award energy for good moves
            this.powerManager.awardEnergyForAction(result.points);
            
            // Play appropriate sound
            if (result.cellsRevealed > 1) {
                this.audioManager.playComboEffect(result.cellsRevealed);
            } else {
                this.audioManager.playCellReveal();
            }
            
            if (result.points > 0) {
                this.audioManager.playScoreGain(result.points);
            }
        }

        this.updateScoreDisplay();
        this.checkWinConditions();
    }

    /**
     * Add points to player score with feedback
     * @param {number} points - Points to add
     */
    addPlayerScore(points) {
        this.playerScore += points;
        this.showScoreFeedback(points);
    }

    /**
     * Show score feedback animation
     * @param {number} points - Points gained/lost
     * @param {string} message - Optional message
     */
    showScoreFeedback(points, message = '') {
        const feedback = document.createElement('div');
        feedback.className = 'score-feedback';
        feedback.textContent = `${points > 0 ? '+' : ''}${points} ${message}`;
        feedback.style.position = 'fixed';
        feedback.style.left = '50%';
        feedback.style.top = '70%';
        feedback.style.transform = 'translateX(-50%)';
        feedback.style.color = points > 0 ? '#4ecdc4' : '#ff6b6b';
        feedback.style.fontSize = '20px';
        feedback.style.fontWeight = 'bold';
        feedback.style.zIndex = '999';
        feedback.style.pointerEvents = 'none';
        feedback.style.animation = 'scoreFloat 1.5s ease-out forwards';

        // Add animation if not exists
        if (!document.querySelector('#score-feedback-styles')) {
            const style = document.createElement('style');
            style.id = 'score-feedback-styles';
            style.textContent = `
                @keyframes scoreFloat {
                    0% { opacity: 0; transform: translateX(-50%) translateY(0); }
                    20% { opacity: 1; }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-50px); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(feedback);

        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 1500);
    }

    /**
     * Start a new match
     */
    startMatch() {
        if (this.gameRunning) return;

        this.gameRunning = true;
        this.gameStartTime = Date.now();
        this.lastUpdateTime = this.gameStartTime;
        
        // Reset scores
        this.playerScore = 0;
        this.opponentScore = 0;
        
        // Reset boards
        this.playerBoard.reset();
        this.opponentBoard.reset();
        
        // Reset power system
        this.powerManager.reset();
        
        // Start timers
        this.startGameTimer();
        this.startOpponentAI();
        
        this.updateScoreDisplay();
        this.updateTimerDisplay();
        
        console.log('Match started! Race to clear your board!');
    }

    /**
     * Start new game (reset everything)
     */
    startNewGame() {
        // Stop current game
        this.endMatch(false);
        
        // Hide game over modal
        const modal = document.getElementById('game-over-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        
        // Reset everything
        this.playerScore = 0;
        this.opponentScore = 0;
        this.playerBoard.reset();
        this.opponentBoard.reset();
        this.powerManager.reset();
        
        this.updateScoreDisplay();
        this.updateTimerDisplay();
        
        console.log('New game ready! Click on your board to start.');
    }

    /**
     * Start game timer
     */
    startGameTimer() {
        this.gameTimer = setInterval(() => {
            this.updateTimerDisplay();
            this.checkTimeLimit();
        }, 1000);
    }

    /**
     * Start opponent AI
     */
    startOpponentAI() {
        this.opponentAI.lastAction = Date.now();
        
        // Simple AI that makes moves periodically
        const aiInterval = setInterval(() => {
            if (!this.gameRunning) {
                clearInterval(aiInterval);
                return;
            }
            
            this.makeOpponentMove();
        }, this.opponentAI.actionInterval);
    }

    /**
     * Make an AI move for the opponent
     */
    makeOpponentMove() {
        // Simple AI: pick a random unopened cell
        const unopenedCells = [];
        
        for (let y = 0; y < this.opponentBoard.gridSize; y++) {
            for (let x = 0; x < this.opponentBoard.gridSize; x++) {
                const cell = this.opponentBoard.grid[y][x];
                if (cell.canBeOpened()) {
                    unopenedCells.push({ x, y });
                }
            }
        }

        if (unopenedCells.length === 0) return;

        // AI difficulty affects move quality
        let targetCell;
        if (Math.random() < this.opponentAI.difficulty) {
            // Smart move: prefer cells with lower mine probability
            // For now, just pick randomly (can be improved)
            targetCell = unopenedCells[Math.floor(Math.random() * unopenedCells.length)];
        } else {
            // Random move
            targetCell = unopenedCells[Math.floor(Math.random() * unopenedCells.length)];
        }

        // Simulate the move
        const result = this.opponentBoard.revealCell(targetCell.x, targetCell.y);
        
        if (result.hitMine) {
            this.opponentScore = Math.max(0, this.opponentScore - 10);
        } else {
            this.opponentScore += result.points;
        }

        this.updateScoreDisplay();
        this.checkWinConditions();
    }

    /**
     * Update score display
     */
    updateScoreDisplay() {
        const playerScoreElement = document.getElementById('player-score');
        const opponentScoreElement = document.getElementById('opponent-score');
        
        if (playerScoreElement) {
            playerScoreElement.textContent = this.playerScore;
        }
        if (opponentScoreElement) {
            opponentScoreElement.textContent = this.opponentScore;
        }
    }

    /**
     * Update timer display
     */
    updateTimerDisplay() {
        if (!this.gameRunning) {
            const timerElement = document.getElementById('timer');
            if (timerElement) {
                timerElement.textContent = '02:00';
            }
            return;
        }

        const elapsed = Date.now() - this.gameStartTime;
        const remaining = Math.max(0, this.matchDuration - elapsed);
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    /**
     * Check if time limit reached
     */
    checkTimeLimit() {
        if (!this.gameRunning) return;

        const elapsed = Date.now() - this.gameStartTime;
        if (elapsed >= this.matchDuration) {
            this.endMatch(true);
        }
    }

    /**
     * Check win conditions
     */
    checkWinConditions() {
        if (!this.gameRunning) return;

        const playerStats = this.playerBoard.getStats();
        const opponentStats = this.opponentBoard.getStats();

        // Check if either player cleared their board
        if (playerStats.completionPercentage >= 80) {
            this.endMatch(true, 'player');
        } else if (opponentStats.completionPercentage >= 80) {
            this.endMatch(true, 'opponent');
        }
    }

    /**
     * End the match
     * @param {boolean} timeUp - Whether time ran out
     * @param {string} winner - Optional specific winner ('player' or 'opponent')
     */
    endMatch(timeUp, winner = null) {
        if (!this.gameRunning && !timeUp) return;

        this.gameRunning = false;
        
        // Stop timers
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }

        // Determine winner
        let gameResult;
        if (winner === 'player') {
            gameResult = 'Victory!';
        } else if (winner === 'opponent') {
            gameResult = 'Defeat!';
        } else {
            // Time up or manual end - compare scores
            if (this.playerScore > this.opponentScore) {
                gameResult = 'Victory!';
            } else if (this.opponentScore > this.playerScore) {
                gameResult = 'Defeat!';
            } else {
                gameResult = 'Draw!';
            }
        }

        this.showGameOverModal(gameResult);
        
        // Play end game sound
        const won = gameResult.includes('Victory');
        this.audioManager.playGameEnd(won);
    }

    /**
     * Show game over modal
     * @param {string} result - Game result text
     */
    showGameOverModal(result) {
        const modal = document.getElementById('game-over-modal');
        const resultElement = document.getElementById('game-result');
        const finalPlayerScore = document.getElementById('final-player-score');
        const finalOpponentScore = document.getElementById('final-opponent-score');

        if (modal && resultElement && finalPlayerScore && finalOpponentScore) {
            resultElement.textContent = result;
            finalPlayerScore.textContent = this.playerScore;
            finalOpponentScore.textContent = this.opponentScore;
            modal.classList.remove('hidden');
        }
    }

    /**
     * Main game loop
     */
    startGameLoop() {
        const gameLoop = (currentTime) => {
            const deltaTime = currentTime - this.lastUpdateTime;
            this.lastUpdateTime = currentTime;

            // Update boards
            this.playerBoard.update(deltaTime);
            this.opponentBoard.update(deltaTime);

            // Update power manager
            if (this.powerManager) {
                this.powerManager.updateCooldowns();
            }

            requestAnimationFrame(gameLoop);
        };

        requestAnimationFrame(gameLoop);
    }

    /**
     * Get current match statistics
     */
    getMatchStats() {
        const elapsed = this.gameRunning ? Date.now() - this.gameStartTime : 0;
        const playerBoardStats = this.playerBoard.getStats();
        const opponentBoardStats = this.opponentBoard.getStats();

        return {
            matchTime: elapsed,
            playerScore: this.playerScore,
            opponentScore: this.opponentScore,
            playerBoardCompletion: playerBoardStats.completionPercentage,
            opponentBoardCompletion: opponentBoardStats.completionPercentage,
            isRunning: this.gameRunning
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.endMatch(false);
        
        if (this.powerManager) {
            this.powerManager.destroy();
        }
        
        if (this.audioManager) {
            this.audioManager.destroy();
        }
    }
}