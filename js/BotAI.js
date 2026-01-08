// Bot AI for MineDuel - Simple Algorithm Based
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
    }

    getMoveDelay() {
        // Random delay to simulate human thinking
        switch (this.difficulty) {
            case 'easy':
                return { min: 1000, max: 2500 };
            case 'medium':
                return { min: 600, max: 1500 };
            case 'hard':
                return { min: 300, max: 800 };
            default:
                return { min: 600, max: 1500 };
        }
    }

    getPowerUsageChance() {
        switch (this.difficulty) {
            case 'easy':
                return 0.1; // 10% chance
            case 'medium':
                return 0.2; // 20% chance
            case 'hard':
                return 0.3; // 30% chance
            default:
                return 0.2;
        }
    }

    start(board, gridSize) {
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        
        // Wait a bit before first move
        setTimeout(() => {
            this.makeMove();
        }, this.getRandomDelay());
    }

    stop() {
        this.isActive = false;
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
        
        this.isThinking = true;
        this.game.showBotThinking();

        // Wait for thinking animation
        await new Promise(resolve => setTimeout(resolve, this.getRandomDelay()));

        if (!this.isActive) {
            this.isThinking = false;
            return;
        }

        // Decide: use power or make move?
        if (Math.random() < this.powerUsageChance && this.shouldUsePower()) {
            this.usePowerRandomly();
        } else {
            const move = this.findBestMove();
            if (move) {
                this.game.makeBotMove(move.x, move.y);
            }
        }

        this.isThinking = false;
        this.game.hideBotThinking();

        // Schedule next move
        if (this.isActive) {
            this.moveInterval = setTimeout(() => {
                this.makeMove();
            }, this.getRandomDelay());
        }
    }

    findBestMove() {
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
        const powers = ['radar', 'safeburst', 'shield'];
        for (const power of powers) {
            const cost = this.game.CONFIG?.POWER_COSTS?.[power] || 999;
            const usesLeft = this.game.powerUsesLeft?.[power] || 0;
            if (this.game.score >= cost && usesLeft > 0) {
                return true;
            }
        }
        return false;
    }

    usePowerRandomly() {
        const availablePowers = [];
        
        // Check which powers are available
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
        const usesLeft = this.game.powerUsesLeft?.[power] || 0;
        return this.game.score >= cost && usesLeft > 0;
    }
}
