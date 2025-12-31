/**
 * MineDuel - Supabase Realtime Multiplayer Game
 * Uses Supabase for matchmaking and real-time sync
 */

import * as SupabaseClient from './supabaseClient.js';

// ==================== CONFIGURATION ====================
const CONFIG = {
    DIFFICULTIES: {
        easy: { gridSize: 8, mineCount: 12 },
        medium: { gridSize: 10, mineCount: 20 },
        hard: { gridSize: 12, mineCount: 35 }
    },
    MATCH_DURATION: 120000,
    COLORS: {
        1: '#3498db', 2: '#27ae60', 3: '#e74c3c', 4: '#9b59b6',
        5: '#e67e22', 6: '#1abc9c', 7: '#34495e', 8: '#95a5a6'
    },
    POWER_COSTS: { radar: 30, safeburst: 40, shield: 50, freeze: 60 }
};

// ==================== AUDIO MANAGER ====================
class AudioManager {
    constructor() {
        this.enabled = true;
        this.volume = 0.5;
        this.audioContext = null;
        this.init();
    }

    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            document.addEventListener('click', () => {
                if (this.audioContext?.state === 'suspended') {
                    this.audioContext.resume();
                }
            }, { once: true });
        } catch (e) {
            this.enabled = false;
        }
    }

    playTone(frequency, duration, type = 'sine', volume = 0.3) {
        if (!this.enabled || !this.audioContext) return;
        try {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = type;
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0, this.audioContext.currentTime);
            gain.gain.linearRampToValueAtTime(volume * this.volume, this.audioContext.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            osc.start();
            osc.stop(this.audioContext.currentTime + duration);
        } catch (e) {}
    }

    playClick() { this.playTone(800, 0.1); }
    playReveal(count = 0) { this.playTone(1000 + count * 100, 0.15, 'triangle', 0.4); }
    playMine() { this.playTone(150, 0.4, 'sawtooth', 0.6); }
    playPower() { this.playTone(1200, 0.2, 'sine', 0.5); }
    playScore(points) { this.playTone(800 + points * 50, 0.2, 'triangle', 0.4); }
    playVictory() {
        [523, 659, 783, 1046].forEach((f, i) => {
            setTimeout(() => this.playTone(f, 0.3, 'sine', 0.4), i * 150);
        });
    }
    playDefeat() {
        [400, 350, 300, 250].forEach((f, i) => {
            setTimeout(() => this.playTone(f, 0.3, 'triangle', 0.3), i * 150);
        });
    }
    toggle() { this.enabled = !this.enabled; return this.enabled; }
}

// ==================== BOARD RENDERER ====================
class BoardRenderer {
    constructor(canvas, isOpponent = false) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isOpponent = isOpponent;
        this.gridSize = 10;
        this.grid = this.createEmptyGrid();
        this.mines = [];
        this.highlightedMines = [];
        this.highlightTimer = null;
        this.setupCanvas();
    }

    setGridSize(gridSize) {
        this.gridSize = gridSize;
        this.grid = this.createEmptyGrid();
        this.setupCanvas();
    }

    createEmptyGrid() {
        const grid = [];
        for (let y = 0; y < this.gridSize; y++) {
            grid[y] = [];
            for (let x = 0; x < this.gridSize; x++) {
                grid[y][x] = { isRevealed: false, isFlagged: false, isMine: false, neighborCount: 0 };
            }
        }
        return grid;
    }

    setupCanvas() {
        const cellSize = this.isOpponent ? 16 : 26;
        const size = this.gridSize * cellSize;
        this.canvas.width = size;
        this.canvas.height = size;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        this.cellSize = cellSize;
        this.render();
    }

    getCellFromClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.cellSize);
        const y = Math.floor((e.clientY - rect.top) / this.cellSize);
        if (x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize) return { x, y };
        return null;
    }

    generateMines(mineCount, excludeX = -1, excludeY = -1) {
        this.mines = [];
        const positions = [];
        
        // Exclude a larger area around first click (5x5) to ensure opening
        const excludeRadius = 2; // 5x5 area (2 cells in each direction)
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                // Check if this cell is within the excluded area
                const isExcluded = Math.abs(x - excludeX) <= excludeRadius && 
                                   Math.abs(y - excludeY) <= excludeRadius;
                if (!isExcluded) {
                    positions.push({ x, y });
                }
            }
        }
        
        // Make sure we have enough positions for mines
        const actualMineCount = Math.min(mineCount, positions.length);
        
        // Shuffle and pick
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        this.mines = positions.slice(0, actualMineCount);
        
        // Mark mines on grid
        this.mines.forEach(m => {
            if (this.grid[m.y] && this.grid[m.y][m.x]) {
                this.grid[m.y][m.x].isMine = true;
            }
        });
        
        // Calculate neighbor counts
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (!this.grid[y][x].isMine) {
                    this.grid[y][x].neighborCount = this.countAdjacentMines(x, y);
                }
            }
        }
    }

    countAdjacentMines(x, y) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize) {
                    if (this.grid[ny][nx].isMine) count++;
                }
            }
        }
        return count;
    }

    revealCell(x, y) {
        if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return [];
        const cell = this.grid[y][x];
        if (cell.isRevealed || cell.isFlagged) return [];
        
        cell.isRevealed = true;
        const revealed = [{ x, y, isMine: cell.isMine, neighborCount: cell.neighborCount }];
        
        // Flood fill if empty
        if (!cell.isMine && cell.neighborCount === 0) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx !== 0 || dy !== 0) {
                        revealed.push(...this.revealCell(x + dx, y + dy));
                    }
                }
            }
        }
        return revealed;
    }

    highlightMines(mines, duration = 3000) {
        this.highlightedMines = mines;
        this.render();
        if (this.highlightTimer) clearTimeout(this.highlightTimer);
        this.highlightTimer = setTimeout(() => {
            this.highlightedMines = [];
            this.render();
        }, duration);
    }

    reset() {
        this.grid = this.createEmptyGrid();
        this.mines = [];
        this.highlightedMines = [];
        if (this.highlightTimer) clearTimeout(this.highlightTimer);
        this.render();
    }

    revealCells(cells) {
        cells.forEach(cell => {
            if (this.grid[cell.y] && this.grid[cell.y][cell.x]) {
                this.grid[cell.y][cell.x].isRevealed = true;
                this.grid[cell.y][cell.x].neighborCount = cell.neighborCount;
                this.grid[cell.y][cell.x].isMine = cell.isMine || false;
            }
        });
        this.render();
    }

    getUnrevealedCount() {
        let count = 0;
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (!this.grid[y][x].isRevealed && !this.grid[y][x].isMine) count++;
            }
        }
        return count;
    }

    render() {
        const ctx = this.ctx;
        const size = this.canvas.width;
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, size, size);

        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.grid[y][x];
                const px = x * this.cellSize;
                const py = y * this.cellSize;
                const padding = 2;
                const isHighlighted = this.highlightedMines.some(m => m.x === x && m.y === y);

                if (cell.isRevealed) {
                    ctx.fillStyle = cell.isMine ? '#e74c3c' : '#1a2634';
                } else if (isHighlighted) {
                    ctx.fillStyle = '#f39c12';
                } else {
                    const gradient = ctx.createLinearGradient(px, py, px + this.cellSize, py + this.cellSize);
                    gradient.addColorStop(0, '#4a6fa5');
                    gradient.addColorStop(1, '#2d4a6f');
                    ctx.fillStyle = gradient;
                }

                this.roundRect(ctx, px + padding, py + padding, this.cellSize - padding * 2, this.cellSize - padding * 2, 4);
                ctx.fill();

                if (cell.isRevealed) {
                    if (cell.isMine) {
                        ctx.font = `${this.cellSize * 0.6}px Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('💣', px + this.cellSize / 2, py + this.cellSize / 2);
                    } else if (cell.neighborCount > 0) {
                        ctx.fillStyle = CONFIG.COLORS[cell.neighborCount] || '#fff';
                        ctx.font = `bold ${this.cellSize * 0.6}px Rajdhani`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(cell.neighborCount.toString(), px + this.cellSize / 2, py + this.cellSize / 2);
                    }
                } else if (cell.isFlagged) {
                    ctx.font = `${this.cellSize * 0.5}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🚩', px + this.cellSize / 2, py + this.cellSize / 2);
                }

                ctx.strokeStyle = cell.isRevealed ? '#0d1520' : '#5a8ac7';
                ctx.lineWidth = 1;
                this.roundRect(ctx, px + padding, py + padding, this.cellSize - padding * 2, this.cellSize - padding * 2, 4);
                ctx.stroke();
            }
        }
    }

    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}

// ==================== GAME CLIENT ====================
class GameClient {
    constructor() {
        this.user = null;
        this.profile = null;
        this.gameId = null;
        this.gameChannel = null;
        this.matchmakingChannel = null;
        this.opponentId = null;
        this.opponentName = '';
        this.selectedDifficulty = 'medium';
        this.isHost = false;
        
        this.playerBoard = null;
        this.opponentBoard = null;
        this.audio = new AudioManager();
        
        this.score = 0;
        this.opponentScore = 0;
        this.hasShield = false;
        this.isFrozen = false;
        this.frozenUntil = 0;
        
        this.matchStartTime = 0;
        this.matchDuration = CONFIG.MATCH_DURATION;
        this.timerInterval = null;
        this.searchInterval = null;
        this.minesGenerated = false;
        
        this.init();
    }

    async init() {
        this.setupDOM();
        this.setupEventListeners();
        await this.checkAuth();
        this.hideConnectionError();
    }

    async checkAuth() {
        try {
            const user = await SupabaseClient.getCurrentUser();
            if (user) {
                this.user = user;
                this.profile = await SupabaseClient.getProfile(user.id);
                this.updateAuthUI();
            }
        } catch (e) {
            console.log('Not logged in');
        }
    }

    setupDOM() {
        // Screens
        this.menuScreen = document.getElementById('menu-screen');
        this.matchmakingScreen = document.getElementById('matchmaking-screen');
        this.gameScreen = document.getElementById('game-screen');
        
        // Menu elements
        this.playerNameInput = document.getElementById('player-name');
        this.findGameBtn = document.getElementById('find-game-btn');
        this.cancelSearchBtn = document.getElementById('cancel-search-btn');
        this.searchTimeDisplay = document.getElementById('search-time');
        this.difficultyButtons = document.querySelectorAll('.difficulty-btn');
        this.selectedDifficultyDisplay = document.getElementById('selected-difficulty');
        
        // Game elements
        this.gameTimerDisplay = document.getElementById('game-timer');
        this.playerScoreDisplay = document.getElementById('player-score');
        this.opponentScoreDisplay = document.getElementById('opponent-score');
        this.currentPointsDisplay = document.getElementById('current-points');
        this.playerNameDisplay = document.getElementById('player-name-display');
        this.opponentNameDisplay = document.getElementById('opponent-name');
        this.shieldIndicator = document.getElementById('shield-indicator');
        this.playerFrozenOverlay = document.getElementById('player-frozen');
        this.frozenTimerDisplay = document.getElementById('frozen-timer');
        this.opponentCompletion = document.getElementById('opponent-completion');
        
        // Modal elements
        this.gameOverModal = document.getElementById('game-over-modal');
        this.resultIcon = document.getElementById('result-icon');
        this.resultTitle = document.getElementById('result-title');
        this.resultPlayerName = document.getElementById('result-player-name');
        this.resultPlayerScore = document.getElementById('result-player-score');
        this.resultOpponentName = document.getElementById('result-opponent-name');
        this.resultOpponentScore = document.getElementById('result-opponent-score');
        this.playAgainBtn = document.getElementById('play-again-btn');
        this.mainMenuBtn = document.getElementById('main-menu-btn');
        this.audioBtn = document.getElementById('audio-btn');
        this.powerButtons = document.querySelectorAll('.power-btn');
        
        // Initialize boards
        const playerCanvas = document.getElementById('player-canvas');
        const opponentCanvas = document.getElementById('opponent-canvas');
        if (playerCanvas && opponentCanvas) {
            this.playerBoard = new BoardRenderer(playerCanvas, false);
            this.opponentBoard = new BoardRenderer(opponentCanvas, true);
        }
        
        // Random name if empty
        if (this.playerNameInput && !this.playerNameInput.value) {
            this.playerNameInput.value = 'Player' + Math.floor(Math.random() * 9999);
        }
    }

    setupEventListeners() {
        this.findGameBtn?.addEventListener('click', () => this.findGame());
        this.cancelSearchBtn?.addEventListener('click', () => this.cancelSearch());
        
        this.difficultyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.difficultyButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedDifficulty = btn.dataset.difficulty;
            });
        });
        
        document.getElementById('player-canvas')?.addEventListener('click', (e) => this.handleCellClick(e));
        document.getElementById('player-canvas')?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleRightClick(e);
        });
        
        this.powerButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const power = btn.dataset.power;
                const cost = parseInt(btn.dataset.cost);
                this.usePower(power, cost);
            });
        });
        
        this.audioBtn?.addEventListener('click', () => {
            const enabled = this.audio.toggle();
            this.audioBtn.textContent = enabled ? '🔊' : '🔇';
        });
        
        this.playAgainBtn?.addEventListener('click', () => {
            this.hideModal();
            this.showScreen('menu');
        });
        
        this.mainMenuBtn?.addEventListener('click', () => {
            this.hideModal();
            this.showScreen('menu');
        });
    }

    hideConnectionError() {
        // Remove any error notification
        const notification = document.querySelector('.notification.error');
        if (notification) notification.remove();
        // Show connection success on site load
        this.showNotification('Sunucuya bağlanıldı', 'success');
    }

    updateAuthUI() {
        const userSection = document.getElementById('user-section');
        if (!userSection) return;
        
        if (this.user && this.profile) {
            userSection.innerHTML = `
                <div class="user-info">
                    <span class="user-avatar">👤</span>
                    <span class="user-name">${this.profile.username}</span>
                </div>
            `;
            if (this.playerNameInput) {
                this.playerNameInput.value = this.profile.username;
            }
        }
    }

    async findGame() {
        const playerName = this.playerNameInput?.value || 'Player' + Math.floor(Math.random() * 9999);
        const difficulty = this.selectedDifficulty;
        
        // Create a temporary user ID if not logged in
        const odaUserId = this.user?.id || 'guest_' + Math.random().toString(36).substr(2, 9);
        
        this.showScreen('matchmaking');
        this.startSearchTimer();
        
        if (this.selectedDifficultyDisplay) {
            this.selectedDifficultyDisplay.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
        }
        
        try {
            // Try to find existing player waiting
            const opponent = await SupabaseClient.findMatch(difficulty, odaUserId);
            
            if (opponent) {
                // Found opponent! Start game
                this.isHost = false;
                this.opponentId = opponent.user_id;
                this.opponentName = opponent.username;
                
                // Create game
                const game = await SupabaseClient.createGame(opponent.user_id, odaUserId, difficulty);
                this.gameId = game.id;
                
                // Update queue status
                await SupabaseClient.updateMatchStatus(null, opponent.user_id, 'matched', game.id);
                
                // Start the game
                this.startGame({
                    gameId: game.id,
                    opponent: opponent.username,
                    difficulty: difficulty,
                    gridSize: CONFIG.DIFFICULTIES[difficulty].gridSize,
                    mineCount: CONFIG.DIFFICULTIES[difficulty].mineCount
                });
            } else {
                // No opponent found, join queue and start polling
                this.odaUserId = odaUserId;
                this.pendingPlayerName = playerName;
                await SupabaseClient.joinMatchmaking(odaUserId, playerName, difficulty);
                
                // Start polling for matches (more reliable than realtime for matchmaking)
                this.startMatchPolling(odaUserId, difficulty);
            }
        } catch (error) {
            console.error('Matchmaking error:', error);
            // Silent retry - keep waiting for players
        }
    }

    startMatchPolling(odaUserId, difficulty) {
        // Poll every 2 seconds for match status or new opponents
        this.matchPollingInterval = setInterval(async () => {
            try {
                // Check if we got matched
                const myStatus = await SupabaseClient.getMyQueueStatus(odaUserId);
                
                if (myStatus && myStatus.status === 'matched' && myStatus.match_id) {
                    // We got matched!
                    this.stopMatchPolling();
                    this.gameId = myStatus.match_id;
                    this.isHost = false;
                    
                    // Get opponent info
                    const opponentInfo = await SupabaseClient.getOpponentFromQueue(myStatus.match_id, odaUserId);
                    const opponentName = opponentInfo?.username || 'Rakip';
                    
                    this.startGame({
                        gameId: myStatus.match_id,
                        opponent: opponentName,
                        difficulty: difficulty,
                        gridSize: CONFIG.DIFFICULTIES[difficulty].gridSize,
                        mineCount: CONFIG.DIFFICULTIES[difficulty].mineCount
                    });
                    return;
                }
                
                // Check for waiting opponents
                const opponent = await SupabaseClient.findMatch(difficulty, odaUserId);
                
                if (opponent) {
                    // Found opponent! We become the host
                    this.stopMatchPolling();
                    this.isHost = true;
                    this.opponentId = opponent.user_id;
                    this.opponentName = opponent.username;
                    
                    // Create game
                    const game = await SupabaseClient.createGame(odaUserId, opponent.user_id, difficulty);
                    this.gameId = game.id;
                    
                    // Update both players' queue status
                    await SupabaseClient.updateMatchStatus(null, odaUserId, 'matched', game.id);
                    await SupabaseClient.updateMatchStatus(null, opponent.user_id, 'matched', game.id);
                    
                    // Start the game
                    this.startGame({
                        gameId: game.id,
                        opponent: opponent.username,
                        difficulty: difficulty,
                        gridSize: CONFIG.DIFFICULTIES[difficulty].gridSize,
                        mineCount: CONFIG.DIFFICULTIES[difficulty].mineCount
                    });
                }
            } catch (e) {
                console.error('Poll error:', e);
            }
        }, 2000);
    }

    stopMatchPolling() {
        if (this.matchPollingInterval) {
            clearInterval(this.matchPollingInterval);
            this.matchPollingInterval = null;
        }
    }

    async handleMatchmakingUpdate(payload, odaUserId, playerName) {
        // Deprecated - using polling instead
        console.log('Matchmaking update (deprecated):', payload);
    }

    startOfflineGame(difficulty) {
        // Disabled - waiting for real players only
        console.log('Bot mode disabled, waiting for real players...');
    }

    async cancelSearch() {
        this.stopMatchPolling();
        
        if (this.matchmakingChannel) {
            SupabaseClient.unsubscribe(this.matchmakingChannel);
            this.matchmakingChannel = null;
        }
        
        const userId = this.odaUserId || this.user?.id || 'guest';
        try {
            await SupabaseClient.leaveMatchmaking(userId);
        } catch (e) {}
        
        this.stopSearchTimer();
        this.showScreen('menu');
    }

    startSearchTimer() {
        this.searchStartTime = Date.now();
        this.searchInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.searchStartTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            if (this.searchTimeDisplay) {
                this.searchTimeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopSearchTimer() {
        if (this.searchInterval) {
            clearInterval(this.searchInterval);
            this.searchInterval = null;
        }
    }

    startGame(config) {
        this.gameId = config.gameId;
        this.opponentName = config.opponent;
        this.matchDuration = CONFIG.MATCH_DURATION;
        this.matchStartTime = Date.now();
        this.minesGenerated = false;
        
        const gridSize = config.gridSize || 10;
        const mineCount = config.mineCount || 20;
        
        // Reset state
        this.score = 0;
        this.opponentScore = 0;
        this.hasShield = false;
        this.isFrozen = false;
        
        // Setup boards
        this.playerBoard?.setGridSize(gridSize);
        this.opponentBoard?.setGridSize(gridSize);
        
        // Store mine count for later generation
        this.pendingMineCount = mineCount;
        
        // Update UI
        const playerName = this.playerNameInput?.value || 'Player';
        if (this.playerNameDisplay) this.playerNameDisplay.textContent = playerName;
        if (this.opponentNameDisplay) this.opponentNameDisplay.textContent = this.opponentName;
        this.updateScore();
        this.updatePowerButtons();
        this.shieldIndicator?.classList.add('hidden');
        this.playerFrozenOverlay?.classList.add('hidden');
        
        this.stopSearchTimer();
        this.showScreen('game');
        this.hideModal();
        this.startGameTimer();
        
        // Subscribe to game channel for real-time sync
        if (!config.isOffline) {
            this.setupGameChannel();
        }
        
        this.showNotification(`Game started vs ${this.opponentName}!`, 'success');
        this.audio.playPower();
    }

    setupGameChannel() {
        if (this.gameChannel) {
            SupabaseClient.unsubscribe(this.gameChannel);
        }
        
        this.gameChannel = SupabaseClient.createGameChannel(this.gameId);
        
        this.gameChannel
            .on('broadcast', { event: 'move' }, (payload) => {
                this.handleOpponentMove(payload.payload);
            })
            .on('broadcast', { event: 'power' }, (payload) => {
                this.handleOpponentPower(payload.payload);
            })
            .on('broadcast', { event: 'gameEnd' }, (payload) => {
                this.handleGameEnd(payload.payload);
            })
            .subscribe();
    }

    startGameTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.matchStartTime;
            const remaining = Math.max(0, this.matchDuration - elapsed);
            
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            
            if (this.gameTimerDisplay) {
                this.gameTimerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            
            if (remaining <= 0) {
                clearInterval(this.timerInterval);
                this.endGame();
            }
        }, 100);
    }

    handleCellClick(e) {
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.showNotification('You are frozen!', 'error');
            return;
        }
        
        const cell = this.playerBoard?.getCellFromClick(e);
        if (!cell) return;
        if (this.playerBoard.grid[cell.y][cell.x].isRevealed) return;
        if (this.playerBoard.grid[cell.y][cell.x].isFlagged) return;
        
        // Generate mines on first click
        if (!this.minesGenerated) {
            this.playerBoard.generateMines(this.pendingMineCount, cell.x, cell.y);
            this.minesGenerated = true;
        }
        
        this.audio.playClick();
        
        const revealed = this.playerBoard.revealCell(cell.x, cell.y);
        this.playerBoard.render();
        
        // Calculate score
        let points = 0;
        let hitMine = false;
        
        revealed.forEach(c => {
            if (c.isMine) {
                hitMine = true;
                if (this.hasShield) {
                    this.hasShield = false;
                    this.shieldIndicator?.classList.add('hidden');
                    this.showNotification('Shield absorbed damage!', 'success');
                } else {
                    points -= 25;
                }
            } else {
                // Empty cells give 5 points, numbered cells give their number
                points += c.neighborCount > 0 ? c.neighborCount : 5;
            }
        });
        
        this.score = Math.max(0, this.score + points);
        this.updateScore();
        this.updatePowerButtons();
        
        if (hitMine && !this.hasShield) {
            this.audio.playMine();
            this.showNotification(`💣 Mine hit! -25 points`, 'error');
        } else if (points > 0) {
            this.audio.playReveal(revealed.length);
            // Score updates in UI, no notification needed
        }
        
        // Broadcast move
        this.broadcastMove({ x: cell.x, y: cell.y, revealed, score: this.score });
        
        // Check win condition
        if (this.playerBoard.getUnrevealedCount() === 0) {
            this.endGame(true);
        }
    }

    handleRightClick(e) {
        if (this.isFrozen && Date.now() < this.frozenUntil) return;
        const cell = this.playerBoard?.getCellFromClick(e);
        if (!cell) return;
        if (this.playerBoard.grid[cell.y][cell.x].isRevealed) return;
        
        const cellData = this.playerBoard.grid[cell.y][cell.x];
        cellData.isFlagged = !cellData.isFlagged;
        this.playerBoard.render();
        this.audio.playClick();
    }

    handleOpponentMove(data) {
        this.opponentScore = data.score;
        this.updateScore();
        
        if (data.revealed && this.opponentBoard) {
            this.opponentBoard.revealCells(data.revealed);
        }
        
        // Update completion bar
        const totalCells = this.opponentBoard.gridSize * this.opponentBoard.gridSize;
        const revealedCount = data.revealed?.length || 0;
        if (this.opponentCompletion) {
            const currentWidth = parseFloat(this.opponentCompletion.style.width) || 0;
            this.opponentCompletion.style.width = `${Math.min(100, currentWidth + (revealedCount / totalCells * 100))}%`;
        }
    }

    handleOpponentPower(data) {
        if (data.power === 'freeze') {
            this.handleFrozen(data.duration || 3000);
        }
    }

    broadcastMove(data) {
        if (this.gameChannel) {
            this.gameChannel.send({
                type: 'broadcast',
                event: 'move',
                payload: data
            });
        }
    }

    broadcastPower(power, data) {
        if (this.gameChannel) {
            this.gameChannel.send({
                type: 'broadcast',
                event: 'power',
                payload: { power, ...data }
            });
        }
    }

    usePower(power, cost) {
        if (this.score < cost) {
            this.showNotification(`Need ${cost} points!`, 'error');
            return;
        }
        
        this.score -= cost;
        this.updateScore();
        this.updatePowerButtons();
        this.audio.playPower();
        
        switch (power) {
            case 'radar':
                const nearbyMines = this.playerBoard.mines.slice(0, 3);
                this.playerBoard.highlightMines(nearbyMines);
                this.showNotification('📡 Radar: Mines detected!', 'info');
                break;
                
            case 'safeburst':
                // Reveal some safe cells
                const safeCells = [];
                for (let y = 0; y < this.playerBoard.gridSize && safeCells.length < 5; y++) {
                    for (let x = 0; x < this.playerBoard.gridSize && safeCells.length < 5; x++) {
                        const cell = this.playerBoard.grid[y][x];
                        if (!cell.isRevealed && !cell.isMine) {
                            safeCells.push({ x, y });
                        }
                    }
                }
                let burstPoints = 0;
                safeCells.forEach(c => {
                    const revealed = this.playerBoard.revealCell(c.x, c.y);
                    revealed.forEach(r => {
                        if (!r.isMine) burstPoints += r.neighborCount > 0 ? r.neighborCount : 1;
                    });
                });
                this.playerBoard.render();
                this.score += burstPoints;
                this.updateScore();
                this.showNotification(`💥 Safe Burst: +${burstPoints} points!`, 'success');
                break;
                
            case 'shield':
                this.hasShield = true;
                this.shieldIndicator?.classList.remove('hidden');
                this.showNotification('🛡️ Shield activated!', 'success');
                break;
                
            case 'freeze':
                this.broadcastPower('freeze', { duration: 3000 });
                this.showNotification('❄️ Freeze sent!', 'success');
                break;
        }
    }

    handleFrozen(duration) {
        this.isFrozen = true;
        this.frozenUntil = Date.now() + duration;
        this.playerFrozenOverlay?.classList.remove('hidden');
        this.showNotification('You are frozen!', 'error');
        
        const updateTimer = () => {
            const remaining = Math.max(0, this.frozenUntil - Date.now());
            if (this.frozenTimerDisplay) {
                this.frozenTimerDisplay.textContent = `${Math.ceil(remaining / 1000)}s`;
            }
            if (remaining > 0) {
                requestAnimationFrame(updateTimer);
            } else {
                this.isFrozen = false;
                this.playerFrozenOverlay?.classList.add('hidden');
                this.showNotification('Unfrozen!', 'success');
            }
        };
        updateTimer();
    }

    endGame(isWinner = null) {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Determine winner by score if not specified
        if (isWinner === null) {
            isWinner = this.score > this.opponentScore;
        }
        const isDraw = this.score === this.opponentScore;
        
        // Broadcast game end
        if (this.gameChannel) {
            this.gameChannel.send({
                type: 'broadcast',
                event: 'gameEnd',
                payload: { winnerId: isWinner ? 'self' : 'opponent', score: this.score }
            });
        }
        
        this.handleGameEnd({ isWinner, isDraw });
    }

    handleGameEnd(data) {
        const isWinner = data.isWinner !== false && (data.winnerId === 'self' || this.score > this.opponentScore);
        const isDraw = data.isDraw || this.score === this.opponentScore;
        
        if (isDraw) {
            this.resultIcon.textContent = '🤝';
            this.resultTitle.textContent = 'Draw!';
            this.resultTitle.className = 'result-title draw';
        } else if (isWinner) {
            this.resultIcon.textContent = '🏆';
            this.resultTitle.textContent = 'Victory!';
            this.resultTitle.className = 'result-title victory';
            this.audio.playVictory();
        } else {
            this.resultIcon.textContent = '💔';
            this.resultTitle.textContent = 'Defeat';
            this.resultTitle.className = 'result-title defeat';
            this.audio.playDefeat();
        }
        
        const playerName = this.playerNameInput?.value || 'Player';
        this.resultPlayerName.textContent = playerName;
        this.resultPlayerScore.textContent = this.score;
        this.resultOpponentName.textContent = this.opponentName;
        this.resultOpponentScore.textContent = this.opponentScore;
        
        this.gameOverModal?.classList.remove('hidden');
        
        // Cleanup
        if (this.gameChannel) {
            SupabaseClient.unsubscribe(this.gameChannel);
            this.gameChannel = null;
        }
    }

    updateScore() {
        if (this.playerScoreDisplay) this.playerScoreDisplay.textContent = this.score;
        if (this.opponentScoreDisplay) this.opponentScoreDisplay.textContent = this.opponentScore;
        if (this.currentPointsDisplay) this.currentPointsDisplay.textContent = this.score;
    }

    updatePowerButtons() {
        this.powerButtons.forEach(btn => {
            const cost = parseInt(btn.dataset.cost);
            btn.disabled = this.score < cost;
        });
    }

    showScreen(name) {
        this.menuScreen?.classList.remove('active');
        this.matchmakingScreen?.classList.remove('active');
        this.gameScreen?.classList.remove('active');
        
        switch (name) {
            case 'menu': this.menuScreen?.classList.add('active'); break;
            case 'matchmaking': this.matchmakingScreen?.classList.add('active'); break;
            case 'game': this.gameScreen?.classList.add('active'); break;
        }
    }

    hideModal() {
        this.gameOverModal?.classList.add('hidden');
    }

    showNotification(text, type = 'info') {
        const container = document.getElementById('notifications');
        if (!container) return;
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = text;
        container.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

// ==================== AUTH MANAGER ====================
class AuthManager {
    constructor(gameClient) {
        this.game = gameClient;
        this.modal = document.getElementById('auth-modal');
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.setupEventListeners();
        
        // Listen for auth state changes
        SupabaseClient.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                this.handleSignIn(session.user);
            }
        });
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                if (tab.dataset.tab === 'login') {
                    this.loginForm?.classList.remove('hidden');
                    this.registerForm?.classList.add('hidden');
                } else {
                    this.loginForm?.classList.add('hidden');
                    this.registerForm?.classList.remove('hidden');
                }
            });
        });

        // Login form
        this.loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            
            try {
                await SupabaseClient.signIn(email, password);
                this.hideModal();
                this.game.showNotification('Giriş başarılı!', 'success');
            } catch (error) {
                this.game.showNotification(error.message, 'error');
            }
        });

        // Register form
        this.registerForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('register-username').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            
            try {
                await SupabaseClient.signUp(email, password, username);
                this.hideModal();
                this.game.showNotification('Kayıt başarılı! E-postanı onayla.', 'success');
            } catch (error) {
                this.game.showNotification(error.message, 'error');
            }
        });
    }

    async signInWithGoogle() {
        try {
            await SupabaseClient.signInWithGoogle();
        } catch (error) {
            this.game.showNotification('Google girişi başarısız', 'error');
        }
    }

    async handleSignIn(user) {
        this.game.user = user;
        try {
            this.game.profile = await SupabaseClient.getProfile(user.id);
        } catch (e) {
            // Create profile if not exists
            this.game.profile = { username: user.email?.split('@')[0] || 'Player' };
        }
        this.game.updateAuthUI();
        this.hideModal();
    }

    showModal() {
        this.modal?.classList.remove('hidden');
    }

    hideModal() {
        this.modal?.classList.add('hidden');
    }
}

// ==================== LEADERBOARD MANAGER ====================
class LeaderboardManager {
    constructor(gameClient) {
        this.game = gameClient;
        this.modal = document.getElementById('leaderboard-modal');
        this.list = document.getElementById('leaderboard-list');
        this.currentType = 'rating';
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.querySelectorAll('.lb-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentType = tab.dataset.type;
                this.loadLeaderboard();
            });
        });
    }

    async loadLeaderboard() {
        if (!this.list) return;
        this.list.innerHTML = '<div class="leaderboard-loading">Yükleniyor...</div>';
        
        try {
            const data = await SupabaseClient.getLeaderboard(this.currentType);
            
            if (data.length === 0) {
                this.list.innerHTML = '<div class="lb-empty">Henüz oyuncu yok</div>';
                return;
            }
            
            this.list.innerHTML = data.map((player, index) => {
                const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                const score = this.currentType === 'rating' ? player.rating : player.wins;
                return `
                    <div class="lb-item">
                        <span class="lb-rank ${rankClass}">#${index + 1}</span>
                        <span class="lb-name">${player.username || 'Unknown'}</span>
                        <span class="lb-score">${score}</span>
                    </div>
                `;
            }).join('');
        } catch (error) {
            this.list.innerHTML = '<div class="lb-empty">Yüklenemedi</div>';
        }
    }

    showModal() {
        this.modal?.classList.remove('hidden');
        this.loadLeaderboard();
    }

    hideModal() {
        this.modal?.classList.add('hidden');
    }
}

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 MineDuel - Supabase Realtime Edition');
    window.game = new GameClient();
    window.authManager = new AuthManager(window.game);
    window.leaderboardManager = new LeaderboardManager(window.game);
});
