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
    MATCH_DURATION: 150000,
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
        
        // High DPI/Retina display support for better quality
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        
        this.cellSize = cellSize;
        this.dpr = dpr;
        this.render();
    }

    getCellFromClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        // Calculate based on CSS size and cell size (DPR-independent)
        const x = Math.floor((e.clientX - rect.left) / rect.width * this.gridSize);
        const y = Math.floor((e.clientY - rect.top) / rect.height * this.gridSize);
        if (x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize) return { x, y };
        return null;
    }

    generateMines(mineCount, excludeX = -1, excludeY = -1) {
        this.mines = [];
        const positions = [];
        
        // Exclude a 3x3 area around first click (guaranteed safe start)
        const excludeRadius = 1; // 3x3 area
        
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

    setMinesFromPositions(positions) {
        if (!positions || !Array.isArray(positions)) {
            console.error('[BoardRenderer] Invalid mine positions');
            return;
        }
        
        this.mines = positions;
        
        // Clear existing mines and set new ones
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                this.grid[y][x].isMine = false;
            }
        }
        
        positions.forEach(pos => {
            if (pos.x >= 0 && pos.x < this.gridSize && pos.y >= 0 && pos.y < this.gridSize) {
                this.grid[pos.y][pos.x].isMine = true;
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
        
        console.log(`[BoardRenderer] Set ${positions.length} mines from positions`);
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
        const dpr = this.dpr || 1;
        
        // Reset transform and apply DPR scale for each render
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        // Use logical size (CSS pixels), not canvas.width which is scaled by DPR
        const size = this.gridSize * this.cellSize;
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
                    // Draw flag using canvas shapes instead of emoji
                    const cx = px + this.cellSize / 2;
                    const cy = py + this.cellSize / 2;
                    const flagSize = this.cellSize * 0.35;
                    
                    // Flag pole
                    ctx.strokeStyle = '#8B4513';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(cx - flagSize * 0.3, cy - flagSize);
                    ctx.lineTo(cx - flagSize * 0.3, cy + flagSize);
                    ctx.stroke();
                    
                    // Red flag triangle
                    ctx.fillStyle = '#e74c3c';
                    ctx.beginPath();
                    ctx.moveTo(cx - flagSize * 0.3, cy - flagSize);
                    ctx.lineTo(cx + flagSize * 0.7, cy - flagSize * 0.4);
                    ctx.lineTo(cx - flagSize * 0.3, cy + flagSize * 0.2);
                    ctx.closePath();
                    ctx.fill();
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
        
        // Mobile/Touch support - detect touch capability, not screen size
        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this.selectedCell = null;
        this.mobileActionMenu = null;
        
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
        
        // Save name when changed (for logged-in users)
        this.playerNameInput?.addEventListener('blur', () => this.savePlayerName());
        this.playerNameInput?.addEventListener('change', () => this.savePlayerName());
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
        
        // Load saved name first (for guests)
        this.loadSavedPlayerName();
        
        // Random name if still empty
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
        
        const playerCanvas = document.getElementById('player-canvas');
        
        // Touch devices: Show action menu on tap
        if (this.isTouchDevice) {
            playerCanvas?.addEventListener('click', (e) => this.handleMobileTap(e));
            
            // Mobile action menu buttons
            this.mobileActionMenu = document.getElementById('mobile-action-menu');
            document.getElementById('mobile-dig-btn')?.addEventListener('click', () => this.mobileDigAction());
            document.getElementById('mobile-flag-btn')?.addEventListener('click', () => this.mobileFlagAction());
            document.getElementById('mobile-cancel-btn')?.addEventListener('click', () => this.hideMobileMenu());
        } else {
            // Desktop: Normal click handling
            playerCanvas?.addEventListener('click', (e) => this.handleCellClick(e));
        }
        
        // Right click for desktop (flag)
        playerCanvas?.addEventListener('contextmenu', (e) => {
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
        const playerNameInputWrapper = document.querySelector('.player-name-input');
        
        if (!userSection) return;
        
        if (this.user && this.profile) {
            // Logged in - show profile button
            userSection.innerHTML = `
                <div class="user-info" onclick="profileManager.showModal()" style="cursor:pointer;">
                    <span class="user-avatar">👤</span>
                    <span class="user-name">${this.profile.username}</span>
                </div>
            `;
            
            // Set name in input but keep it editable
            if (this.playerNameInput) {
                this.playerNameInput.value = this.profile.username;
            }
        } else {
            // Guest - show login button
            userSection.innerHTML = `
                <button class="btn-primary" onclick="authManager.showModal()">Giriş Yap</button>
            `;
        }
    }
    
    async savePlayerName() {
        const newName = this.playerNameInput?.value?.trim();
        if (!newName || newName.length < 2) return;
        
        // Save to localStorage for everyone
        localStorage.setItem('mineduel_player_name', newName);
        
        // Also save to database for logged-in users
        if (this.user && this.profile) {
            try {
                // Try to update existing profile
                await SupabaseClient.updateProfile(this.user.id, { username: newName });
                this.profile.username = newName;
            } catch (e) {
                // Profile might not exist yet, try to create it
                try {
                    await SupabaseClient.createProfile(this.user.id, this.user.email, newName);
                    this.profile.username = newName;
                    this.profile.isNew = false;
                } catch (createError) {
                    console.error('Failed to save name:', createError);
                }
            }
        }
    }
    
    loadSavedPlayerName() {
        // Load from localStorage
        const savedName = localStorage.getItem('mineduel_player_name');
        if (savedName && this.playerNameInput) {
            this.playerNameInput.value = savedName;
        }
    }

    async findGame() {
        const playerName = this.playerNameInput?.value || 'Player' + Math.floor(Math.random() * 9999);
        const difficulty = this.selectedDifficulty;
        
        // Save player name for later use
        this.pendingPlayerName = playerName;
        
        // Create a temporary user ID if not logged in
        const odaUserId = this.user?.id || 'guest_' + Math.random().toString(36).substr(2, 9);
        this.odaUserId = odaUserId;
        
        console.log('[MATCHMAKING] Starting search...', { odaUserId, playerName, difficulty });
        
        this.showScreen('matchmaking');
        this.startSearchTimer();
        
        if (this.selectedDifficultyDisplay) {
            this.selectedDifficultyDisplay.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
        }
        
        try {
            // Try to find existing player waiting
            console.log('[MATCHMAKING] Looking for opponent...');
            const opponent = await SupabaseClient.findMatch(difficulty, odaUserId);
            console.log('[MATCHMAKING] findMatch result:', opponent);
            
            if (opponent) {
                // Found opponent! Start game as host
                console.log('[MATCHMAKING] Found opponent!', opponent);
                this.isHost = true;
                this.opponentId = opponent.user_id;
                this.opponentName = opponent.username;
                
                // Create game with player names and security seed
                const game = await SupabaseClient.createGame(odaUserId, opponent.user_id, difficulty, playerName, opponent.username);
                console.log('[MATCHMAKING] Secure game created:', game.id);
                this.gameId = game.id;
                
                // Update both players' queue status
                await SupabaseClient.updateMatchStatus(null, odaUserId, 'matched', game.id);
                await SupabaseClient.updateMatchStatus(null, opponent.user_id, 'matched', game.id);
                
                // Start the game with mine seed for secure generation
                this.startGame({
                    gameId: game.id,
                    opponent: opponent.username,
                    difficulty: difficulty,
                    gridSize: game.gridSize || CONFIG.DIFFICULTIES[difficulty].gridSize,
                    mineCount: game.mineCount || CONFIG.DIFFICULTIES[difficulty].mineCount,
                    myName: playerName,
                    mineSeed: game.mineSeed,
                    isPlayer1: true
                });
            } else {
                // No opponent found, join queue and start polling
                console.log('[MATCHMAKING] No opponent, joining queue...');
                const queueResult = await SupabaseClient.joinMatchmaking(odaUserId, playerName, difficulty);
                console.log('[MATCHMAKING] Joined queue:', queueResult);
                
                // Start polling for matches (fast: every 500ms)
                this.startMatchPolling(odaUserId, difficulty);
                
                // Also do an immediate second check after joining (in case someone just joined)
                setTimeout(async () => {
                    const quickCheck = await SupabaseClient.findMatch(difficulty, odaUserId);
                    console.log('[MATCHMAKING] Quick check result:', quickCheck);
                    if (quickCheck && !this.gameId) {
                        // Found someone! Stop polling and start game
                        this.stopMatchPolling();
                        this.isHost = true;
                        this.opponentId = quickCheck.user_id;
                        this.opponentName = quickCheck.username;
                        
                        const game = await SupabaseClient.createGame(odaUserId, quickCheck.user_id, difficulty, playerName, quickCheck.username);
                        this.gameId = game.id;
                        
                        await SupabaseClient.updateMatchStatus(null, odaUserId, 'matched', game.id);
                        await SupabaseClient.updateMatchStatus(null, quickCheck.user_id, 'matched', game.id);
                        
                        this.startGame({
                            gameId: game.id,
                            opponent: quickCheck.username,
                            difficulty: difficulty,
                            gridSize: game.gridSize || CONFIG.DIFFICULTIES[difficulty].gridSize,
                            mineCount: game.mineCount || CONFIG.DIFFICULTIES[difficulty].mineCount,
                            myName: playerName,
                            mineSeed: game.mineSeed,
                            isPlayer1: true
                        });
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Matchmaking error:', error);
            // Silent retry - keep waiting for players
        }
    }

    startMatchPolling(odaUserId, difficulty) {
        const playerName = this.pendingPlayerName || this.playerNameInput?.value || 'Player';
        
        // Poll every 500ms for faster matching
        this.matchPollingInterval = setInterval(async () => {
            try {
                // Check if we got matched
                const myStatus = await SupabaseClient.getMyQueueStatus(odaUserId);
                
                if (myStatus && myStatus.status === 'matched' && myStatus.match_id) {
                    // We got matched!
                    this.stopMatchPolling();
                    this.gameId = myStatus.match_id;
                    this.isHost = false;
                    
                    // Get game info including mine seed
                    const gameInfo = await SupabaseClient.getGameInfo(myStatus.match_id);
                    
                    // Determine if we're player1 or player2
                    const isPlayer1 = gameInfo?.player1_id === odaUserId;
                    
                    // Get opponent name from game info
                    let opponentName = isPlayer1 ? gameInfo?.player2_name : gameInfo?.player1_name;
                    
                    // Fallback: Try to get from queue
                    if (!opponentName) {
                        const opponentInfo = await SupabaseClient.getOpponentFromQueue(myStatus.match_id, odaUserId);
                        if (opponentInfo?.username) {
                            opponentName = opponentInfo.username;
                        }
                    }
                    
                    // Start game with server-provided mine seed
                    this.startGame({
                        gameId: myStatus.match_id,
                        opponent: opponentName || '...',
                        difficulty: difficulty,
                        gridSize: gameInfo?.grid_size || CONFIG.DIFFICULTIES[difficulty].gridSize,
                        mineCount: gameInfo?.mine_count || CONFIG.DIFFICULTIES[difficulty].mineCount,
                        myName: playerName,
                        mineSeed: gameInfo?.mine_seed,
                        isPlayer1: isPlayer1,
                        waitingForOpponentName: !opponentName
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
                    
                    // Create game with player names and security
                    const game = await SupabaseClient.createGame(odaUserId, opponent.user_id, difficulty, playerName, opponent.username);
                    this.gameId = game.id;
                    
                    // Update both players' queue status
                    await SupabaseClient.updateMatchStatus(null, odaUserId, 'matched', game.id);
                    await SupabaseClient.updateMatchStatus(null, opponent.user_id, 'matched', game.id);
                    
                    // Start the game with mine seed
                    this.startGame({
                        gameId: game.id,
                        opponent: opponent.username,
                        difficulty: difficulty,
                        gridSize: game.gridSize || CONFIG.DIFFICULTIES[difficulty].gridSize,
                        mineCount: game.mineCount || CONFIG.DIFFICULTIES[difficulty].mineCount,
                        myName: playerName,
                        mineSeed: game.mineSeed,
                        isPlayer1: true
                    });
                }
            } catch (e) {
                console.error('Poll error:', e);
            }
        }, 500);
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
        this.myName = config.myName || this.playerNameInput?.value || 'Player';
        this.matchDuration = CONFIG.MATCH_DURATION;
        this.matchStartTime = Date.now();
        this.minesGenerated = false;
        
        const gridSize = config.gridSize || 10;
        const mineCount = config.mineCount || 20;
        
        // Store mine seed for secure generation
        this.mineSeed = config.mineSeed;
        this.isPlayer1 = config.isPlayer1;
        
        console.log('[GAME] Starting game with config:', {
            gridSize,
            mineCount,
            mineSeed: this.mineSeed ? 'present' : 'none',
            isPlayer1: this.isPlayer1
        });
        
        // Reset state
        this.score = 0;
        this.opponentScore = 0;
        this.hasShield = false;
        this.isFrozen = false;
        this.gameEnded = false;
        
        // Track revealed cells to prevent duplicates
        this.revealedCells = new Set();
        
        // Initialize power usage limits (max 3 uses per power per game)
        this.powerUsesLeft = {
            radar: 3,
            safeburst: 3,
            shield: 3,
            freeze: 3
        };
        this.updatePowerButtonsUsage();
        
        // Setup boards
        this.playerBoard?.setGridSize(gridSize);
        this.opponentBoard?.setGridSize(gridSize);
        
        // Store mine count for later generation
        this.pendingMineCount = mineCount;
        this.pendingGridSize = gridSize;
        
        // Update UI - use saved myName for player display
        if (this.playerNameDisplay) this.playerNameDisplay.textContent = this.myName;
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
        
        this.showNotification(`${this.opponentName} ile maç başladı!`, 'success');
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
            .on('broadcast', { event: 'flag' }, (payload) => {
                this.handleOpponentFlag(payload.payload);
            })
            .on('broadcast', { event: 'power' }, (payload) => {
                this.handleOpponentPower(payload.payload);
            })
            .on('broadcast', { event: 'gameEnd' }, (payload) => {
                // Receive opponent's final score and end game immediately
                const data = payload.payload;
                if (data.odaUserId !== this.odaUserId) {
                    if (data.myFinalScore !== undefined) {
                        this.opponentScore = data.myFinalScore;
                        this.updateScore(false); // Don't re-broadcast
                    }
                    
                    // End our game too if not already ended
                    if (!this.gameEnded) {
                        this.gameEnded = true;
                        
                        if (this.timerInterval) {
                            clearInterval(this.timerInterval);
                            this.timerInterval = null;
                        }
                        
                        const navTimer = document.getElementById('nav-timer');
                        if (navTimer) navTimer.classList.add('hidden');
                        
                        // Show result immediately
                        this.showGameResult();
                    }
                }
            })
            .on('broadcast', { event: 'scoreUpdate' }, (payload) => {
                // Real-time score sync
                const data = payload.payload;
                if (data.odaUserId !== this.odaUserId && data.score !== undefined) {
                    this.opponentScore = data.score;
                    this.updateScore(false); // Don't re-broadcast
                }
            })
            .on('broadcast', { event: 'playerInfo' }, (payload) => {
                // Receive opponent's name
                if (payload.payload && payload.payload.playerName) {
                    const senderName = payload.payload.playerName;
                    const senderId = payload.payload.odaUserId;
                    
                    // Only update if this is from opponent (not ourselves)
                    if (senderId !== this.odaUserId) {
                        this.opponentName = senderName;
                        if (this.opponentNameDisplay) {
                            this.opponentNameDisplay.textContent = senderName;
                        }
                        console.log('Received opponent name:', senderName);
                        
                        // Stop requesting if we got a valid name
                        if (this.nameRequestInterval) {
                            clearInterval(this.nameRequestInterval);
                            this.nameRequestInterval = null;
                        }
                    }
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Send our name to opponent multiple times to ensure delivery
                    this.broadcastPlayerInfo();
                    setTimeout(() => this.broadcastPlayerInfo(), 300);
                    setTimeout(() => this.broadcastPlayerInfo(), 800);
                    setTimeout(() => this.broadcastPlayerInfo(), 1500);
                    
                    // If opponent name is still unknown, keep requesting
                    if (!this.opponentName || this.opponentName === '...') {
                        this.nameRequestInterval = setInterval(() => {
                            this.broadcastPlayerInfo();
                            // Stop after getting name or 10 seconds
                            if (this.opponentName && this.opponentName !== '...') {
                                clearInterval(this.nameRequestInterval);
                                this.nameRequestInterval = null;
                            }
                        }, 2000);
                        
                        // Clear after 10 seconds max
                        setTimeout(() => {
                            if (this.nameRequestInterval) {
                                clearInterval(this.nameRequestInterval);
                                this.nameRequestInterval = null;
                            }
                        }, 10000);
                    }
                }
            });
    }
    
    broadcastPlayerInfo() {
        if (!this.gameChannel || !this.gameId) return;
        
        const playerName = this.myName || this.pendingPlayerName || this.playerNameInput?.value || 'Player';
        
        this.gameChannel.send({
            type: 'broadcast',
            event: 'playerInfo',
            payload: {
                playerName: playerName,
                odaUserId: this.odaUserId
            }
        });
        
        console.log('Sent player info:', playerName);
    }

    startGameTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        // Show nav timer
        const navTimer = document.getElementById('nav-timer');
        if (navTimer) navTimer.classList.remove('hidden');
        
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.matchStartTime;
            const remaining = Math.max(0, this.matchDuration - elapsed);
            
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            // Update game screen timer
            if (this.gameTimerDisplay) {
                this.gameTimerDisplay.textContent = timeStr;
            }
            
            // Update nav timer
            if (navTimer) {
                navTimer.textContent = `⏱️ ${timeStr}`;
                // Add danger class when less than 30 seconds
                if (remaining <= 30000) {
                    navTimer.classList.add('danger');
                } else {
                    navTimer.classList.remove('danger');
                }
            }
            
            if (remaining <= 0) {
                clearInterval(this.timerInterval);
                if (navTimer) navTimer.classList.add('hidden');
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
        
        // Track revealed cells to prevent double counting
        const cellKey = `${cell.x},${cell.y}`;
        if (this.revealedCells?.has(cellKey)) return;
        
        // Generate mines on first click (classic random - fair and fun)
        if (!this.minesGenerated) {
            const mineCount = this.pendingMineCount || 20;
            this.playerBoard.generateMines(mineCount, cell.x, cell.y);
            this.minesGenerated = true;
        }
        
        this.audio.playClick();
        
        const revealed = this.playerBoard.revealCell(cell.x, cell.y);
        this.playerBoard.render();
        
        // Add revealed cells to set
        revealed.forEach(c => {
            this.revealedCells?.add(`${c.x},${c.y}`);
        });
        
        // Calculate score
        let points = 0;
        let hitMine = false;
        
        revealed.forEach(c => {
            if (c.isMine) {
                hitMine = true;
                if (this.hasShield) {
                    this.hasShield = false;
                    this.shieldIndicator?.classList.add('hidden');
                    this.showPointsChange('Shield!', 'success');
                    // Clear shield timeout
                    if (this.shieldTimeout) {
                        clearTimeout(this.shieldTimeout);
                        this.shieldTimeout = null;
                    }
                    // Clear power notification
                    const notification = document.getElementById('power-notification');
                    if (notification) {
                        notification.classList.remove('show');
                    }
                    // Notify opponent that shield is broken
                    this.broadcastPower('shieldBroken', {});
                } else {
                    points -= 30;
                }
            } else {
                // Every revealed cell gives 5 points
                points += 5;
            }
        });
        
        this.score = Math.max(0, this.score + points);
        this.updateScore();
        this.updatePowerButtons();
        
        if (hitMine && !this.hasShield) {
            this.audio.playMine();
            this.showPointsChange('-30', 'error');
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
        
        // Broadcast flag to opponent
        this.broadcastFlag(cell.x, cell.y, cellData.isFlagged);
    }

    // ==================== MOBILE SUPPORT ====================
    
    handleMobileTap(e) {
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.showNotification('You are frozen!', 'error');
            return;
        }
        
        const cell = this.playerBoard?.getCellFromClick(e);
        if (!cell) return;
        
        const cellData = this.playerBoard.grid[cell.y][cell.x];
        if (cellData.isRevealed) return;
        
        // Store selected cell
        this.selectedCell = cell;
        
        // Show mobile action menu
        this.showMobileMenu();
    }
    
    showMobileMenu() {
        if (!this.mobileActionMenu) return;
        this.mobileActionMenu.classList.remove('hidden');
        
        // Highlight selected cell
        this.highlightSelectedCell();
    }
    
    highlightSelectedCell() {
        // Remove existing highlight
        const existingHighlight = document.getElementById('mobile-cell-highlight');
        if (existingHighlight) existingHighlight.remove();
        
        if (!this.selectedCell || !this.playerBoard) return;
        
        const canvas = document.getElementById('player-canvas');
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        // Use rendered size for highlight positioning
        const cellSize = rect.width / this.playerBoard.gridSize;
        
        const highlight = document.createElement('div');
        highlight.id = 'mobile-cell-highlight';
        highlight.className = 'mobile-selected-cell';
        highlight.style.left = `${rect.left + (this.selectedCell.x * cellSize) + window.scrollX}px`;
        highlight.style.top = `${rect.top + (this.selectedCell.y * cellSize) + window.scrollY}px`;
        highlight.style.width = `${cellSize}px`;
        highlight.style.height = `${cellSize}px`;
        document.body.appendChild(highlight);
    }
    
    removeHighlight() {
        const highlight = document.getElementById('mobile-cell-highlight');
        if (highlight) highlight.remove();
    }
    
    hideMobileMenu() {
        if (!this.mobileActionMenu) return;
        this.mobileActionMenu.classList.add('hidden');
        this.removeHighlight();
        this.selectedCell = null;
    }
    
    mobileDigAction() {
        if (!this.selectedCell) return;
        
        const cell = this.selectedCell;
        this.removeHighlight();
        this.mobileActionMenu?.classList.add('hidden');
        
        // Track revealed cells to prevent double counting
        const cellKey = `${cell.x},${cell.y}`;
        if (this.revealedCells?.has(cellKey)) {
            this.selectedCell = null;
            return;
        }
        
        // Generate mines on first click (classic random - fair and fun)
        if (!this.minesGenerated) {
            const mineCount = this.pendingMineCount || 20;
            this.playerBoard.generateMines(mineCount, cell.x, cell.y);
            this.minesGenerated = true;
        }
        
        // Reveal the cell directly
        const revealed = this.playerBoard.revealCell(cell.x, cell.y);
        this.playerBoard.render();
        
        // Add revealed cells to set
        revealed.forEach(c => {
            this.revealedCells?.add(`${c.x},${c.y}`);
        });
        
        // Calculate score
        let points = 0;
        let hitMine = false;
        
        revealed.forEach(c => {
            if (c.isMine) {
                hitMine = true;
                if (this.hasShield) {
                    this.hasShield = false;
                    this.shieldIndicator?.classList.add('hidden');
                    this.showPointsChange('Shield!', 'success');
                    if (this.shieldTimeout) {
                        clearTimeout(this.shieldTimeout);
                        this.shieldTimeout = null;
                    }
                    const notification = document.getElementById('power-notification');
                    if (notification) notification.classList.remove('show');
                    this.broadcastPower('shieldBroken', {});
                } else {
                    points -= 30;
                }
            } else {
                points += 5;
            }
        });
        
        this.score = Math.max(0, this.score + points);
        this.updateScore();
        this.updatePowerButtons();
        
        if (hitMine && !this.hasShield) {
            this.audio.playMine();
            this.showPointsChange('-30', 'error');
        } else if (points > 0) {
            this.audio.playReveal(revealed.length);
        }
        
        this.broadcastMove({ x: cell.x, y: cell.y, revealed, score: this.score });
        
        if (this.playerBoard.getUnrevealedCount() === 0) {
            this.endGame(true);
        }
        
        this.selectedCell = null;
    }
    
    mobileFlagAction() {
        if (!this.selectedCell) return;
        
        const cell = this.selectedCell;
        const cellData = this.playerBoard.grid[cell.y][cell.x];
        
        if (!cellData.isRevealed) {
            cellData.isFlagged = !cellData.isFlagged;
            this.playerBoard.render();
            this.audio.playClick();
            
            // Broadcast flag to opponent
            this.broadcastFlag(cell.x, cell.y, cellData.isFlagged);
        }
        
        this.removeHighlight();
        this.mobileActionMenu?.classList.add('hidden');
        this.selectedCell = null;
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
            this.handleFrozen(data.duration || 5000);
        } else if (data.power === 'shield') {
            // Opponent has shield, we can't attack them for the duration
            this.opponentHasShield = true;
            this.opponentShieldUntil = Date.now() + (data.duration || 10000);
            
            // Show notification that opponent has shield
            this.showNotification('🛡️ Rakip kalkan aktif!', 'info');
            this.showOpponentPowerEffect('shield');
            
            // Auto-clear opponent shield status
            if (this.opponentShieldTimeout) clearTimeout(this.opponentShieldTimeout);
            this.opponentShieldTimeout = setTimeout(() => {
                this.opponentHasShield = false;
            }, data.duration || 10000);
        } else if (data.power === 'shieldBroken') {
            // Opponent's shield was broken by mine
            this.opponentHasShield = false;
            if (this.opponentShieldTimeout) {
                clearTimeout(this.opponentShieldTimeout);
                this.opponentShieldTimeout = null;
            }
            this.showNotification('💥 Rakibin kalkanı kırıldı!', 'success');
        } else if (data.power === 'radar') {
            // Opponent used radar
            this.showNotification('📡 Rakip RADAR kullandı!', 'warning');
            this.showOpponentPowerEffect('radar');
        } else if (data.power === 'safeburst') {
            // Opponent used burst
            this.showNotification(`💥 Rakip BURST kullandı! +${data.points || 0} puan`, 'warning');
            this.showOpponentPowerEffect('safeburst');
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
    
    broadcastFlag(x, y, isFlagged) {
        if (this.gameChannel) {
            this.gameChannel.send({
                type: 'broadcast',
                event: 'flag',
                payload: { x, y, isFlagged }
            });
        }
    }
    
    handleOpponentFlag(data) {
        if (this.opponentBoard && this.opponentBoard.grid[data.y] && this.opponentBoard.grid[data.y][data.x]) {
            this.opponentBoard.grid[data.y][data.x].isFlagged = data.isFlagged;
            this.opponentBoard.render();
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
        // Check if power uses left
        if (!this.powerUsesLeft || this.powerUsesLeft[power] <= 0) {
            this.showNotification(`${power.toUpperCase()} hakkın bitti!`, 'error');
            return;
        }
        
        if (this.score < cost) {
            this.showNotification(`Need ${cost} points!`, 'error');
            return;
        }
        
        // Deduct power usage
        this.powerUsesLeft[power]--;
        this.updatePowerButtonsUsage();
        
        this.score -= cost;
        this.updateScore();
        this.updatePowerButtons();
        this.audio.playPower();
        
        switch (power) {
            case 'radar':
                // Show only unflagged mines (max 3)
                const unflaggedMines = this.playerBoard.mines.filter(m => {
                    const cell = this.playerBoard.grid[m.y][m.x];
                    return !cell.isFlagged && !cell.isRevealed;
                }).slice(0, 3);
                
                if (unflaggedMines.length > 0) {
                    this.playerBoard.highlightMines(unflaggedMines);
                    this.showPowerNotificationSimple('radar', `${unflaggedMines.length} mayın tespit edildi!`);
                } else {
                    this.showPowerNotificationSimple('radar', 'Gizli mayın bulunamadı!');
                }
                // Broadcast radar usage to opponent
                this.broadcastPower('radar', { count: unflaggedMines.length });
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
                this.showPowerNotificationSimple('safeburst', `+${burstPoints} puan kazanıldı!`);
                break;
                
            case 'shield':
                this.hasShield = true;
                this.shieldUntil = Date.now() + 10000; // 10 seconds
                this.shieldIndicator?.classList.remove('hidden');
                
                // Broadcast shield to opponent (they can't attack for 10 seconds)
                this.broadcastPower('shield', { duration: 10000 });
                
                // Show notification with countdown
                this.showPowerNotification('shield', 10000);
                
                // Auto-deactivate shield after 10 seconds
                if (this.shieldTimeout) clearTimeout(this.shieldTimeout);
                this.shieldTimeout = setTimeout(() => {
                    if (this.hasShield) {
                        this.hasShield = false;
                        this.shieldIndicator?.classList.add('hidden');
                    }
                }, 10000);
                break;
                
            case 'freeze':
                // Check if opponent has shield
                if (this.opponentHasShield && Date.now() < this.opponentShieldUntil) {
                    this.showNotification('❌ Rakip kalkanlı! Saldırı yapamassın!', 'error');
                    // Refund the cost
                    this.score += cost;
                    this.updateScore();
                    this.updatePowerButtons();
                    return;
                }
                this.broadcastPower('freeze', { duration: 5000 });
                // Show freeze effect on opponent's board in my view
                this.showOpponentFreezeEffect(5000);
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

    showOpponentPowerEffect(powerType) {
        // Create a visual flash effect on opponent's board
        const opponentSection = document.querySelector('.opponent-section');
        if (!opponentSection) return;
        
        // Define colors for each power
        const colors = {
            'radar': 'rgba(0, 212, 255, 0.6)',
            'safeburst': 'rgba(255, 165, 0, 0.6)',
            'shield': 'rgba(100, 200, 100, 0.6)'
        };
        
        const icons = {
            'radar': '📡',
            'safeburst': '💥',
            'shield': '🛡️'
        };
        
        // Create flash overlay
        const flash = document.createElement('div');
        flash.className = 'power-flash-effect';
        flash.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: ${colors[powerType] || 'rgba(255,255,255,0.5)'};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
            z-index: 100;
            pointer-events: none;
            animation: powerFlash 1s ease-out forwards;
        `;
        flash.innerHTML = icons[powerType] || '⚡';
        
        opponentSection.style.position = 'relative';
        opponentSection.appendChild(flash);
        
        // Remove after animation
        setTimeout(() => {
            flash.remove();
        }, 1000);
    }

    showOpponentFreezeEffect(duration) {
        // Show freeze overlay on opponent's board (in my view)
        const opponentFrozen = document.getElementById('opponent-frozen');
        const freezeTimer = document.getElementById('opponent-freeze-timer');
        
        if (opponentFrozen) {
            opponentFrozen.classList.remove('hidden');
            
            // Countdown on the overlay
            let remainingSeconds = Math.ceil(duration / 1000);
            if (freezeTimer) freezeTimer.textContent = `${remainingSeconds}s`;
            
            const countdownInterval = setInterval(() => {
                remainingSeconds--;
                if (freezeTimer) freezeTimer.textContent = `${remainingSeconds}s`;
                if (remainingSeconds <= 0) {
                    clearInterval(countdownInterval);
                    opponentFrozen.classList.add('hidden');
                }
            }, 1000);
        }
        
        // Show power notification with countdown
        this.showPowerNotification('freeze', duration);
    }
    
    showPowerNotification(powerType, duration) {
        const notification = document.getElementById('power-notification');
        if (!notification) return;
        
        // Clear any existing interval
        if (this.powerNotificationInterval) {
            clearInterval(this.powerNotificationInterval);
        }
        
        const icons = {
            freeze: '❄️',
            radar: '📡',
            shield: '🛡️',
            safeburst: '💥'
        };
        
        const messages = {
            freeze: 'Rakip Donduruldu',
            radar: 'Radar Aktif',
            shield: 'Kalkan Aktif',
            safeburst: 'Burst Kullanıldı'
        };
        
        let remainingSeconds = Math.ceil(duration / 1000);
        
        // Set initial content
        notification.className = 'power-notification show ' + powerType;
        notification.innerHTML = `${icons[powerType]} ${messages[powerType]}: <span style="margin-left: 5px; font-weight: bold;">${remainingSeconds}s</span>`;
        
        // Update countdown every second
        this.powerNotificationInterval = setInterval(() => {
            remainingSeconds--;
            if (remainingSeconds <= 0) {
                clearInterval(this.powerNotificationInterval);
                notification.classList.remove('show');
                setTimeout(() => {
                    notification.className = 'power-notification';
                    notification.innerHTML = '';
                }, 300);
            } else {
                notification.innerHTML = `${icons[powerType]} ${messages[powerType]}: <span style="margin-left: 5px; font-weight: bold;">${remainingSeconds}s</span>`;
            }
        }, 1000);
    }
    
    showPowerNotificationSimple(powerType, message) {
        const notification = document.getElementById('power-notification');
        if (!notification) return;
        
        // Clear any existing interval
        if (this.powerNotificationInterval) {
            clearInterval(this.powerNotificationInterval);
        }
        
        const icons = {
            freeze: '❄️',
            radar: '📡',
            shield: '🛡️',
            safeburst: '💥'
        };
        
        notification.className = 'power-notification show ' + powerType;
        notification.innerHTML = `${icons[powerType]} ${message}`;
        
        // Auto hide after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.className = 'power-notification';
                notification.innerHTML = '';
            }, 300);
        }, 3000);
    }

    endGame(isWinner = null) {
        // Prevent multiple endGame calls
        if (this.gameEnded) return;
        this.gameEnded = true;
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Hide nav timer
        const navTimer = document.getElementById('nav-timer');
        if (navTimer) navTimer.classList.add('hidden');
        
        // Broadcast game end with my final score immediately
        if (this.gameChannel) {
            this.gameChannel.send({
                type: 'broadcast',
                event: 'gameEnd',
                payload: { 
                    odaUserId: this.odaUserId,
                    myFinalScore: this.score
                }
            });
        }
        
        // Show result with a very short delay to allow score sync
        setTimeout(() => {
            this.showGameResult();
        }, 150);
    }
    
    showGameResult() {
        const isWinner = this.score > this.opponentScore;
        const isDraw = this.score === this.opponentScore;
        
        if (isDraw) {
            this.resultIcon.textContent = '🤝';
            this.resultTitle.textContent = 'Berabere!';
            this.resultTitle.className = 'result-title draw';
        } else if (isWinner) {
            this.resultIcon.textContent = '🏆';
            this.resultTitle.textContent = 'Zafer!';
            this.resultTitle.className = 'result-title victory';
            this.audio.playVictory();
        } else {
            this.resultIcon.textContent = '💔';
            this.resultTitle.textContent = 'Yenilgi';
            this.resultTitle.className = 'result-title defeat';
            this.audio.playDefeat();
        }
        
        const playerName = this.myName || this.playerNameInput?.value || 'Player';
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

    updateScore(broadcast = true) {
        if (this.playerScoreDisplay) this.playerScoreDisplay.textContent = this.score;
        if (this.opponentScoreDisplay) this.opponentScoreDisplay.textContent = this.opponentScore;
        if (this.currentPointsDisplay) this.currentPointsDisplay.textContent = this.score;
        
        // Broadcast score to opponent for real-time sync
        if (broadcast && this.gameChannel && !this.gameEnded) {
            this.gameChannel.send({
                type: 'broadcast',
                event: 'scoreUpdate',
                payload: {
                    odaUserId: this.odaUserId,
                    score: this.score
                }
            });
        }
    }

    updatePowerButtons() {
        this.powerButtons.forEach(btn => {
            const cost = parseInt(btn.dataset.cost);
            const power = btn.dataset.power;
            const usesLeft = this.powerUsesLeft?.[power] ?? 3;
            
            // Disable if not enough points OR no uses left
            btn.disabled = this.score < cost || usesLeft <= 0;
            
            // Add visual indicator for uses left
            if (usesLeft <= 0) {
                btn.classList.add('power-exhausted');
            } else {
                btn.classList.remove('power-exhausted');
            }
        });
    }
    
    updatePowerButtonsUsage() {
        // Update the usage count display on each power button
        this.powerButtons.forEach(btn => {
            const power = btn.dataset.power;
            const usesLeft = this.powerUsesLeft?.[power] ?? 3;
            
            // Find or create usage indicator
            let usageIndicator = btn.querySelector('.power-uses');
            if (!usageIndicator) {
                usageIndicator = document.createElement('span');
                usageIndicator.className = 'power-uses';
                btn.appendChild(usageIndicator);
            }
            usageIndicator.textContent = `${usesLeft}/3`;
            
            // Update button state
            if (usesLeft <= 0) {
                btn.classList.add('power-exhausted');
            } else {
                btn.classList.remove('power-exhausted');
            }
        });
    }

    showScreen(name) {
        this.menuScreen?.classList.remove('active');
        this.matchmakingScreen?.classList.remove('active');
        this.gameScreen?.classList.remove('active');
        
        // Show/hide top nav bar based on screen
        const topNav = document.getElementById('top-nav');
        if (topNav) {
            if (name === 'menu') {
                topNav.classList.remove('hidden');
            } else {
                topNav.classList.add('hidden');
            }
        }
        
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

    showPointsChange(text, type = 'info') {
        // Show points change next to the points display
        const pointsDisplay = document.querySelector('.points-display');
        if (!pointsDisplay) return;
        
        // Remove any existing change indicator
        const existing = pointsDisplay.querySelector('.points-change');
        if (existing) existing.remove();
        
        const changeEl = document.createElement('span');
        changeEl.className = `points-change ${type}`;
        changeEl.textContent = text;
        pointsDisplay.appendChild(changeEl);
        
        // Animate and remove
        setTimeout(() => changeEl.remove(), 1500);
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
            console.log('Google login starting...');
            const result = await SupabaseClient.signInWithGoogle();
            console.log('Google login result:', result);
        } catch (error) {
            console.error('Google login error:', error);
            this.game.showNotification('Google girişi başarısız: ' + error.message, 'error');
        }
    }

    async handleSignIn(user) {
        this.game.user = user;
        try {
            // Try to get existing profile from database
            this.game.profile = await SupabaseClient.getProfile(user.id);
        } catch (e) {
            // Profile doesn't exist - use Google name as default
            const defaultName = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Player';
            this.game.profile = { id: user.id, username: defaultName, email: user.email, isNew: true };
        }
        this.game.updateAuthUI();
        this.hideModal();
    }

    async logout() {
        try {
            await SupabaseClient.signOut();
            this.game.user = null;
            this.game.profile = null;
            this.game.updateAuthUI();
            this.game.showNotification('Çıkış yapıldı', 'info');
            window.profileManager?.hideModal();
        } catch (error) {
            this.game.showNotification('Çıkış yapılamadı', 'error');
        }
    }

    showModal() {
        this.modal?.classList.remove('hidden');
    }

    hideModal() {
        this.modal?.classList.add('hidden');
    }
}

// ==================== PROFILE MANAGER ====================
class ProfileManager {
    constructor(gameClient) {
        this.game = gameClient;
        this.modal = document.getElementById('profile-modal');
    }

    async showModal() {
        if (!this.game.user) {
            window.authManager?.showModal();
            return;
        }

        this.modal?.classList.remove('hidden');
        await this.loadProfile();
        await this.loadMatchHistory();
    }

    hideModal() {
        this.modal?.classList.add('hidden');
    }
    
    async saveName() {
        const nameInput = document.getElementById('profile-username-input');
        const newName = nameInput?.value?.trim();
        
        if (!newName || newName.length < 2) {
            this.game.showNotification('İsim en az 2 karakter olmalı!', 'error');
            return;
        }
        
        try {
            await SupabaseClient.updateProfile(this.game.user.id, { username: newName });
            this.game.profile.username = newName;
            this.game.updateAuthUI();
            this.game.showNotification('İsim güncellendi!', 'success');
        } catch (e) {
            console.error('İsim güncellenemedi:', e);
            this.game.showNotification('İsim güncellenemedi', 'error');
        }
    }

    async loadProfile() {
        const user = this.game.user;
        const profile = this.game.profile;
        
        if (!user) return;

        // Update profile info with editable input
        const usernameInput = document.getElementById('profile-username-input');
        if (usernameInput) {
            usernameInput.value = profile?.username || user.email?.split('@')[0] || 'Player';
        }
        document.getElementById('profile-email').textContent = user.email || '';

        // Load stats
        try {
            const stats = await SupabaseClient.getStats(user.id);
            document.getElementById('profile-rating').textContent = stats?.rating || 1000;
            document.getElementById('profile-wins').textContent = stats?.wins || 0;
            document.getElementById('profile-losses').textContent = stats?.losses || 0;
            document.getElementById('profile-total').textContent = stats?.total_games || 0;
        } catch (error) {
            console.error('Stats yüklenemedi:', error);
        }
    }

    async loadMatchHistory() {
        const list = document.getElementById('match-history-list');
        if (!list || !this.game.user) return;

        list.innerHTML = '<div class="match-history-loading">Yükleniyor...</div>';

        try {
            const history = await SupabaseClient.getGameHistory(this.game.user.id, 10);
            
            if (!history || history.length === 0) {
                list.innerHTML = '<div class="match-history-empty">Henüz maç oynamadınız</div>';
                return;
            }

            list.innerHTML = history.map(match => {
                const isPlayer1 = match.player1_id === this.game.user.id;
                const myScore = isPlayer1 ? match.player1_score : match.player2_score;
                const opponentScore = isPlayer1 ? match.player2_score : match.player1_score;
                const opponentName = isPlayer1 ? match.player2?.username : match.player1?.username;
                
                let result = 'draw';
                let resultText = 'Berabere';
                if (match.winner_id === this.game.user.id) {
                    result = 'win';
                    resultText = 'Galibiyet';
                } else if (match.winner_id && match.winner_id !== this.game.user.id) {
                    result = 'loss';
                    resultText = 'Mağlubiyet';
                }
                
                const date = new Date(match.created_at);
                const dateStr = date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
                
                return `
                    <div class="match-history-item">
                        <span class="match-result ${result}">${resultText}</span>
                        <span class="match-opponent">vs ${opponentName || 'Unknown'}</span>
                        <span class="match-score">${myScore} - ${opponentScore}</span>
                        <span class="match-date">${dateStr}</span>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Match history yüklenemedi:', error);
            list.innerHTML = '<div class="match-history-empty">Yüklenemedi</div>';
        }
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
    window.profileManager = new ProfileManager(window.game);
});
