/**
 * MineDuel - Complete Online Multiplayer Game
 * Single file client with WebSocket integration
 */

// ==================== CONFIGURATION ====================
const CONFIG = {
    GRID_SIZE: 10,
    CELL_SIZE: 30,
    MINE_COUNT: 15,
    MATCH_DURATION: 120000,
    WS_URL: `ws://${window.location.hostname}:3000`,
    COLORS: {
        1: '#3498db',
        2: '#27ae60',
        3: '#e74c3c',
        4: '#9b59b6',
        5: '#e67e22',
        6: '#1abc9c',
        7: '#34495e',
        8: '#95a5a6'
    },
    POWER_COSTS: {
        radar: 30,
        safeburst: 40,
        shield: 50,
        freeze: 60
    }
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
                if (this.audioContext.state === 'suspended') {
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

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

// ==================== BOARD RENDERER ====================
class BoardRenderer {
    constructor(canvas, isOpponent = false) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isOpponent = isOpponent;
        this.gridSize = CONFIG.GRID_SIZE;
        this.grid = this.createEmptyGrid();
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
                grid[y][x] = {
                    isRevealed: false,
                    isFlagged: false,
                    isMine: false,
                    neighborCount: 0
                };
            }
        }
        return grid;
    }

    setupCanvas() {
        // Dynamic size based on grid size for proper cell proportions
        // Opponent board is smaller, player board is larger
        let cellSize;
        if (this.isOpponent) {
            cellSize = 16; // Smaller cells for opponent view
        } else {
            cellSize = 26; // Larger cells for player's own board
        }
        
        const size = this.gridSize * cellSize;
        this.canvas.width = size;
        this.canvas.height = size;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        this.cellSize = cellSize;
        
        // Initial render to show the grid
        this.render();
    }

    getCellFromClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.cellSize);
        const y = Math.floor((e.clientY - rect.top) / this.cellSize);
        
        if (x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize) {
            return { x, y };
        }
        return null;
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
        this.highlightedMines = [];
        if (this.highlightTimer) clearTimeout(this.highlightTimer);
        this.render();
    }

    render() {
        const ctx = this.ctx;
        const size = this.canvas.width;
        
        // Clear and draw background
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, size, size);

        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.grid[y][x];
                const px = x * this.cellSize;
                const py = y * this.cellSize;
                const padding = 2;

                // Check if highlighted
                const isHighlighted = this.highlightedMines.some(m => m.x === x && m.y === y);

                // Cell background with gradient effect
                if (cell.isRevealed) {
                    if (cell.isMine) {
                        ctx.fillStyle = '#e74c3c';
                    } else {
                        ctx.fillStyle = '#1a2634';
                    }
                } else if (isHighlighted) {
                    ctx.fillStyle = '#f39c12';
                } else {
                    // Unrevealed cell - 3D effect
                    const gradient = ctx.createLinearGradient(px, py, px + this.cellSize, py + this.cellSize);
                    gradient.addColorStop(0, '#4a6fa5');
                    gradient.addColorStop(1, '#2d4a6f');
                    ctx.fillStyle = gradient;
                }
                
                // Draw rounded rectangle
                this.roundRect(ctx, px + padding, py + padding, this.cellSize - padding * 2, this.cellSize - padding * 2, 4);
                ctx.fill();

                // Cell content
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

                // Cell border
                ctx.strokeStyle = cell.isRevealed ? '#0d1520' : '#5a8ac7';
                ctx.lineWidth = 1;
                this.roundRect(ctx, px + padding, py + padding, this.cellSize - padding * 2, this.cellSize - padding * 2, 4);
                ctx.stroke();
            }
        }
    }
    
    // Helper function for rounded rectangles
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
        this.ws = null;
        this.playerId = null;
        this.playerName = '';
        this.gameId = null;
        this.opponentName = '';
        this.selectedDifficulty = 'medium';
        
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
        this.searchStartTime = 0;
        this.searchInterval = null;
        
        this.init();
    }

    init() {
        this.setupDOM();
        this.setupEventListeners();
        this.connectWebSocket();
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
        
        // Audio button
        this.audioBtn = document.getElementById('audio-btn');
        
        // Power buttons
        this.powerButtons = document.querySelectorAll('.power-btn');
        
        // Initialize boards
        const playerCanvas = document.getElementById('player-canvas');
        const opponentCanvas = document.getElementById('opponent-canvas');
        
        if (playerCanvas && opponentCanvas) {
            this.playerBoard = new BoardRenderer(playerCanvas, false);
            this.opponentBoard = new BoardRenderer(opponentCanvas, true);
        }
        
        // Generate random name if empty
        if (!this.playerNameInput.value) {
            this.playerNameInput.value = 'Player' + Math.floor(Math.random() * 9999);
        }
    }

    setupEventListeners() {
        // Find game button
        this.findGameBtn?.addEventListener('click', () => this.findGame());
        
        // Cancel search button
        this.cancelSearchBtn?.addEventListener('click', () => this.cancelSearch());
        
        // Difficulty buttons
        this.difficultyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.difficultyButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedDifficulty = btn.dataset.difficulty;
            });
        });
        
        // Player canvas click (left click to reveal)
        document.getElementById('player-canvas')?.addEventListener('click', (e) => this.handleCellClick(e));
        
        // Player canvas right click (to place flag)
        document.getElementById('player-canvas')?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleRightClick(e);
        });
        
        // Power buttons - check points instead of energy
        this.powerButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const power = btn.dataset.power;
                const cost = parseInt(btn.dataset.cost);
                this.usePower(power, cost);
            });
        });
        
        // Audio toggle
        this.audioBtn?.addEventListener('click', () => {
            const enabled = this.audio.toggle();
            this.audioBtn.textContent = enabled ? '🔊' : '🔇';
        });
        
        // Modal buttons - FIXED!
        this.playAgainBtn?.addEventListener('click', () => {
            this.hideModal();
            this.showScreen('menu');
        });
        
        this.mainMenuBtn?.addEventListener('click', () => {
            this.hideModal();
            this.showScreen('menu');
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            this.playerBoard?.setupCanvas();
            this.opponentBoard?.setupCanvas();
            this.playerBoard?.render();
            this.opponentBoard?.render();
        });
    }

    connectWebSocket() {
        try {
            this.ws = new WebSocket(CONFIG.WS_URL);
            
            this.ws.onopen = () => {
                console.log('Connected to server');
                this.showNotification('Connected to server', 'success');
            };
            
            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleServerMessage(message);
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from server');
                this.showNotification('Disconnected from server', 'error');
                
                // Reconnect after 3 seconds
                setTimeout(() => this.connectWebSocket(), 3000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect:', error);
            this.showNotification('Failed to connect to server', 'error');
        }
    }

    handleServerMessage(message) {
        switch (message.type) {
            case 'connected':
                this.playerId = message.playerId;
                console.log('Player ID:', this.playerId);
                break;
                
            case 'searching':
                if (this.selectedDifficultyDisplay) {
                    this.selectedDifficultyDisplay.textContent = this.selectedDifficulty.charAt(0).toUpperCase() + this.selectedDifficulty.slice(1);
                }
                this.showNotification('Searching for opponent...', 'info');
                break;
                
            case 'gameStart':
                this.startGame(message);
                break;
                
            case 'cellResult':
                this.handleCellResult(message);
                break;
                
            case 'opponentUpdate':
                this.handleOpponentUpdate(message);
                break;
                
            case 'powerActivated':
                this.handlePowerActivated(message);
                break;
                
            case 'powerFailed':
                this.showNotification(message.reason, 'error');
                break;
                
            case 'frozen':
                this.handleFrozen(message.duration || message.remainingTime);
                break;
                
            case 'shieldUsed':
                this.hasShield = false;
                this.shieldIndicator?.classList.add('hidden');
                this.showNotification('Shield absorbed damage!', 'success');
                break;
                
            case 'flagUpdate':
                // Server confirmed flag update - already updated locally
                break;
                
            case 'opponentFlagUpdate':
                // Opponent placed/removed a flag - show on opponent's board
                if (this.opponentBoard && this.opponentBoard.grid[message.y] && this.opponentBoard.grid[message.y][message.x]) {
                    this.opponentBoard.grid[message.y][message.x].isFlagged = message.isFlagged;
                    this.opponentBoard.render();
                }
                break;
                
            case 'gameEnd':
                this.handleGameEnd(message);
                break;
                
            case 'opponentDisconnected':
                this.showNotification('Opponent disconnected. You win!', 'success');
                this.handleGameEnd({
                    winner: { id: this.playerId },
                    players: {
                        [this.playerId]: { name: this.playerName, score: this.score }
                    },
                    isDraw: false
                });
                break;
        }
    }

    findGame() {
        this.playerName = this.playerNameInput?.value || 'Player';
        
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'findGame',
                name: this.playerName,
                difficulty: this.selectedDifficulty
            }));
            
            this.showScreen('matchmaking');
            this.startSearchTimer();
        } else {
            this.showNotification('Not connected to server', 'error');
            this.connectWebSocket();
        }
    }

    cancelSearch() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'cancelSearch' }));
        }
        
        this.stopSearchTimer();
        this.showScreen('menu');
    }

    startSearchTimer() {
        this.searchStartTime = Date.now();
        this.searchInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.searchStartTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            this.searchTimeDisplay.textContent = 
                `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    }

    stopSearchTimer() {
        if (this.searchInterval) {
            clearInterval(this.searchInterval);
            this.searchInterval = null;
        }
    }

    startGame(message) {
        this.gameId = message.gameId;
        this.opponentName = message.opponent;
        this.matchDuration = message.duration;
        this.matchStartTime = Date.now();
        
        // Get grid size from server message
        const gridSize = message.gridSize || 10;
        
        // Reset game state
        this.score = 0;
        this.opponentScore = 0;
        this.hasShield = false;
        this.isFrozen = false;
        
        // Set grid size and reset boards
        this.playerBoard?.setGridSize(gridSize);
        this.opponentBoard?.setGridSize(gridSize);
        
        // Update UI
        this.playerNameDisplay.textContent = this.playerName;
        this.opponentNameDisplay.textContent = this.opponentName;
        this.updateScore();
        this.updatePowerButtons();
        this.shieldIndicator?.classList.add('hidden');
        this.playerFrozenOverlay?.classList.add('hidden');
        
        // Stop search timer
        this.stopSearchTimer();
        
        // Show game screen
        this.showScreen('game');
        this.hideModal();
        
        // Start game timer
        this.startGameTimer();
        
        const diffName = message.difficulty ? message.difficulty.toUpperCase() : 'MEDIUM';
        this.showNotification(`Game started vs ${this.opponentName}! [${diffName}] ${gridSize}x${gridSize}`, 'success');
        this.audio.playPower();
    }

    startGameTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.matchStartTime;
            const remaining = Math.max(0, this.matchDuration - elapsed);
            
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            
            this.gameTimerDisplay.textContent = 
                `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            if (remaining <= 0) {
                clearInterval(this.timerInterval);
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
        
        // Check if cell is already revealed or flagged
        if (this.playerBoard.grid[cell.y][cell.x].isRevealed) return;
        if (this.playerBoard.grid[cell.y][cell.x].isFlagged) return;
        
        this.audio.playClick();
        
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'cellClick',
                x: cell.x,
                y: cell.y
            }));
        }
    }

    handleRightClick(e) {
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.showNotification('You are frozen!', 'error');
            return;
        }
        
        const cell = this.playerBoard?.getCellFromClick(e);
        if (!cell) return;
        
        // Check if cell is already revealed
        if (this.playerBoard.grid[cell.y][cell.x].isRevealed) return;
        
        // Toggle flag locally
        const cellData = this.playerBoard.grid[cell.y][cell.x];
        cellData.isFlagged = !cellData.isFlagged;
        this.playerBoard.render();
        
        // Play sound
        this.audio.playClick();
        
        // Send flag update to server
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'toggleFlag',
                x: cell.x,
                y: cell.y
            }));
        }
    }

    handleCellResult(message) {
        // Reveal cells on board
        if (message.revealedCells) {
            this.playerBoard?.revealCells(message.revealedCells);
        }
        
        if (message.hitMine) {
            this.audio.playMine();
            this.showNotification(`💣 Mine hit! -${message.damage} points`, 'error');
        } else {
            this.audio.playReveal(message.revealedCells?.length || 1);
            if (message.points > 0) {
                this.audio.playScore(message.points);
                this.showNotification(`+${message.points} points!`, 'success');
            }
        }
        
        // Update score
        this.score = message.score;
        this.updateScore();
        this.updatePowerButtons();
    }

    handleOpponentUpdate(message) {
        this.opponentScore = message.score;
        this.updateScore();
        
        // Update completion bar
        if (message.completion !== undefined && this.opponentCompletion) {
            this.opponentCompletion.style.width = `${message.completion}%`;
        }
        
        // Show opponent's revealed cells on their board
        if (message.revealedCells && this.opponentBoard) {
            this.opponentBoard.revealCells(message.revealedCells);
        }
    }

    handlePowerActivated(message) {
        this.audio.playPower();
        
        // Update score (powers cost points now)
        if (message.score !== undefined) {
            this.score = message.score;
            this.updateScore();
            this.updatePowerButtons();
        }
        
        switch (message.power) {
            case 'radar':
                if (message.mines) {
                    this.playerBoard?.highlightMines(message.mines);
                    this.showNotification('📡 Radar: Mines detected!', 'info');
                }
                break;
                
            case 'safeburst':
                if (message.revealedCells) {
                    this.playerBoard?.revealCells(message.revealedCells);
                }
                this.score = message.score;
                this.updateScore();
                this.updatePowerButtons();
                this.showNotification(`💥 Safe Burst: +${message.points} points!`, 'success');
                break;
                
            case 'shield':
                this.hasShield = true;
                this.shieldIndicator?.classList.remove('hidden');
                this.showNotification('🛡️ Shield activated!', 'success');
                break;
                
            case 'freeze':
                this.showNotification('❄️ Freeze sent to opponent!', 'success');
                break;
        }
    }

    handleFrozen(duration) {
        this.isFrozen = true;
        this.frozenUntil = Date.now() + duration;
        
        this.playerFrozenOverlay?.classList.remove('hidden');
        this.showNotification('You are frozen!', 'error');
        
        // Update frozen timer
        const updateFrozenTimer = () => {
            const remaining = Math.max(0, this.frozenUntil - Date.now());
            const secs = Math.ceil(remaining / 1000);
            
            if (this.frozenTimerDisplay) {
                this.frozenTimerDisplay.textContent = `${secs}s`;
            }
            
            if (remaining > 0) {
                requestAnimationFrame(updateFrozenTimer);
            } else {
                this.isFrozen = false;
                this.playerFrozenOverlay?.classList.add('hidden');
                this.showNotification('Unfrozen!', 'success');
            }
        };
        
        updateFrozenTimer();
    }

    handleGameEnd(message) {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        const isWinner = message.winner?.id === this.playerId;
        const isDraw = message.isDraw;
        
        // Play appropriate sound
        if (isDraw) {
            // No special sound for draw
        } else if (isWinner) {
            this.audio.playVictory();
        } else {
            this.audio.playDefeat();
        }
        
        // Update modal
        if (isDraw) {
            this.resultIcon.textContent = '🤝';
            this.resultTitle.textContent = 'Draw!';
            this.resultTitle.className = 'result-title draw';
        } else if (isWinner) {
            this.resultIcon.textContent = '🏆';
            this.resultTitle.textContent = 'Victory!';
            this.resultTitle.className = 'result-title victory';
        } else {
            this.resultIcon.textContent = '💔';
            this.resultTitle.textContent = 'Defeat';
            this.resultTitle.className = 'result-title defeat';
        }
        
        // Set scores
        this.resultPlayerName.textContent = this.playerName;
        this.resultPlayerScore.textContent = this.score;
        this.resultOpponentName.textContent = this.opponentName;
        this.resultOpponentScore.textContent = this.opponentScore;
        
        // Show modal
        this.gameOverModal?.classList.remove('hidden');
    }

    usePower(power, cost) {
        if (this.score < cost) {
            this.showNotification(`Not enough points! Need ${cost}`, 'error');
            return;
        }
        
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'usePower',
                power
            }));
        }
    }

    updateScore() {
        if (this.playerScoreDisplay) {
            this.playerScoreDisplay.textContent = this.score;
        }
        if (this.opponentScoreDisplay) {
            this.opponentScoreDisplay.textContent = this.opponentScore;
        }
        if (this.currentPointsDisplay) {
            this.currentPointsDisplay.textContent = this.score;
        }
    }

    updatePowerButtons() {
        // Update power button states based on current score (points)
        this.powerButtons.forEach(btn => {
            const cost = parseInt(btn.dataset.cost);
            btn.disabled = this.score < cost;
        });
    }

    showScreen(screenName) {
        this.menuScreen?.classList.remove('active');
        this.matchmakingScreen?.classList.remove('active');
        this.gameScreen?.classList.remove('active');
        
        switch (screenName) {
            case 'menu':
                this.menuScreen?.classList.add('active');
                break;
            case 'matchmaking':
                this.matchmakingScreen?.classList.add('active');
                break;
            case 'game':
                this.gameScreen?.classList.add('active');
                break;
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
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
}

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 MineDuel - Competitive Minesweeper');
    window.game = new GameClient();
});