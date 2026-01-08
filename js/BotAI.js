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
        if (!this.isActive || this.isThinking) return;
        
        // Check if board exists
        if (!this.board || !this.board.grid) {
            console.error('[BotAI] Board or grid is null!');
            return;
        }
        
        // Check if game ended
        if (this.game.gameEnded) {
            this.stop();
            return;
        }
        
        // Check if bot is frozen
        if (this.isFrozen && Date.now() < this.frozenUntil) {
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

            // Smart decision making - prioritize winning
            this.makeSmartDecision();
            
        } catch (error) {
            console.error('[BotAI] Error in makeMove:', error);
        }

        this.isThinking = false;
        this.game.hideBotThinking();
        this.game.hideBotThinking();

        // Schedule next move
        if (this.isActive && !this.game.gameEnded) {
            this.moveInterval = setTimeout(() => {
                this.makeMove();
            }, this.getRandomDelay());
        }
    }
    
    // Find cells that are definitely mines - use this to AVOID them, not flag them
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
                    // All these cells are mines - AVOID them!
                    definiteMines.push(...unrevealedUnflagged);
                }
            }
        }
        
        // Remove duplicates
        const unique = new Set();
        for (const m of definiteMines) {
            unique.add(`${m.x},${m.y}`);
        }
        
        return unique; // Return as Set for easy lookup
    }
    
    // Smart decision making - "En çok puanı olan kazanır" bilinci
    makeSmartDecision() {
        const botScore = this.game.opponentScore || 0;
        const playerScore = this.game.score || 0;
        const scoreDiff = botScore - playerScore;
        
        // 1. ALWAYS prioritize revealing safe cells to gain points
        const safeCells = this.findSafeCellsFromDeduction();
        if (safeCells.length > 0) {
            const cell = this.pickRandom(safeCells);
            this.game.makeBotMove(cell.x, cell.y);
            return;
        }
        
        // 2. Only use powers strategically (not randomly!)
        if (this.shouldUseStrategicPower(scoreDiff)) {
            this.useStrategicPower(scoreDiff);
            return;
        }
        
        // 3. Make the best available move
        const move = this.findBestMove();
        if (move) {
            this.game.makeBotMove(move.x, move.y);
            return;
        }
        
        // 4. If no moves, try any unrevealed cell
        const allUnrevealed = this.getAllUnrevealedCells();
        if (allUnrevealed.length > 0) {
            const cell = this.pickRandom(allUnrevealed);
            this.game.makeBotMove(cell.x, cell.y);
        }
    }
    
    // Check if we should use a power strategically
    shouldUseStrategicPower(scoreDiff) {
        const botScore = this.game.opponentScore || 0;
        
        // Don't use powers if score is too low (save points!)
        if (botScore < 50) return false;
        
        // Random chance based on difficulty (but much lower than before)
        const useChance = this.powerUsageChance * 0.3; // Reduce by 70%
        if (Math.random() > useChance) return false;
        
        // If we're losing by a lot, DON'T use powers - save points!
        if (scoreDiff < -30) return false;
        
        // If we're winning by a lot, maybe use freeze to maintain lead
        if (scoreDiff > 50 && this.canUsePower('freeze')) return true;
        
        // Only use power if we have a significant lead or it's strategic
        return scoreDiff > 20;
    }
    
    // Use power strategically based on game state
    useStrategicPower(scoreDiff) {
        const botScore = this.game.opponentScore || 0;
        
        // Priority: freeze (if winning) > safeburst (if need points) > shield (if player might freeze us)
        
        // If winning by a lot, freeze opponent to maintain lead
        if (scoreDiff > 30 && this.canUsePower('freeze')) {
            const cost = this.game.CONFIG?.POWER_COSTS?.freeze || 30;
            if (botScore > cost + 20) { // Keep 20 point buffer
                this.game.useBotPower('freeze', cost);
                return;
            }
        }
        
        // Use shield only if we have a lot of points to protect
        if (botScore > 80 && this.canUsePower('shield')) {
            const cost = this.game.CONFIG?.POWER_COSTS?.shield || 25;
            if (botScore > cost + 30) {
                this.game.useBotPower('shield', cost);
                return;
            }
        }
        
        // Use safeburst only if stuck (no safe cells found)
        const safeCells = this.findSafeCellsFromDeduction();
        if (safeCells.length === 0 && this.canUsePower('safeburst')) {
            const cost = this.game.CONFIG?.POWER_COSTS?.safeburst || 35;
            if (botScore > cost + 20) {
                this.game.useBotPower('safeburst', cost);
                return;
            }
        }
    }

    findBestMove() {
        // Get known mine locations to avoid them
        const knownMines = this.findDefiniteMines();
        
        // Mistake chance - sometimes make a random move instead of optimal
        // But NEVER click on known mines even when making mistakes
        if (Math.random() < this.mistakeChance) {
            const allUnrevealed = this.getAllUnrevealedCells();
            const safeMoves = allUnrevealed.filter(c => !knownMines.has(`${c.x},${c.y}`));
            if (safeMoves.length > 0) {
                return this.pickRandom(safeMoves);
            }
        }
        
        // Strategy priority:
        // 1. Find guaranteed safe cells (from revealed numbers)
        // 2. Find corner/edge cells (statistically safer, avoid known mines)
        // 3. Random cell (avoid known mines)

        // Priority 1: Safe cells from deduction
        const safeCells = this.findSafeCellsFromDeduction();
        if (safeCells.length > 0) {
            return this.pickRandom(safeCells);
        }

        // Priority 2: Corner cells (if not revealed and not known mine)
        const cornerCells = this.getCornerCells().filter(c => !knownMines.has(`${c.x},${c.y}`));
        if (cornerCells.length > 0 && Math.random() > 0.5) {
            return this.pickRandom(cornerCells);
        }

        // Priority 3: Edge cells (avoid known mines)
        const edgeCells = this.getEdgeCells().filter(c => !knownMines.has(`${c.x},${c.y}`));
        if (edgeCells.length > 0 && Math.random() > 0.3) {
            return this.pickRandom(edgeCells);
        }

        // Priority 4: Any unrevealed cell (AVOID known mines!)
        const allUnrevealed = this.getAllUnrevealedCells();
        const safeMoves = allUnrevealed.filter(c => !knownMines.has(`${c.x},${c.y}`));
        if (safeMoves.length > 0) {
            return this.pickRandom(safeMoves);
        }
        
        // If all remaining cells are known mines, pick any (will hit mine but no choice)
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
