// Bot AI for MineDuel - Smart Algorithm Based
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
        
        // Difficulty settings
        this.settings = this.getDifficultySettings();
        console.log(`[BotAI] Created with difficulty: ${difficulty}`);
    }

    getDifficultySettings() {
        switch (this.difficulty) {
            case 'easy':
                return {
                    minDelay: 2000,
                    maxDelay: 4000,
                    mistakeChance: 0.35,    // 35% chance to make suboptimal move
                    powerUsageChance: 0.03  // Very rare power usage
                };
            case 'medium':
                return {
                    minDelay: 1200,
                    maxDelay: 2500,
                    mistakeChance: 0.20,
                    powerUsageChance: 0.05
                };
            case 'hard':
                return {
                    minDelay: 600,
                    maxDelay: 1200,
                    mistakeChance: 0.08,
                    powerUsageChance: 0.08
                };
            case 'expert':
                return {
                    minDelay: 300,
                    maxDelay: 700,
                    mistakeChance: 0.02,    // Almost perfect
                    powerUsageChance: 0.10
                };
            default:
                return {
                    minDelay: 1200,
                    maxDelay: 2500,
                    mistakeChance: 0.20,
                    powerUsageChance: 0.05
                };
        }
    }

    start(board, gridSize) {
        console.log('[BotAI] Starting bot...');
        
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        this.isThinking = false;
        
        if (!this.board || !this.board.grid) {
            console.error('[BotAI] Board is null, cannot start!');
            return;
        }
        
        // Wait before first move
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

    getRandomDelay() {
        const { minDelay, maxDelay } = this.settings;
        return Math.floor(Math.random() * (maxDelay - minDelay) + minDelay);
    }

    scheduleNextMove() {
        if (!this.isActive || this.game.gameEnded) return;
        
        this.moveInterval = setTimeout(() => {
            this.makeMove();
        }, this.getRandomDelay());
    }

    async makeMove() {
        // Safety checks
        if (!this.isActive || this.isThinking || this.game.gameEnded) {
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
        
        // Check if game should end (no more valid moves)
        if (this.shouldStopPlaying()) {
            console.log('[BotAI] No more valid moves, stopping');
            this.stop();
            return;
        }
        
        this.isThinking = true;
        this.game.showBotThinking();

        try {
            // Small delay for "thinking"
            await new Promise(resolve => setTimeout(resolve, 300));
            
            if (!this.isActive || this.game.gameEnded) {
                this.isThinking = false;
                this.game.hideBotThinking();
                return;
            }
            
            // Make a smart decision
            const move = this.findSmartMove();
            
            if (move) {
                this.game.makeBotMove(move.x, move.y);
            } else {
                console.log('[BotAI] No valid move found');
            }
            
        } catch (error) {
            console.error('[BotAI] Error:', error);
        }

        this.isThinking = false;
        this.game.hideBotThinking();

        // Schedule next move
        if (this.isActive && !this.game.gameEnded) {
            this.scheduleNextMove();
        }
    }
    
    // Check if bot should stop playing
    shouldStopPlaying() {
        if (!this.board || !this.board.grid) return true;
        
        // Count unrevealed safe cells
        let unrevealedSafeCells = 0;
        let totalMines = 0;
        let revealedMines = 0;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (cell.isMine) {
                    totalMines++;
                    if (cell.isRevealed) revealedMines++;
                } else if (!cell.isRevealed) {
                    unrevealedSafeCells++;
                }
            }
        }
        
        // Stop if all safe cells are revealed
        if (unrevealedSafeCells === 0) {
            console.log('[BotAI] All safe cells revealed');
            return true;
        }
        
        // Stop if all mines are revealed (game should be over)
        if (revealedMines === totalMines && totalMines > 0) {
            console.log('[BotAI] All mines revealed');
            return true;
        }
        
        return false;
    }
    
    // Find the smartest move possible
    findSmartMove() {
        // 1. First, find all cells that are DEFINITELY safe
        const safeCells = this.findGuaranteedSafeCells();
        
        if (safeCells.length > 0) {
            // Pick a safe cell (prefer ones that might reveal more)
            return this.pickBestSafeCell(safeCells);
        }
        
        // 2. Find cells that are DEFINITELY mines (to avoid them)
        const knownMines = this.findKnownMines();
        
        // 3. Get all unrevealed cells that are NOT known mines
        const possibleMoves = this.getAllUnrevealedCells().filter(cell => {
            return !knownMines.has(`${cell.x},${cell.y}`);
        });
        
        if (possibleMoves.length === 0) {
            // All remaining cells are mines, no valid move
            return null;
        }
        
        // 4. Apply mistake chance for non-expert bots
        if (Math.random() < this.settings.mistakeChance) {
            // Make a random move from possible moves
            return this.pickRandom(possibleMoves);
        }
        
        // 5. Prioritize safer cells (corners and edges are statistically safer)
        return this.pickSafestCell(possibleMoves);
    }
    
    // Find cells that are 100% guaranteed safe
    findGuaranteedSafeCells() {
        const safeCells = [];
        const checked = new Set();
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                
                // Only look at revealed numbered cells
                if (!cell.isRevealed || cell.isMine) continue;
                
                const neighbors = this.getNeighbors(x, y);
                const unrevealedNeighbors = neighbors.filter(n => 
                    !this.board.grid[n.y][n.x].isRevealed
                );
                const flaggedNeighbors = neighbors.filter(n => 
                    this.board.grid[n.y][n.x].isFlagged
                );
                
                // If all mines around this cell are accounted for, 
                // remaining unrevealed cells are safe
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
                
                // If cell shows 0, all neighbors are safe
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
    
    // Find cells that are 100% definitely mines
    findKnownMines() {
        const knownMines = new Set();
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                
                // Only look at revealed numbered cells
                if (!cell.isRevealed || cell.isMine || cell.neighborCount === 0) continue;
                
                const neighbors = this.getNeighbors(x, y);
                const unrevealedNeighbors = neighbors.filter(n => 
                    !this.board.grid[n.y][n.x].isRevealed && !this.board.grid[n.y][n.x].isFlagged
                );
                const flaggedCount = neighbors.filter(n => 
                    this.board.grid[n.y][n.x].isFlagged
                ).length;
                
                const remainingMines = cell.neighborCount - flaggedCount;
                
                // If unrevealed count equals remaining mines, all are mines
                if (remainingMines > 0 && unrevealedNeighbors.length === remainingMines) {
                    for (const n of unrevealedNeighbors) {
                        knownMines.add(`${n.x},${n.y}`);
                    }
                }
            }
        }
        
        return knownMines;
    }
    
    // Pick the best safe cell (prefer cells that reveal more area)
    pickBestSafeCell(safeCells) {
        if (safeCells.length === 0) return null;
        
        // For expert bot, try to pick cells adjacent to 0 cells (will flood fill)
        if (this.difficulty === 'expert' || this.difficulty === 'hard') {
            for (const cell of safeCells) {
                const neighbors = this.getNeighbors(cell.x, cell.y);
                for (const n of neighbors) {
                    const nc = this.board.grid[n.y][n.x];
                    if (nc.isRevealed && nc.neighborCount === 0) {
                        return cell; // Adjacent to a 0, likely to reveal more
                    }
                }
            }
        }
        
        return this.pickRandom(safeCells);
    }
    
    // Pick the safest cell from possibilities (avoid cells near many mines)
    pickSafestCell(cells) {
        if (cells.length === 0) return null;
        
        // Score each cell by how safe it seems
        const scored = cells.map(cell => {
            let safetyScore = 0;
            
            // Corners are statistically safer
            const isCorner = (cell.x === 0 || cell.x === this.gridSize - 1) && 
                            (cell.y === 0 || cell.y === this.gridSize - 1);
            if (isCorner) safetyScore += 3;
            
            // Edges are somewhat safer
            const isEdge = cell.x === 0 || cell.x === this.gridSize - 1 || 
                          cell.y === 0 || cell.y === this.gridSize - 1;
            if (isEdge) safetyScore += 2;
            
            // Cells with revealed 0 neighbors are very safe
            const neighbors = this.getNeighbors(cell.x, cell.y);
            for (const n of neighbors) {
                const nc = this.board.grid[n.y][n.x];
                if (nc.isRevealed && nc.neighborCount === 0) {
                    safetyScore += 5; // Very likely safe
                }
                if (nc.isRevealed && !nc.isMine) {
                    safetyScore += 1; // Has revealed neighbors
                }
            }
            
            return { cell, score: safetyScore };
        });
        
        // Sort by safety score (highest first)
        scored.sort((a, b) => b.score - a.score);
        
        // Pick from top candidates with some randomness
        const topCount = Math.min(3, scored.length);
        const topCandidates = scored.slice(0, topCount);
        
        return this.pickRandom(topCandidates.map(s => s.cell));
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
    
    getAllUnrevealedCells() {
        const cells = [];
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
    
    pickRandom(array) {
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }
    
        canUsePower(power) {
        const cost = this.game.CONFIG?.POWER_COSTS?.[power] || 999;
        const botScore = this.game.opponentScore || 0;
        const usesLeft = this.game.botPowerUsesLeft?.[power] || 0;
        return botScore >= cost && usesLeft > 0;
    }
    
    // Called when player freezes the bot
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
}
