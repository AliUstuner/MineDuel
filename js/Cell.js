/**
 * Cell.js - Individual cell class for MineDuel Minesweeper
 * Represents a single cell in the minesweeper grid
 */

export class Cell {
    constructor(x, y) {
        this.x = x;                    // Grid X coordinate
        this.y = y;                    // Grid Y coordinate
        this.isMine = false;           // Whether this cell contains a mine
        this.isRevealed = false;       // Whether this cell has been opened
        this.isFlagged = false;        // Whether this cell is flagged (right-click)
        this.neighborCount = 0;        // Number of adjacent mines
        this.isHighlighted = false;    // For power effects (radar ping)
        this.highlightTimer = 0;       // Timer for highlight effects
    }

    /**
     * Set this cell as a mine
     */
    setMine() {
        this.isMine = true;
    }

    /**
     * Set the number of adjacent mines
     * @param {number} count - Number of adjacent mines (0-8)
     */
    setNeighborCount(count) {
        this.neighborCount = Math.max(0, Math.min(8, count));
    }

    /**
     * Reveal this cell
     * @returns {boolean} true if cell was successfully revealed, false if mine or already revealed
     */
    reveal() {
        if (this.isRevealed || this.isFlagged) {
            return false;
        }
        
        this.isRevealed = true;
        return true;
    }

    /**
     * Toggle flag state
     */
    toggleFlag() {
        if (!this.isRevealed) {
            this.isFlagged = !this.isFlagged;
        }
    }

    /**
     * Check if this cell can be opened
     * @returns {boolean} true if cell can be clicked/opened
     */
    canBeOpened() {
        return !this.isRevealed && !this.isFlagged;
    }

    /**
     * Highlight this cell temporarily (for radar power)
     * @param {number} duration - Highlight duration in milliseconds
     */
    highlight(duration = 3000) {
        this.isHighlighted = true;
        this.highlightTimer = duration;
    }

    /**
     * Update highlight timer
     * @param {number} deltaTime - Time elapsed in milliseconds
     */
    updateHighlight(deltaTime) {
        if (this.isHighlighted) {
            this.highlightTimer -= deltaTime;
            if (this.highlightTimer <= 0) {
                this.isHighlighted = false;
                this.highlightTimer = 0;
            }
        }
    }

    /**
     * Get the display character for this cell
     * @returns {string} Character to display on the cell
     */
    getDisplayCharacter() {
        if (this.isFlagged) {
            return '🚩';
        }
        
        if (!this.isRevealed) {
            return '';
        }
        
        if (this.isMine) {
            return '💣';
        }
        
        if (this.neighborCount === 0) {
            return '';
        }
        
        return this.neighborCount.toString();
    }

    /**
     * Get the color for the number display
     * @returns {string} CSS color for the number
     */
    getNumberColor() {
        const colors = {
            1: '#0000ff', // Blue
            2: '#008000', // Green
            3: '#ff0000', // Red
            4: '#800080', // Purple
            5: '#800000', // Maroon
            6: '#008080', // Teal
            7: '#000000', // Black
            8: '#808080'  // Gray
        };
        return colors[this.neighborCount] || '#000000';
    }

    /**
     * Get cell state for rendering
     * @returns {object} Object containing all rendering information
     */
    getRenderState() {
        return {
            x: this.x,
            y: this.y,
            isRevealed: this.isRevealed,
            isMine: this.isMine,
            isFlagged: this.isFlagged,
            isHighlighted: this.isHighlighted,
            neighborCount: this.neighborCount,
            displayChar: this.getDisplayCharacter(),
            numberColor: this.getNumberColor(),
            canOpen: this.canBeOpened()
        };
    }

    /**
     * Reset cell to initial state (for new game)
     */
    reset() {
        this.isMine = false;
        this.isRevealed = false;
        this.isFlagged = false;
        this.neighborCount = 0;
        this.isHighlighted = false;
        this.highlightTimer = 0;
    }

    /**
     * Create a copy of this cell (useful for networking later)
     * @returns {Cell} New cell instance with same state
     */
    clone() {
        const newCell = new Cell(this.x, this.y);
        newCell.isMine = this.isMine;
        newCell.isRevealed = this.isRevealed;
        newCell.isFlagged = this.isFlagged;
        newCell.neighborCount = this.neighborCount;
        newCell.isHighlighted = this.isHighlighted;
        newCell.highlightTimer = this.highlightTimer;
        return newCell;
    }
}