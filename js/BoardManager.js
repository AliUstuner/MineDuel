/**
 * BoardManager.js - Core minesweeper board logic for MineDuel
 * Handles grid creation, mine placement, neighbor calculation, and flood fill
 */

import { Cell } from './Cell.js';

export class BoardManager {
    constructor(canvas, gridSize = 10, mineCount = 15) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridSize = gridSize;           // Grid is gridSize x gridSize
        this.mineCount = mineCount;         // Number of mines to place
        this.grid = [];                     // 2D array of Cell objects
        this.cellSize = 0;                  // Size of each cell in pixels
        this.gameStarted = false;          // Whether first click has happened
        this.isDisabled = false;           // For sabotage powers
        this.disabledUntil = 0;            // Timestamp when disable ends
        
        this.initializeGrid();
        this.setupCanvas();
        this.bindEvents();
    }

    /**
     * Initialize the grid with empty cells
     */
    initializeGrid() {
        this.grid = [];
        for (let y = 0; y < this.gridSize; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.gridSize; x++) {
                this.grid[y][x] = new Cell(x, y);
            }
        }
        this.gameStarted = false;
    }

    /**
     * Setup canvas dimensions and cell size
     */
    setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.cellSize = Math.min(this.canvas.width, this.canvas.height) / this.gridSize;
        
        // Center the grid
        this.offsetX = (this.canvas.width - (this.cellSize * this.gridSize)) / 2;
        this.offsetY = (this.canvas.height - (this.cellSize * this.gridSize)) / 2;
    }

    /**
     * Bind mouse/touch events to canvas
     */
    bindEvents() {
        // Handle both mouse and touch events for mobile
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleRightClick(e);
        });
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            this.handleCellClick(x, y);
        });
    }

    /**
     * Handle mouse click events
     */
    handleClick(event) {
        if (this.isDisabled && Date.now() < this.disabledUntil) {
            return; // Board is disabled by sabotage power
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.handleCellClick(x, y);
    }

    /**
     * Handle right-click (flag) events
     */
    handleRightClick(event) {
        if (this.isDisabled && Date.now() < this.disabledUntil) {
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.handleCellFlag(x, y);
    }

    /**
     * Convert screen coordinates to grid coordinates
     */
    screenToGrid(screenX, screenY) {
        const gridX = Math.floor((screenX - this.offsetX) / this.cellSize);
        const gridY = Math.floor((screenY - this.offsetY) / this.cellSize);
        
        if (gridX >= 0 && gridX < this.gridSize && gridY >= 0 && gridY < this.gridSize) {
            return { x: gridX, y: gridY };
        }
        return null;
    }

    /**
     * Handle cell click logic
     */
    handleCellClick(screenX, screenY) {
        const gridPos = this.screenToGrid(screenX, screenY);
        if (!gridPos) return null;
        
        // Play click sound if audio manager is available
        if (window.game && window.game.audioManager) {
            window.game.audioManager.playCellClick();
        }

        const cell = this.grid[gridPos.y][gridPos.x];
        
        // First click: place mines and start game
        if (!this.gameStarted) {
            this.placeMines(gridPos.x, gridPos.y);
            this.calculateNeighborCounts();
            this.gameStarted = true;
        }

        return this.revealCell(gridPos.x, gridPos.y);
    }

    /**
     * Handle cell flag (right-click)
     */
    handleCellFlag(screenX, screenY) {
        const gridPos = this.screenToGrid(screenX, screenY);
        if (!gridPos) return;

        const cell = this.grid[gridPos.y][gridPos.x];
        cell.toggleFlag();
        this.render();
    }

    /**
     * Place mines randomly, avoiding the first click position and its neighbors
     */
    placeMines(firstClickX, firstClickY) {
        // Create list of safe positions (first click and its neighbors)
        const safePositions = new Set();
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = firstClickX + dx;
                const ny = firstClickY + dy;
                if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize) {
                    safePositions.add(`${nx},${ny}`);
                }
            }
        }

        // Create list of all possible positions
        const allPositions = [];
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (!safePositions.has(`${x},${y}`)) {
                    allPositions.push({ x, y });
                }
            }
        }

        // Randomly place mines
        const minePositions = this.shuffleArray(allPositions).slice(0, this.mineCount);
        minePositions.forEach(pos => {
            this.grid[pos.y][pos.x].setMine();
        });
    }

    /**
     * Set mines from predetermined positions (for server-verified games)
     * @param {Array} positions - Array of {x, y} objects representing mine positions
     */
    setMinesFromPositions(positions) {
        if (!positions || !Array.isArray(positions)) {
            console.error('[BoardManager] Invalid mine positions');
            return;
        }
        
        // Clear existing mines
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                this.grid[y][x].isMine = false;
            }
        }
        
        // Place mines at specified positions
        positions.forEach(pos => {
            if (pos.x >= 0 && pos.x < this.gridSize && pos.y >= 0 && pos.y < this.gridSize) {
                this.grid[pos.y][pos.x].setMine();
            }
        });
        
        // Recalculate neighbor counts
        this.calculateNeighborCounts();
        this.gameStarted = true;
        
        console.log(`[BoardManager] Set ${positions.length} mines from server positions`);
    }

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Calculate neighbor mine counts for all cells
     */
    calculateNeighborCounts() {
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (!this.grid[y][x].isMine) {
                    const count = this.countAdjacentMines(x, y);
                    this.grid[y][x].setNeighborCount(count);
                }
            }
        }
    }

    /**
     * Count mines in the 8-neighborhood of a cell
     */
    countAdjacentMines(x, y) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue; // Skip the cell itself
                
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize) {
                    if (this.grid[ny][nx].isMine) {
                        count++;
                    }
                }
            }
        }
        return count;
    }

    /**
     * Reveal a cell and handle flood fill for empty cells
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @returns {object} Result object with mine hit status and points scored
     */
    revealCell(x, y) {
        if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) {
            return { hitMine: false, points: 0, cellsRevealed: 0 };
        }

        const cell = this.grid[y][x];
        if (!cell.canBeOpened()) {
            return { hitMine: false, points: 0, cellsRevealed: 0 };
        }

        cell.reveal();
        let result = {
            hitMine: cell.isMine,
            points: cell.isMine ? 0 : (cell.neighborCount === 0 ? 1 : cell.neighborCount + 1),
            cellsRevealed: 1
        };

        // If it's a mine, stop here
        if (cell.isMine) {
            this.render();
            return result;
        }

        // If it's an empty cell (0 neighbors), flood fill
        if (cell.neighborCount === 0) {
            const floodResult = this.floodFill(x, y);
            result.points += floodResult.points;
            result.cellsRevealed += floodResult.cellsRevealed;
        }

        this.render();
        return result;
    }

    /**
     * Flood fill algorithm for revealing empty areas
     */
    floodFill(startX, startY) {
        const visited = new Set();
        const queue = [{ x: startX, y: startY }];
        let totalPoints = 0;
        let cellsRevealed = 0;

        while (queue.length > 0) {
            const { x, y } = queue.shift();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            visited.add(key);

            // Check all 8 neighbors
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;

                    const nx = x + dx;
                    const ny = y + dy;
                    const neighborKey = `${nx},${ny}`;

                    if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize && !visited.has(neighborKey)) {
                        const neighbor = this.grid[ny][nx];
                        
                        if (neighbor.canBeOpened() && !neighbor.isMine) {
                            neighbor.reveal();
                            cellsRevealed++;
                            totalPoints += neighbor.neighborCount === 0 ? 1 : neighbor.neighborCount + 1;

                            // Continue flood fill only for empty cells
                            if (neighbor.neighborCount === 0) {
                                queue.push({ x: nx, y: ny });
                            }
                        }
                    }
                }
            }
        }

        return { points: totalPoints, cellsRevealed };
    }

    /**
     * Auto-reveal safe cells (for Safe Burst power)
     * @param {number} maxCells - Maximum number of cells to reveal
     * @returns {object} Result with points and cells revealed
     */
    autoRevealSafeCells(maxCells = 3) {
        const safeCells = [];
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.grid[y][x];
                if (cell.canBeOpened() && !cell.isMine) {
                    safeCells.push({ x, y, cell });
                }
            }
        }

        // Sort by neighbor count (prefer cells with fewer neighbors for strategy)
        safeCells.sort((a, b) => a.cell.neighborCount - b.cell.neighborCount);

        let totalPoints = 0;
        let cellsRevealed = 0;
        const cellsToReveal = Math.min(maxCells, safeCells.length);

        for (let i = 0; i < cellsToReveal; i++) {
            const result = this.revealCell(safeCells[i].x, safeCells[i].y);
            totalPoints += result.points;
            cellsRevealed += result.cellsRevealed;
        }

        return { points: totalPoints, cellsRevealed };
    }

    /**
     * Highlight random mines (for Radar power)
     * @param {number} count - Number of mines to highlight
     */
    highlightRandomMines(count = 3) {
        const mines = [];
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.grid[y][x];
                if (cell.isMine && !cell.isRevealed) {
                    mines.push(cell);
                }
            }
        }

        const minesToHighlight = this.shuffleArray(mines).slice(0, count);
        minesToHighlight.forEach(mine => mine.highlight(3000)); // 3 second highlight
    }

    /**
     * Disable the board temporarily (for Freeze power)
     * @param {number} duration - Duration in milliseconds
     */
    disableBoard(duration) {
        this.isDisabled = true;
        this.disabledUntil = Date.now() + duration;
    }

    /**
     * Update board state (call every frame)
     * @param {number} deltaTime - Time since last update in milliseconds
     */
    update(deltaTime) {
        // Update cell highlights
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                this.grid[y][x].updateHighlight(deltaTime);
            }
        }

        // Check if board is still disabled
        if (this.isDisabled && Date.now() >= this.disabledUntil) {
            this.isDisabled = false;
        }
    }

    /**
     * Get game statistics
     */
    getStats() {
        let revealedCount = 0;
        let flaggedCount = 0;
        let totalSafeCells = this.gridSize * this.gridSize - this.mineCount;

        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.grid[y][x];
                if (cell.isRevealed && !cell.isMine) revealedCount++;
                if (cell.isFlagged) flaggedCount++;
            }
        }

        return {
            revealedSafeCells: revealedCount,
            totalSafeCells,
            flaggedCells: flaggedCount,
            totalMines: this.mineCount,
            completionPercentage: (revealedCount / totalSafeCells) * 100
        };
    }

    /**
     * Render the board to canvas
     */
    render() {
        const ctx = this.ctx;
        
        // Clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                this.renderCell(x, y);
            }
        }

        // Draw disabled overlay if board is disabled
        if (this.isDisabled && Date.now() < this.disabledUntil) {
            ctx.fillStyle = 'rgba(0, 100, 200, 0.5)';
            ctx.fillRect(this.offsetX, this.offsetY, 
                this.cellSize * this.gridSize, this.cellSize * this.gridSize);
            
            // Draw freeze icon
            ctx.fillStyle = 'white';
            ctx.font = `${this.cellSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❄️', 
                this.offsetX + (this.cellSize * this.gridSize) / 2,
                this.offsetY + (this.cellSize * this.gridSize) / 2);
        }
    }

    /**
     * Render individual cell
     */
    renderCell(x, y) {
        const ctx = this.ctx;
        const cell = this.grid[y][x];
        const cellX = this.offsetX + x * this.cellSize;
        const cellY = this.offsetY + y * this.cellSize;

        // Cell background
        if (cell.isRevealed) {
            if (cell.isMine) {
                ctx.fillStyle = '#ff6b6b'; // Red for mines
            } else {
                ctx.fillStyle = '#f0f0f0'; // Light gray for revealed
            }
        } else {
            ctx.fillStyle = cell.isHighlighted ? '#ffff00' : '#c0c0c0'; // Yellow for highlighted, gray for unrevealed
        }
        
        ctx.fillRect(cellX, cellY, this.cellSize, this.cellSize);

        // Cell border
        ctx.strokeStyle = '#808080';
        ctx.lineWidth = 1;
        ctx.strokeRect(cellX, cellY, this.cellSize, this.cellSize);

        // Cell content
        const displayChar = cell.getDisplayCharacter();
        if (displayChar) {
            ctx.fillStyle = cell.isRevealed && !cell.isMine ? cell.getNumberColor() : '#000000';
            ctx.font = `${this.cellSize * 0.6}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayChar, 
                cellX + this.cellSize / 2, 
                cellY + this.cellSize / 2);
        }
    }

    /**
     * Reset board for new game
     */
    reset() {
        this.initializeGrid();
        this.isDisabled = false;
        this.disabledUntil = 0;
        this.render();
    }
}