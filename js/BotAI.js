// Bot AI for MineDuel - Algorithm Based with Difficulty Levels
export class BotAI {
    constructor(game, difficulty = 'medium') {
        this.game = game;
        this.difficulty = difficulty;
        this.board = null;
        this.gridSize = 10;
        this.moveDelay = this.getMoveDelay();
        this.isThinking = false;
        this.moveInterval = null;
        this.powerUsageChance = this.getPowerUsageChance();
        this.mistakeChance = this.getMistakeChance();
        this.isFrozen = false;
        this.frozenUntil = 0;
        
        console.log(`[BotAI] Created with difficulty: ${difficulty}`);
    }

    getMoveDelay() {
        // Random delay to simulate human thinking - lower = faster
        switch (this.difficulty) {
            case 'easy':
                return { min: 2000, max: 4000 }; // Very slow
            case 'medium':
                return { min: 1200, max: 2500 }; // Normal
            case 'hard':
                return { min: 600, max: 1200 }; // Fast
            case 'expert':
                return { min: 300, max: 700 }; // Very fast
            default:
                return { min: 1200, max: 2500 };
        }
    }

    getPowerUsageChance() {
        switch (this.difficulty) {
            case 'easy':
                return 0.05; // 5% chance - rarely uses powers
            case 'medium':
                return 0.15; // 15% chance
            case 'hard':
                return 0.25; // 25% chance
            case 'expert':
                return 0.35; // 35% chance - uses powers often
            default:
                return 0.15;
        }
    }
    
    getMistakeChance() {
        // Chance of making a random move instead of optimal move
        switch (this.difficulty) {
            case 'easy':
                return 0.4; // 40% random moves
            case 'medium':
                return 0.2; // 20% random moves
            case 'hard':
                return 0.1; // 10% random moves
            case 'expert':
                return 0.02; // 2% random moves - almost perfect
            default:
                return 0.2;
        }
    }

    start(board, gridSize) {
        console.log('[BotAI] Starting bot...', { board: board ? 'OK' : 'NULL', gridSize });
        
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        this.isThinking = false;
        
        if (!this.board) {
            console.error('[BotAI] Board is null, cannot start!');
            return;
        }
        
        // Wait a bit before first move
        setTimeout(() => {
            console.log('[BotAI] Making first move...');
            this.makeMove();
        }, this.getRandomDelay());
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
        const { min, max } = this.moveDelay;
        return Math.floor(Math.random() * (max - min) + min);
    }

    async makeMove() {
        console.log('[BotAI] makeMove called', { isActive: this.isActive, isThinking: this.isThinking });
        
        if (!this.isActive || this.isThinking) {
            console.log('[BotAI] Skipping move - not active or already thinking');
            return;
        }
        
        // Check if board exists
        if (!this.board || !this.board.grid) {
            console.error('[BotAI] Board or grid is null!');
            return;
        }
        
        // Check if game ended
        if (this.game.gameEnded) {
            console.log('[BotAI] Game ended, stopping bot');
            this.stop();
            return;
        }
        
        // Check if bot is frozen
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            console.log('[BotAI] Bot is frozen, waiting...');
            const waitTime = this.frozenUntil - Date.now();
            this.moveInterval = setTimeout(() => {
                this.makeMove();
            }, waitTime + 100);
            return;
        }
        
        this.isThinking = true;
        this.game.showBotThinking();

        try {
            // Wait for thinking animation
            await new Promise(resolve => setTimeout(resolve, this.getRandomDelay()));

            if (!this.isActive || this.game.gameEnded) {
                this.isThinking = false;
                this.game.hideBotThinking();
                return;
            }

            let actionTaken = false;
            
            // Decide: use power, flag a mine, or make move?
            if (Math.random() < this.powerUsageChance && this.shouldUsePower()) {
                console.log('[BotAI] Using power...');
                this.usePowerRandomly();
                actionTaken = true;
            } else {
                // Try to flag definite mines first
                const definiteMinesToFlag = this.findDefiniteMines();
                if (definiteMinesToFlag.length > 0 && Math.random() > 0.3) {
                    const mine = this.pickRandom(definiteMinesToFlag);
                    if (mine) {
                        console.log('[BotAI] Flagging mine at', mine.x, mine.y);
                        this.game.makeBotFlag(mine.x, mine.y);
                        actionTaken = true;
                    }
                }
                
                if (!actionTaken) {
                    // Otherwise reveal safe cells
                    const move = this.findBestMove();
                    if (move) {
                        console.log('[BotAI] Revealing cell at', move.x, move.y);
                        this.game.makeBotMove(move.x, move.y);
                        actionTaken = true;
                    } else {
                        console.log('[BotAI] No valid move found!');
                    }
                }
            }
        } catch (error) {
            console.error('[BotAI] Error in makeMove:', error);
        }

        this.isThinking = false;
        this.game.hideBotThinking();

        // Schedule next move
        if (this.isActive && !this.game.gameEnded) {
            this.moveInterval = setTimeout(() => {
                this.makeMove();
            }, this.getRandomDelay());
        }
    }
    
    // Find cells that are definitely mines based on number analysis
    findDefiniteMines() {
        const definiteMines = [];
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                
                // Skip if not revealed or no neighbors
                if (!cell.isRevealed || cell.isMine || cell.neighborCount === 0) continue;
                
                // Get unrevealed and unflagged neighbors
                const neighbors = this.getNeighbors(x, y);
                const unrevealedUnflagged = neighbors.filter(n => {
                    const nc = this.board.grid[n.y][n.x];
                    return !nc.isRevealed && !nc.isFlagged;
                });
                const flaggedCount = neighbors.filter(n => 
                    this.board.grid[n.y][n.x].isFlagged
                ).length;
                
                // If remaining unrevealed count equals remaining mines needed
                const remainingMines = cell.neighborCount - flaggedCount;
                if (remainingMines > 0 && unrevealedUnflagged.length === remainingMines) {
                    // All these cells are mines!
                    definiteMines.push(...unrevealedUnflagged);
                }
            }
        }
        
        // Remove duplicates
        const unique = [];
        const seen = new Set();
        for (const m of definiteMines) {
            const key = `${m.x},${m.y}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(m);
            }
        }
        
        return unique;
    }

    findBestMove() {
        // Mistake chance - sometimes make a random move instead of optimal
        if (Math.random() < this.mistakeChance) {
            const allUnrevealed = this.getAllUnrevealedCells();
            if (allUnrevealed.length > 0) {
                console.log('[BotAI] Making random move (mistake)');
                return this.pickRandom(allUnrevealed);
            }
        }
        
        // Strategy priority:
        // 1. Find guaranteed safe cells (from revealed numbers)
        // 2. Find corner/edge cells (statistically safer)
        // 3. Random cell (avoid known flags)

        // Priority 1: Safe cells from deduction
        const safeCells = this.findSafeCellsFromDeduction();
        if (safeCells.length > 0) {
            return this.pickRandom(safeCells);
        }

        // Priority 2: Corner cells (if not revealed)
        const cornerCells = this.getCornerCells();
        if (cornerCells.length > 0 && Math.random() > 0.5) {
            return this.pickRandom(cornerCells);
        }

        // Priority 3: Edge cells
        const edgeCells = this.getEdgeCells();
        if (edgeCells.length > 0 && Math.random() > 0.3) {
            return this.pickRandom(edgeCells);
        }

        // Priority 4: Any unrevealed cell
        const allUnrevealed = this.getAllUnrevealedCells();
        if (allUnrevealed.length > 0) {
            return this.pickRandom(allUnrevealed);
        }

        return null;
    }

    findSafeCellsFromDeduction() {
        const safeCells = [];

        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                
                // Skip if not revealed or is a mine
                if (!cell.isRevealed || cell.isMine) continue;
                
                // If cell has 0 neighbors, all around are safe
                if (cell.neighborCount === 0) {
                    const neighbors = this.getUnrevealedNeighbors(x, y);
                    safeCells.push(...neighbors);
                    continue;
                }

                // Count flagged neighbors
                const neighbors = this.getNeighbors(x, y);
                const flaggedCount = neighbors.filter(n => 
                    this.board.grid[n.y][n.x].isFlagged
                ).length;

                // If all mines are flagged, remaining neighbors are safe
                if (flaggedCount === cell.neighborCount) {
                    const unrevealed = neighbors.filter(n => 
                        !this.board.grid[n.y][n.x].isRevealed && 
                        !this.board.grid[n.y][n.x].isFlagged
                    );
                    safeCells.push(...unrevealed);
                }
            }
        }

        return safeCells;
    }

    getUnrevealedNeighbors(x, y) {
        return this.getNeighbors(x, y).filter(n => 
            !this.board.grid[n.y][n.x].isRevealed
        );
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

    getCornerCells() {
        const corners = [
            { x: 0, y: 0 },
            { x: this.gridSize - 1, y: 0 },
            { x: 0, y: this.gridSize - 1 },
            { x: this.gridSize - 1, y: this.gridSize - 1 }
        ];
        return corners.filter(c => !this.board.grid[c.y][c.x].isRevealed);
    }

    getEdgeCells() {
        const edges = [];
        for (let i = 0; i < this.gridSize; i++) {
            // Top and bottom edges
            if (!this.board.grid[0][i].isRevealed) edges.push({ x: i, y: 0 });
            if (!this.board.grid[this.gridSize - 1][i].isRevealed) {
                edges.push({ x: i, y: this.gridSize - 1 });
            }
            // Left and right edges
            if (!this.board.grid[i][0].isRevealed) edges.push({ x: 0, y: i });
            if (!this.board.grid[i][this.gridSize - 1].isRevealed) {
                edges.push({ x: this.gridSize - 1, y: i });
            }
        }
        return edges;
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
        if (array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    shouldUsePower() {
        // Check if bot has enough score and power uses left
        // Bot uses opponentScore, not player's score
        const botScore = this.game.opponentScore || 0;
        const powers = ['freeze', 'radar', 'safeburst', 'shield'];
        for (const power of powers) {
            const cost = this.game.CONFIG?.POWER_COSTS?.[power] || 999;
            const usesLeft = this.game.botPowerUsesLeft?.[power] || 0;
            if (botScore >= cost && usesLeft > 0) {
                return true;
            }
        }
        return false;
    }

    usePowerRandomly() {
        const availablePowers = [];
        
        // Check which powers are available
        if (this.canUsePower('freeze')) availablePowers.push('freeze');
        if (this.canUsePower('radar')) availablePowers.push('radar');
        if (this.canUsePower('safeburst')) availablePowers.push('safeburst');
        if (this.canUsePower('shield')) availablePowers.push('shield');

        if (availablePowers.length === 0) return;

        // Pick random power
        const power = this.pickRandom(availablePowers);
        const cost = this.game.CONFIG?.POWER_COSTS?.[power] || 0;

        // Use the power through game interface
        this.game.useBotPower(power, cost);
    }

    canUsePower(power) {
        const cost = this.game.CONFIG?.POWER_COSTS?.[power] || 999;
        const botScore = this.game.opponentScore || 0;
        const usesLeft = this.game.botPowerUsesLeft?.[power] || 0;
        return botScore >= cost && usesLeft > 0;
    }
    
    freeze(duration = 5000) {
        this.isFrozen = true;
        this.frozenUntil = Date.now() + duration;
        
        // Show freeze indicator on opponent board
        const opponentFrozen = document.getElementById('opponent-frozen');
        const freezeTimer = document.getElementById('opponent-freeze-timer');
        
        if (opponentFrozen) {
            opponentFrozen.classList.remove('hidden');
        }
        
        // Update timer
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
                // Resume bot movement
                this.makeMove();
            }
        }, 100);
    }
}
