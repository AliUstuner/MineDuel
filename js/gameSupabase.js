/**
 * MineDuel - Supabase Realtime Multiplayer Game
 * Uses Supabase for matchmaking and real-time sync
 */

import * as SupabaseClient from './supabaseClient.js';
import { BotCore } from './ai/BotCore.js';
import { dataCollector } from './GameDataCollector.js';

// DataCollector'ı global yap (konsol erişimi için)
window.dataCollector = dataCollector;

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
        this.mines = []; // Reset mines for new game
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
        // Try to generate a solvable board (no 50/50 guessing required)
        const maxAttempts = 50;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            this.mines = [];
            this.grid = this.createEmptyGrid();
            
            const positions = [];
            const excludeRadius = 1; // 3x3 safe zone around first click
            
            for (let y = 0; y < this.gridSize; y++) {
                for (let x = 0; x < this.gridSize; x++) {
                    const isExcluded = Math.abs(x - excludeX) <= excludeRadius && 
                                       Math.abs(y - excludeY) <= excludeRadius;
                    if (!isExcluded) {
                        positions.push({ x, y });
                    }
                }
            }
            
            const actualMineCount = Math.min(mineCount, positions.length);
            
            // Fisher-Yates shuffle
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
            
            // Check if board is solvable without guessing
            if (this.isBoardSolvable(excludeX, excludeY)) {
                return; // Found a solvable board!
            }
        }
        
        // If no solvable board found after max attempts, use last generated board
        // (This is rare and the board will still be playable)
    }

    // Simulate solving the board using only logic (no guessing)
    isBoardSolvable(startX, startY) {
        // Create simulation grid
        const simGrid = [];
        for (let y = 0; y < this.gridSize; y++) {
            simGrid[y] = [];
            for (let x = 0; x < this.gridSize; x++) {
                simGrid[y][x] = {
                    isMine: this.grid[y][x].isMine,
                    neighborCount: this.grid[y][x].neighborCount,
                    isRevealed: false,
                    isFlagged: false
                };
            }
        }
        
        // Simulate first click (flood fill from start position)
        const revealCell = (x, y) => {
            if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return;
            const cell = simGrid[y][x];
            if (cell.isRevealed || cell.isFlagged || cell.isMine) return;
            
            cell.isRevealed = true;
            
            if (cell.neighborCount === 0) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx !== 0 || dy !== 0) {
                            revealCell(x + dx, y + dy);
                        }
                    }
                }
            }
        };
        
        // Start from first click
        revealCell(startX, startY);
        
        // Keep applying logical deductions until no more progress
        let progress = true;
        let iterations = 0;
        const maxIterations = 1000;
        
        while (progress && iterations < maxIterations) {
            progress = false;
            iterations++;
            
            for (let y = 0; y < this.gridSize; y++) {
                for (let x = 0; x < this.gridSize; x++) {
                    const cell = simGrid[y][x];
                    if (!cell.isRevealed || cell.neighborCount === 0) continue;
                    
                    // Count unrevealed and flagged neighbors
                    let unrevealedCount = 0;
                    let flaggedCount = 0;
                    const unrevealedNeighbors = [];
                    
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx, ny = y + dy;
                            if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize) {
                                const neighbor = simGrid[ny][nx];
                                if (neighbor.isFlagged) {
                                    flaggedCount++;
                                } else if (!neighbor.isRevealed) {
                                    unrevealedCount++;
                                    unrevealedNeighbors.push({ x: nx, y: ny });
                                }
                            }
                        }
                    }
                    
                    const remainingMines = cell.neighborCount - flaggedCount;
                    
                    // Rule 1: If remaining mines equals unrevealed neighbors, all are mines
                    if (remainingMines === unrevealedCount && unrevealedCount > 0) {
                        unrevealedNeighbors.forEach(n => {
                            if (!simGrid[n.y][n.x].isFlagged) {
                                simGrid[n.y][n.x].isFlagged = true;
                                progress = true;
                            }
                        });
                    }
                    
                    // Rule 2: If remaining mines is 0, all unrevealed neighbors are safe
                    if (remainingMines === 0 && unrevealedCount > 0) {
                        unrevealedNeighbors.forEach(n => {
                            if (!simGrid[n.y][n.x].isRevealed && !simGrid[n.y][n.x].isFlagged) {
                                revealCell(n.x, n.y);
                                progress = true;
                            }
                        });
                    }
                }
            }
        }
        
        // Check if all non-mine cells are revealed
        let allRevealed = true;
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = simGrid[y][x];
                if (!cell.isMine && !cell.isRevealed) {
                    allRevealed = false;
                    break;
                }
            }
            if (!allRevealed) break;
        }
        
        return allRevealed;
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

    // Highlight random unrevealed mines (for radar power)
    highlightRandomMines(count = 3) {
        const unrevealedMines = [];
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.grid[y][x];
                if (cell.isMine && !cell.isRevealed && !cell.isFlagged) {
                    unrevealedMines.push({ x, y });
                }
            }
        }
        
        // Shuffle and take first 'count' mines
        const shuffled = unrevealedMines.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(count, shuffled.length));
        
        this.highlightMines(selected, 3000);
        return selected;
    }

    // Safe burst - reveal random safe cells
    safeBurst(count = 3) {
        console.log('[SAFEBURST] Called with count:', count);
        console.log('[SAFEBURST] Grid size:', this.gridSize);
        
        const safeCells = [];
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.grid[y][x];
                if (!cell.isMine && !cell.isRevealed && !cell.isFlagged) {
                    safeCells.push({ x, y });
                }
            }
        }
        
        console.log('[SAFEBURST] Found safe cells:', safeCells.length);
        
        if (safeCells.length === 0) {
            console.log('[SAFEBURST] No safe cells available');
            return { points: 0, cellsRevealed: 0, revealedCells: [] };
        }
        
        // Shuffle and take first 'count' safe cells
        const shuffled = safeCells.sort(() => Math.random() - 0.5);
        const toReveal = shuffled.slice(0, Math.min(count, shuffled.length));
        
        console.log('[SAFEBURST] Cells to reveal:', toReveal);
        
        let totalPoints = 0;
        const allRevealed = [];
        
        for (const pos of toReveal) {
            const revealed = this.revealCell(pos.x, pos.y);
            console.log('[SAFEBURST] Revealed at', pos.x, pos.y, ':', revealed.length, 'cells');
            allRevealed.push(...revealed);
            // Count points: 5 for each safe cell revealed
            revealed.forEach(c => {
                if (!c.isMine) {
                    totalPoints += 5;
                }
            });
        }
        
        console.log('[SAFEBURST] Total points:', totalPoints, 'cells revealed:', allRevealed.length);
        this.render();
        return { points: totalPoints, cellsRevealed: allRevealed.length, revealedCells: allRevealed };
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
    
    // Check if all mines are correctly flagged (and no wrong flags)
    checkAllMinesFlagged() {
        if (!this.mines || this.mines.length === 0) return false;
        
        let correctFlags = 0;
        let wrongFlags = 0;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.grid[y][x];
                if (cell.isFlagged) {
                    if (cell.isMine) {
                        correctFlags++;
                    } else {
                        wrongFlags++;
                    }
                }
            }
        }
        
        // Win if all mines flagged AND no wrong flags
        return correctFlags === this.mines.length && wrongFlags === 0;
    }
    
    // Check if all safe cells are revealed
    checkAllSafeCellsRevealed() {
        if (!this.mines || this.mines.length === 0) return false;
        
        const totalCells = this.gridSize * this.gridSize;
        const mineCount = this.mines.length;
        const safeCells = totalCells - mineCount;
        let revealedSafeCells = 0;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.grid[y][x];
                // Only count revealed cells that are NOT mines
                if (cell.isRevealed && !cell.isMine) {
                    revealedSafeCells++;
                }
            }
        }
        
        console.log(`[WIN CHECK] Safe cells: ${revealedSafeCells}/${safeCells}`);
        
        // Must reveal ALL safe cells (exactly equal)
        return revealedSafeCells === safeCells;
    }
    
    // Check if board is completed (all safe cells revealed)
    checkBoardCompleted() {
        const allSafeRevealed = this.checkAllSafeCellsRevealed();
        
        console.log(`[WIN CHECK] All safe revealed: ${allSafeRevealed}`);
        
        // Win condition: ALL safe cells revealed (flags not required)
        return allSafeRevealed;
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
        this.CONFIG = CONFIG; // Make CONFIG accessible for bot
        this.user = null;
        this.profile = null;
        this.gameId = null;
        this.gameChannel = null;
        this.matchmakingChannel = null;
        this.opponentId = null;
        this.opponentName = '';
        this.selectedDifficulty = 'medium';
        this.selectedBotDifficulty = 'medium'; // Bot AI difficulty
        this.isHost = false;
        
        this.playerBoard = null;
        this.opponentBoard = null;
        this.audio = new AudioManager();
        
        this.score = 0;
        this.opponentScore = 0;
        this.hasShield = false;
        this.isFrozen = false;
        this.frozenUntil = 0;
        
        // Bot mode
        this.isBotMode = false;
        this.bot = null;
        this.botBoard = null;
        
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
        
        // Bot mode button - show difficulty selection
        const playWithBotBtn = document.getElementById('play-with-bot-btn');
        const botDifficultySection = document.getElementById('bot-difficulty-section');
        const startBotGameBtn = document.getElementById('start-bot-game-btn');
        const cancelBotBtn = document.getElementById('cancel-bot-btn');
        
        playWithBotBtn?.addEventListener('click', () => {
            // Toggle bot difficulty section
            botDifficultySection?.classList.toggle('hidden');
            playWithBotBtn.classList.toggle('hidden');
        });
        
        // Bot difficulty buttons
        const botDiffButtons = document.querySelectorAll('.bot-diff-btn');
        botDiffButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                botDiffButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedBotDifficulty = btn.dataset.botDifficulty;
            });
        });
        
        // Start bot game button
        startBotGameBtn?.addEventListener('click', () => {
            botDifficultySection?.classList.add('hidden');
            playWithBotBtn?.classList.remove('hidden');
            this.startBotGame();
        });
        
        // Cancel bot selection
        cancelBotBtn?.addEventListener('click', () => {
            botDifficultySection?.classList.add('hidden');
            playWithBotBtn?.classList.remove('hidden');
        });
        
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
            // Desktop: Drag-to-reveal support
            this.isDragging = false;
            this.lastDragCell = null;
            
            playerCanvas?.addEventListener('mousedown', (e) => {
                if (e.button === 0) { // Left mouse button
                    this.isDragging = true;
                    this.lastDragCell = null;
                    this.handleCellReveal(e);
                }
            });
            
            playerCanvas?.addEventListener('mousemove', (e) => {
                if (this.isDragging) {
                    this.handleCellReveal(e);
                }
            });
            
            playerCanvas?.addEventListener('mouseup', (e) => {
                if (e.button === 0) {
                    this.isDragging = false;
                    this.lastDragCell = null;
                }
            });
            
            playerCanvas?.addEventListener('mouseleave', () => {
                this.isDragging = false;
                this.lastDragCell = null;
            });
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

    startBotGame() {
        console.log('[BOT] Starting bot game...');
        
        // Stop any existing bot first
        if (this.bot) {
            this.bot.stop();
            this.bot = null;
        }
        
        const playerName = this.playerNameInput?.value || 'Player' + Math.floor(Math.random() * 9999);
        const gridDifficulty = this.selectedDifficulty; // Grid size difficulty
        const botDifficulty = this.selectedBotDifficulty || 'medium'; // Bot AI difficulty
        
        this.isBotMode = true;
        
        // Set bot name based on difficulty
        const botNames = {
            'easy': '🤖 Kolay Bot',
            'medium': '🤖 Orta Bot',
            'hard': '🤖 Zor Bot',
            'expert': '💀 Uzman Bot'
        };
        this.opponentName = botNames[botDifficulty] || '🤖 Bot';
        
        this.isHost = true;
        this.gameId = 'bot_' + Date.now();
        
        // Reset bot-related state
        this.opponentCompletedBoard = false;
        this.playerCompletedBoard = false;  // YENİ: Oyuncu tamamladı mı?
        this.botBoard = null;
        this.opponentMineHitCount = 0;
        
        const gridSize = CONFIG.DIFFICULTIES[gridDifficulty].gridSize;
        const mineCount = CONFIG.DIFFICULTIES[gridDifficulty].mineCount;
        
        console.log(`[BOT] Grid: ${gridDifficulty} (${gridSize}x${gridSize}), Bot AI: ${botDifficulty}`);
        
        this.startGame({
            gameId: this.gameId,
            opponent: this.opponentName,
            difficulty: gridDifficulty,
            gridSize: gridSize,
            mineCount: mineCount,
            myName: playerName,
            isOffline: true
        });
        
        // Start bot AI after boards are ready - use longer delay to ensure everything is initialized
        setTimeout(() => {
            if (!this.opponentBoard) {
                console.error('[BOT] opponentBoard not ready!');
                return;
            }
            
            this.botBoard = this.opponentBoard;
            this.bot = new BotCore(this, botDifficulty);
            
            console.log('[BOT] BotCore v9 initialized with difficulty:', botDifficulty);
            console.log('[BOT] botBoard:', this.botBoard ? 'OK' : 'NULL');
            
            this.bot.start(this.botBoard, gridSize);
        }, 1500);
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
        // Immediately update UI for faster feedback
        this.stopSearchTimer();
        this.showScreen('menu');
        
        // Then cleanup in background
        this.stopMatchPolling();
        
        if (this.matchmakingChannel) {
            SupabaseClient.unsubscribe(this.matchmakingChannel);
            this.matchmakingChannel = null;
        }
        
        const userId = this.odaUserId || this.user?.id || 'guest';
        try {
            await SupabaseClient.leaveMatchmaking(userId);
        } catch (e) {
            // Silent fail - user already returned to menu
        }
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
        console.log('[GAME] startGame called with config:', {
            gameId: config.gameId,
            opponent: config.opponent,
            difficulty: config.difficulty,
            isOffline: config.isOffline,
            isBotMode: this.isBotMode
        });
        
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
        this.iCompletedBoard = false;
        this.opponentCompletedBoard = false;
        this.playerCompletedBoard = false;  // YENİ
        
        // Track mine hits (max 3 allowed to win)
        this.mineHitCount = 0;
        this.opponentMineHitCount = 0;
        
        // Track revealed cells to prevent duplicates
        this.revealedCells = new Set();
        
        // Initialize power usage limits (max 3 uses per power per game)
        this.powerUsesLeft = {
            radar: 3,
            safeburst: 3,
            shield: 3,
            freeze: 3
        };
        
        // Bot's own power usage limits
        this.botPowerUsesLeft = {
            radar: 3,
            safeburst: 3,
            shield: 3,
            freeze: 3
        };
        
        console.log('[GAME] Initialized botPowerUsesLeft:', this.botPowerUsesLeft);
        
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
        
        // ==================== VERİ TOPLAMA BAŞLAT ====================
        dataCollector.startRecording({
            gridSize: gridSize,
            mineCount: mineCount,
            difficulty: config.difficulty || 'medium',
            matchDuration: this.matchDuration,
            isVsBot: this.isBotMode,
            botDifficulty: this.isBotMode ? this.selectedBotDifficulty : null,
            playerName: this.myName,
            opponentName: this.opponentName
        });
        
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
                    
                    // Track if opponent completed the board
                    if (data.completedBoard) {
                        this.opponentCompletedBoard = true;
                    }
                    
                    // End our game too if not already ended
                    if (!this.gameEnded) {
                        this.gameEnded = true;
                        this.iCompletedBoard = false; // I didn't complete first
                        
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
                this.endGame(false); // Time's up, not a board completion
            }
        }, 100);
    }

    // Handle cell reveal for drag-to-reveal feature
    handleCellReveal(e) {
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            if (!this.isDragging) this.showNotification('You are frozen!', 'error');
            return;
        }
        
        const cell = this.playerBoard?.getCellFromClick(e);
        if (!cell) return;
        
        // Skip if same cell as last drag position
        const cellKey = `${cell.x},${cell.y}`;
        if (this.lastDragCell === cellKey) return;
        this.lastDragCell = cellKey;
        
        // Skip if already revealed or flagged
        if (this.playerBoard.grid[cell.y][cell.x].isRevealed) return;
        if (this.playerBoard.grid[cell.y][cell.x].isFlagged) return;
        
        // Track revealed cells to prevent double counting
        if (this.revealedCells?.has(cellKey)) return;
        
        // Generate mines on first click
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
        
        // Update player completion for bot AI analysis
        this.playerCompletion = this.calculatePlayerCompletion();
        
        if (hitMine && !this.hasShield) {
            this.mineHitCount++;
            this.audio.playMine();
            this.showPointsChange('-30', 'error');
            // Stop dragging when hit mine
            this.isDragging = false;
            this.lastDragCell = null;
        } else if (points > 0) {
            this.audio.playReveal(revealed.length);
        }
        
        // Broadcast move
        this.broadcastMove({ x: cell.x, y: cell.y, revealed, score: this.score });
        
        // Check win condition: 3 or fewer mine hits AND board completed
        this.checkPlayerWinCondition();
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
        
        // Update player completion for bot AI analysis
        this.playerCompletion = this.calculatePlayerCompletion();
        
        // ==================== VERİ KAYDET ====================
        dataCollector.recordMove({
            player: 'player1',
            type: 'reveal',
            x: cell.x,
            y: cell.y,
            result: hitMine ? 'mine' : (revealed.length > 1 ? 'cascade' : 'safe'),
            cellValue: hitMine ? -1 : (this.playerBoard.grid[cell.y][cell.x].neighborCount || 0),
            cellsRevealed: revealed.length,
            scoreBefore: this.score - points,
            scoreChange: points,
            currentScore: this.score,
            opponentScore: this.opponentScore,
            wasKnownSafe: false, // İnsan için bilinmiyor
            includeSnapshot: true,
            board: this.playerBoard
        });
        
        if (hitMine && !this.hasShield) {
            this.mineHitCount++;
            this.audio.playMine();
            this.showPointsChange('-30', 'error');
        } else if (points > 0) {
            this.audio.playReveal(revealed.length);
        }
        
        // ==================== BOT'A OYUNCU HAMLESİNİ BİLDİR ====================
        if (this.isBotMode && this.bot && typeof this.bot.watchPlayerMove === 'function') {
            this.bot.watchPlayerMove({
                type: 'reveal',
                x: cell.x,
                y: cell.y,
                result: hitMine ? 'mine' : (revealed.length > 1 ? 'cascade' : 'safe'),
                cellsRevealed: revealed.length,
                scoreChange: points,
                currentScore: this.score,
                isCorrect: !hitMine
            });
        }
        
        // Broadcast move
        this.broadcastMove({ x: cell.x, y: cell.y, revealed, score: this.score });
        
        // Check win condition: 3 or fewer mine hits AND board completed
        this.checkPlayerWinCondition();
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
        
        // ==================== BOT'A BAYRAK HAMLESİNİ BİLDİR ====================
        if (this.isBotMode && this.bot && typeof this.bot.watchPlayerMove === 'function') {
            this.bot.watchPlayerMove({
                type: 'flag',
                x: cell.x,
                y: cell.y,
                result: cellData.isFlagged ? 'flag' : 'unflag',
                isCorrect: cellData.isMine, // Bayrak gerçekten mayında mı
                currentScore: this.score
            });
        }
        
        // Broadcast flag to opponent
        this.broadcastFlag(cell.x, cell.y, cellData.isFlagged);
        
        // Check win condition
        this.checkPlayerWinCondition();
    }
    
    // Check if player wins - board completed
    checkPlayerWinCondition() {
        if (this.gameEnded) return;
        
        // Check if board is completed (all safe cells revealed)
        if (this.playerBoard.checkBoardCompleted()) {
            console.log('[WIN] Player completed board!');
            this.playerCompletedBoard = true;
            
            // Bildirim göster
            this.showNotification('🎉 Tahtayı tamamladın!', 'success');
            
            // Bot modunda
            if (this.isBotMode) {
                // Eğer bot da tahtayı tamamladıysa, karşılaştır ve bitir
                if (this.opponentCompletedBoard) {
                    console.log('[WIN] Her iki tahta da tamamlandı - skorları karşılaştır');
                    this.compareAndEndGame();
                } else {
                    // Bot henüz tamamlamadı
                    // KURAL: 2 veya daha az mayına bastıysa = ANINDA oyun biter, en yüksek skor kazanır
                    // KURAL: 3+ mayına bastıysa = Süre bitene kadar veya bot bitirene kadar bekle
                    if (this.mineHitCount <= 2) {
                        // 2 veya daha az mayın - oyun biter, skorlar karşılaştırılır
                        console.log('[WIN] Player completed with', this.mineHitCount, 'mine hits (<=2) - game ends!');
                        if (this.score > this.opponentScore) {
                            this.showNotification('🎉 Tahtayı tamamladın ve kazandın!', 'success');
                            this.endGame(true);
                        } else if (this.score === this.opponentScore) {
                            this.showNotification('🤝 Berabere!', 'info');
                            this.endGame(false); // Draw
                        } else {
                            this.showNotification('Tahtayı tamamladın ama bot önde!', 'error');
                            this.endGame(false);
                        }
                    } else {
                        // 3+ mayına bastı - süreyi bekle veya bot bitirene kadar bekle
                        console.log('[WIN] Player completed but hit', this.mineHitCount, 'mines (>2) - waiting for timer or bot');
                        this.showNotification('Tahtayı tamamladın! 3+ mayına bastın, süre veya bot bekleniyor.', 'info');
                    }
                }
            } else {
                // Online mode - KURAL: 2 veya daha az mayınla tamamlarsan oyun biter
                if (this.mineHitCount <= 2) {
                    console.log('[WIN] Player completed online with', this.mineHitCount, 'mine hits (<=2) - game ends!');
                    this.endGame(true);
                } else {
                    // 3+ mayına bastı - süre bitene kadar veya rakip bitirene kadar bekle
                    console.log('[WIN] Player completed but hit', this.mineHitCount, 'mines (>2) - waiting');
                    this.showNotification('Tahtayı tamamladın! 3+ mayına bastın, süre sonuna kadar bekle.', 'info');
                }
            }
        }
    }

    // ==================== MOBILE SUPPORT ====================
    
    handleMobileTap(e) {
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.showNotification('Donmuş durumdasınız!', 'error');
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
        // Check freeze status before showing menu
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.showNotification('Donmuş durumdasınız!', 'error');
            return;
        }
        
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
        // Check freeze status
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.showNotification('Donmuş durumdasınız!', 'error');
            this.hideMobileMenu();
            return;
        }
        
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
            this.mineHitCount++;
            this.audio.playMine();
            this.showPointsChange('-30', 'error');
        } else if (points > 0) {
            this.audio.playReveal(revealed.length);
        }
        
        this.broadcastMove({ x: cell.x, y: cell.y, revealed, score: this.score });
        
        // Check win condition: 3 or fewer mine hits AND board completed
        this.checkPlayerWinCondition();
        
        this.selectedCell = null;
    }
    
    mobileFlagAction() {
        // Check freeze status
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.showNotification('Donmuş durumdasınız!', 'error');
            this.hideMobileMenu();
            return;
        }
        
        if (!this.selectedCell) return;
        
        const cell = this.selectedCell;
        const cellData = this.playerBoard.grid[cell.y][cell.x];
        
        if (!cellData.isRevealed) {
            cellData.isFlagged = !cellData.isFlagged;
            this.playerBoard.render();
            this.audio.playClick();
            
            // Broadcast flag to opponent
            this.broadcastFlag(cell.x, cell.y, cellData.isFlagged);
            
            // Check win condition
            this.checkPlayerWinCondition();
        }
        
        this.removeHighlight();
        this.mobileActionMenu?.classList.add('hidden');
        this.selectedCell = null;
    }

    handleOpponentMove(data) {
        // Verify this is not from ourselves (for same-name players)
        if (data.playerId && data.playerId === this.odaUserId) {
            return; // Ignore our own moves
        }
        
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
            // Add player ID to distinguish same-name players
            this.gameChannel.send({
                type: 'broadcast',
                event: 'move',
                payload: {
                    ...data,
                    playerId: this.odaUserId
                }
            });
        }
    }
    
    broadcastFlag(x, y, isFlagged) {
        if (this.gameChannel) {
            this.gameChannel.send({
                type: 'broadcast',
                event: 'flag',
                payload: { 
                    x, 
                    y, 
                    isFlagged,
                    playerId: this.odaUserId
                }
            });
        }
    }
    
    handleOpponentFlag(data) {
        // Verify this is not from ourselves
        if (data.playerId && data.playerId === this.odaUserId) {
            return;
        }
        
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
        // Check if frozen
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.showNotification('Dondurulduğunuz için güç kullanamazsınız!', 'error');
            return;
        }
        
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
                // Find all safe unrevealed cells
                const allSafeCells = [];
                for (let y = 0; y < this.playerBoard.gridSize; y++) {
                    for (let x = 0; x < this.playerBoard.gridSize; x++) {
                        const cell = this.playerBoard.grid[y][x];
                        if (!cell.isRevealed && !cell.isMine) {
                            allSafeCells.push({ x, y });
                        }
                    }
                }
                
                // Shuffle and pick random 5 cells
                const shuffled = allSafeCells.sort(() => Math.random() - 0.5);
                const safeCells = shuffled.slice(0, 5);
                
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
                
                // Broadcast burst usage with revealed cells
                this.broadcastPower('safeburst', { points: burstPoints, revealed: safeCells });
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
                    this.showNotification('❌ Rakip kalkanlı! Saldırı yapamazsın!', 'error');
                    // Refund the cost
                    this.score += cost;
                    this.updateScore();
                    this.updatePowerButtons();
                    return;
                }
                
                // If bot mode, freeze the bot directly
                if (this.isBotMode && this.bot) {
                    this.bot.freeze(5000);
                    this.showNotification('❄️ Bot 5 saniye donduruldu!', 'success');
                    this.showOpponentFreezeEffect(5000);
                } else {
                    // Normal PvP mode
                    this.broadcastPower('freeze', { duration: 5000 });
                    this.showOpponentFreezeEffect(5000);
                }
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

    // ==================== BOT HELPER FUNCTIONS ====================
    
    showBotThinking() {
        const botThinking = document.getElementById('bot-thinking');
        if (botThinking) {
            botThinking.classList.remove('hidden');
        }
    }
    
    hideBotThinking() {
        const botThinking = document.getElementById('bot-thinking');
        if (botThinking) {
            botThinking.classList.add('hidden');
        }
    }
    
    makeBotMove(x, y) {
        console.log('[BOT MOVE] makeBotMove called', { x, y, isBotMode: this.isBotMode, botBoard: this.botBoard ? 'OK' : 'NULL' });
        
        if (!this.isBotMode || !this.botBoard) {
            console.error('[BOT MOVE] Cannot make move - isBotMode:', this.isBotMode, 'botBoard:', this.botBoard);
            return;
        }
        
        if (this.gameEnded) {
            console.log('[BOT MOVE] Game already ended');
            return;
        }
        
        // Check bounds
        if (x < 0 || y < 0 || x >= this.botBoard.gridSize || y >= this.botBoard.gridSize) {
            console.error('[BOT MOVE] Out of bounds:', x, y);
            return;
        }
        
        // Generate bot mines on first move if needed
        if (!this.botBoard.mines || this.botBoard.mines.length === 0) {
            const mineCount = this.pendingMineCount || 20;
            console.log('[BOT MOVE] Generating mines for bot board:', mineCount);
            this.botBoard.generateMines(mineCount, x, y);
        }
        
        const revealed = this.botBoard.revealCell(x, y);
        this.botBoard.render();
        
        console.log('[BOT MOVE] Revealed cells:', revealed?.length || 0);
        
        // Calculate bot score - same as player: +5 for each revealed safe cell, -30 for mine
        let points = 0;
        let hitMine = false;
        
        // Count all revealed cells (like player scoring)
        if (revealed && revealed.length > 0) {
            revealed.forEach(c => {
                if (c.isMine) {
                    hitMine = true;
                    points -= 30;
                } else {
                    points += 5;
                }
            });
        }
        
        console.log('[BOT MOVE] Points:', points, 'Hit mine:', hitMine);
        
        this.opponentScore = Math.max(0, this.opponentScore + points);
        this.updateScore();
        
        // ==================== BOT HAMLESİ VERİ KAYDET ====================
        dataCollector.recordMove({
            player: 'player2',  // Bot
            type: 'reveal',
            x: x,
            y: y,
            result: hitMine ? 'mine' : (revealed.length > 1 ? 'cascade' : 'safe'),
            cellValue: hitMine ? -1 : (this.botBoard.grid[y][x].neighborCount || 0),
            cellsRevealed: revealed.length,
            scoreBefore: this.opponentScore - points,
            scoreChange: points,
            currentScore: this.opponentScore,
            opponentScore: this.score,
            // Bot'un karar bilgisi - yeni BotCore için uyarlandı
            wasKnownSafe: this.bot?.visibleState?.revealedCells?.has(`${x},${y}`) || false,
            includeSnapshot: revealed.length > 3 || hitMine, // Önemli anlarda snapshot
            board: this.botBoard
        });
        
        if (hitMine) {
            this.opponentMineHitCount++;
            this.audio.playMine();
        } else if (points > 0) {
            this.audio.playReveal(revealed.length);
        }
        
        // Check if bot completed board (3 or fewer mine hits AND board completed)
        this.checkBotWinCondition();
    }
    
    makeBotFlag(x, y) {
        if (!this.isBotMode || !this.botBoard || this.gameEnded) return;
        
        // Check if bot is frozen
        if (this.opponentFreezeUntil && Date.now() < this.opponentFreezeUntil) {
            return;
        }
        
        const cell = this.botBoard.grid[y][x];
        
        // Can only flag unrevealed, unflagged cells
        if (cell.isRevealed || cell.isFlagged) return;
        
        // Flag the cell
        cell.isFlagged = true;
        this.botBoard.render();
        
        // Play flag sound (use cell click as fallback)
        if (this.audio?.playCellClick) {
            this.audio.playCellClick();
        }
        
        // Check if bot completed board
        this.checkBotWinCondition();
    }
    
    // Remove flag from bot's board (for bot AI to correct wrong flags)
    makeBotUnflag(x, y) {
        if (!this.isBotMode || !this.botBoard || this.gameEnded) return false;
        
        const cell = this.botBoard.grid[y][x];
        
        // Can only unflag flagged cells
        if (!cell.isFlagged) return false;
        
        // Remove the flag
        cell.isFlagged = false;
        this.botBoard.render();
        
        console.log('[BOT] Unflagged cell at:', x, y);
        return true;
    }
    
    // Bot tahtayı tamamladığında
    // KURAL: Bot 2 veya daha az mayına bastıysa = Oyun biter, skorlar karşılaştırılır
    // KURAL: Bot 3+ mayına bastıysa = Süre bitene kadar veya oyuncu bitirene kadar bekle
    checkBotWinCondition() {
        if (this.gameEnded) return;
        
        // Check if bot's board is completed
        if (this.botBoard && this.botBoard.checkBoardCompleted()) {
            console.log('[BOT] Bot tahtayı tamamladı!');
            console.log('[BOT] Bot skor:', this.opponentScore, 'Oyuncu skor:', this.score);
            console.log('[BOT] Bot mayın sayısı:', this.opponentMineHitCount);
            
            // Bot tahtayı tamamladı olarak işaretle
            this.opponentCompletedBoard = true;
            
            // Bot'u durdur
            this.bot?.stop();
            
            // KURAL: 2 veya daha az mayına bastıysa = Oyun biter
            if (this.opponentMineHitCount <= 2) {
                console.log('[BOT] Bot completed with', this.opponentMineHitCount, 'mine hits (<=2) - game ends!');
                
                // Eğer oyuncu da tahtayı tamamladıysa, karşılaştır
                if (this.playerCompletedBoard) {
                    this.compareAndEndGame();
                } else {
                    // Bot tamamladı, oyuncu tamamlamadı - skorlar karşılaştırılır
                    if (this.opponentScore > this.score) {
                        this.showNotification('🤖 Bot tahtayı tamamladı ve kazandı!', 'error');
                        this.endGame(false);
                    } else if (this.opponentScore === this.score) {
                        this.showNotification('🤝 Berabere!', 'info');
                        this.endGame(false);
                    } else {
                        // Oyuncu skoru daha yüksek - oyuncu kazandı
                        this.showNotification('🎉 Bot tamamladı ama sen öndesin - Kazandın!', 'success');
                        this.endGame(true);
                    }
                }
            } else {
                // Bot 3+ mayına bastı - süre bitene kadar veya oyuncu bitirene kadar bekle
                console.log('[BOT] Bot completed but hit', this.opponentMineHitCount, 'mines (>2) - waiting for timer or player');
                this.showNotification('🤖 Bot tahtayı tamamladı (3+ mayın)! Sen oynamaya devam et.', 'warning');
                
                // Eğer oyuncu da tahtayı tamamladıysa, karşılaştır
                if (this.playerCompletedBoard) {
                    this.compareAndEndGame();
                }
                // Aksi halde oyuncu oynamaya devam eder
            }
        }
    }
    
    // İki taraf da tamamladığında veya süre bittiğinde
    compareAndEndGame() {
        if (this.gameEnded) return;
        
        const botWins = this.opponentScore > this.score;
        const isDraw = this.opponentScore === this.score;
        
        if (isDraw) {
            this.showNotification('🤝 Berabere!', 'warning');
        } else if (botWins) {
            this.showNotification('🤖 Bot kazandı!', 'error');
        } else {
            this.showNotification('🎉 Sen kazandın!', 'success');
        }
        
        setTimeout(() => {
            this.endGame(!botWins && !isDraw);
        }, 500);
    }
    
    useBotPower(power, cost) {
        console.log('[BOT POWER] useBotPower called:', { power, cost, isBotMode: this.isBotMode, score: this.opponentScore });
        
        if (!this.isBotMode) {
            console.log('[BOT POWER] Not in bot mode');
            return false;
        }
        
        // Bot can only use powers if they have score
        if (this.opponentScore < cost) {
            console.log('[BOT POWER] Not enough score:', this.opponentScore, '<', cost);
            return false;
        }
        
        // Check if bot has uses left
        if (!this.botPowerUsesLeft || this.botPowerUsesLeft[power] <= 0) {
            console.log('[BOT POWER] No uses left:', this.botPowerUsesLeft);
            return false;
        }
        
        // ==================== VERİ KAYDET ====================
        const scoreBefore = this.opponentScore;
                console.log('[BOT POWER] Using power:', power);
        console.log('[BOT POWER] Before deduction - botPowerUsesLeft:', JSON.stringify(this.botPowerUsesLeft));
        
        // Deduct cost from bot's score
        this.opponentScore -= cost;
        
        // Deduct usage from bot's power uses
        this.botPowerUsesLeft[power]--;
        
        console.log('[BOT POWER] After deduction - botPowerUsesLeft:', JSON.stringify(this.botPowerUsesLeft));
        
        this.updateScore();
        
        // Show notification
        const powerNames = {
            'freeze': '❄️ DONDURMA',
            'shield': '🛡️ KALKAN',
            'radar': '📡 RADAR',
            'safeburst': '💥 GÜVENLİ PATLAMA'
        };
        this.showNotification(`🤖 Bot ${powerNames[power] || power.toUpperCase()} kullandı!`, 'warning');
        
        // Apply power effects
        if (power === 'freeze') {
            // Bot freezes the player - 5 second freeze
            this.isFrozen = true;
            this.frozenUntil = Date.now() + 5000;
            this.handleFrozen(5000);
            this.showPowerNotificationSimple('freeze', 'Bot seni dondurdu!');
            console.log('[BOT POWER] Freeze applied - player frozen until:', new Date(this.frozenUntil));
        } else if (power === 'shield') {
            // Bot gets shield
            this.opponentHasShield = true;
            this.opponentShieldUntil = Date.now() + 30000;
            this.showOpponentPowerEffect('shield');
            console.log('[BOT POWER] Shield applied to bot');
            
            setTimeout(() => {
                this.opponentHasShield = false;
            }, 30000);
        } else if (power === 'radar') {
            // Bot uses radar on its own board - this helps bot avoid mines
            // Make sure mines are generated first
            if (this.botBoard && (!this.botBoard.mines || this.botBoard.mines.length === 0)) {
                const mineCount = this.pendingMineCount || 20;
                console.log('[BOT POWER] Radar - generating mines first:', mineCount);
                const randX = Math.floor(Math.random() * this.botBoard.gridSize);
                const randY = Math.floor(Math.random() * this.botBoard.gridSize);
                this.botBoard.generateMines(mineCount, randX, randY);
            }
            
            if (this.botBoard && typeof this.botBoard.highlightRandomMines === 'function') {
                const mines = this.botBoard.highlightRandomMines(3);
                console.log('[BOT POWER] Radar revealed mines:', mines);
                
                // BOT'A MAYINLARI BİLDİR - böylece bayraklayabilsin
                if (this.bot && mines && mines.length > 0) {
                    this.bot.receiveRadarResults(mines);
                }
            }
            this.showOpponentPowerEffect('radar');
        } else if (power === 'safeburst') {
            // Bot uses safeburst on its own board
            console.log('[BOT POWER] SafeBurst - checking botBoard:', !!this.botBoard);
            console.log('[BOT POWER] SafeBurst - mines generated:', this.botBoard?.mines?.length || 0);
            
            // Make sure mines are generated first
            if (this.botBoard && (!this.botBoard.mines || this.botBoard.mines.length === 0)) {
                const mineCount = this.pendingMineCount || 20;
                console.log('[BOT POWER] SafeBurst - generating mines first:', mineCount);
                // Generate mines at a random safe position
                const randX = Math.floor(Math.random() * this.botBoard.gridSize);
                const randY = Math.floor(Math.random() * this.botBoard.gridSize);
                this.botBoard.generateMines(mineCount, randX, randY);
            }
            
            if (this.botBoard && typeof this.botBoard.safeBurst === 'function') {
                console.log('[BOT POWER] SafeBurst - calling safeBurst(3)');
                const result = this.botBoard.safeBurst(3);
                console.log('[BOT POWER] SafeBurst result:', result);
                
                if (result && result.points > 0) {
                    this.opponentScore += result.points;
                    this.updateScore();
                    console.log('[BOT POWER] SafeBurst revealed cells:', result.cellsRevealed, 'points:', result.points);
                } else {
                    console.log('[BOT POWER] SafeBurst no points - result:', result);
                }
                
                // Force re-render the bot board
                this.botBoard.render();
                
                // Check if bot completed board after safeburst
                this.checkBotWinCondition();
            } else {
                console.log('[BOT POWER] SafeBurst - function not available!');
            }
            this.showOpponentPowerEffect('safeburst');
        }
        
        // ==================== GÜÇ KULLANIMI VERİ KAYDET ====================
        dataCollector.recordPowerUsage({
            player: 'player2',  // Bot
            powerType: power,
            cost: cost,
            scoreBefore: scoreBefore,
            scoreAfter: this.opponentScore,
            opponentScore: this.score,
            // Bot'un güç kullanım nedeni - yeni BotCore için uyarlandı
            reason: this.bot?.powerUsage?.[power] ? 
                `Used: ${this.bot.powerUsage[power]} | Phase: ${this.bot?.gameState?.phase}` : null,
            // Ek efekt bilgisi
            effect: power === 'radar' ? { minesFound: 3 } : 
                   power === 'safeburst' ? { cellsRevealed: 3 } : null,
            board: this.botBoard
        });
        
        return true;
    }

    // ==================== GAME END ====================

    endGame(completedBoard = false) {
        // Prevent multiple endGame calls
        if (this.gameEnded) return;
        this.gameEnded = true;
        this.iCompletedBoard = completedBoard;
        
        // Stop bot if in bot mode
        if (this.isBotMode && this.bot) {
            this.bot.stop();
        }
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Hide nav timer
        const navTimer = document.getElementById('nav-timer');
        if (navTimer) navTimer.classList.add('hidden');
        
        // Broadcast game end with my final score and completion status (skip for bot mode)
        if (this.gameChannel && !this.isBotMode) {
            this.gameChannel.send({
                type: 'broadcast',
                event: 'gameEnd',
                payload: { 
                    odaUserId: this.odaUserId,
                    myFinalScore: this.score,
                    completedBoard: completedBoard
                }
            });
        }
        
        // Show result with a very short delay to allow score sync
        setTimeout(() => {
            this.showGameResult();
        }, 150);
    }
    
    showGameResult() {
        // EN YÜKSEK PUAN KAZANIR - basit mantık
        let isWinner, isDraw;
        
        console.log('[RESULT] Final Scores - Player:', this.score, 'Opponent:', this.opponentScore);
        
        // Sadece puan bazlı kazanan
        isWinner = this.score > this.opponentScore;
        isDraw = this.score === this.opponentScore;
        
        // ==================== VERİ KAYIT SONLANDIR ====================
        const winReason = this.iCompletedBoard ? 'completion' : 
                         this.opponentCompletedBoard ? 'opponent_completion' : 'score';
        
        dataCollector.endRecording({
            winner: isDraw ? 'draw' : (isWinner ? 'player1' : 'player2'),
            winReason: winReason,
            player1Score: this.score,
            player2Score: this.opponentScore,
            minePositions: this.playerBoard?.mines?.map(m => ({ x: m.x, y: m.y })) || []
        });
        
        // Bot learning: record game result with full data
        if (this.isBotMode && this.bot && typeof this.bot.endGameLearning === 'function') {
            // Bot wins if player loses (isWinner is from player perspective)
            const botWon = !isWinner && !isDraw;
            this.bot.endGameLearning(botWon, this.score, this.opponentScore, isDraw);
        }
        
        if (isDraw) {
            this.resultIcon.textContent = '🤝';
            this.resultTitle.textContent = 'Berabere!';
            this.resultTitle.className = 'result-title draw';
        } else if (isWinner) {
            this.resultIcon.textContent = '🏆';
            this.resultTitle.textContent = this.iCompletedBoard ? 'Mayın Ustası!' : 'Zafer!';
            this.resultTitle.className = 'result-title victory';
            this.audio.playVictory();
        } else {
            this.resultIcon.textContent = '💔';
            // More descriptive defeat message
            let defeatMsg = 'Yenilgi';
            if (this.opponentCompletedBoard) {
                defeatMsg = 'Rakip Tahtayı Tamamladı!';
            } else if (this.opponentScore > this.score) {
                defeatMsg = 'Puan Yetmedi!';
            }
            this.resultTitle.textContent = defeatMsg;
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

    // Calculate player's board completion percentage
    calculatePlayerCompletion() {
        if (!this.playerBoard || !this.playerBoard.grid) return 0;
        
        let revealed = 0;
        let totalSafe = 0;
        
        for (let y = 0; y < this.playerBoard.gridSize; y++) {
            for (let x = 0; x < this.playerBoard.gridSize; x++) {
                const cell = this.playerBoard.grid[y][x];
                if (!cell.isMine) {
                    totalSafe++;
                    if (cell.isRevealed) revealed++;
                }
            }
        }
        
        return totalSafe > 0 ? (revealed / totalSafe) * 100 : 0;
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
        
        // When going back to menu, clean up game state completely
        if (name === 'menu') {
            console.log('[GAME] Returning to menu, cleaning up...');
            
            // Stop bot if running
            if (this.bot) {
                this.bot.stop();
                this.bot = null;
                console.log('[GAME] Bot stopped');
            }
            
            // Clear ALL game timers
            if (this.gameTimer) {
                clearInterval(this.gameTimer);
                this.gameTimer = null;
            }
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            // Reset ALL game state
            this.gameEnded = true;
            this.isBotMode = false;
            this.botBoard = null;
            this.opponentCompletedBoard = false;
            this.iCompletedBoard = false;
            this.mineHitCount = 0;
            this.opponentMineHitCount = 0;
            this.score = 0;
            this.opponentScore = 0;
            
            console.log('[GAME] Cleanup complete');
        }
        
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
