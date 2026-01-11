/**
 * DeterministicLayer.js - Guaranteed Minesweeper Deduction
 * 
 * This layer implements GUARANTEED moves using classic Minesweeper rules.
 * It uses Constraint Satisfaction Problem (CSP) techniques to find:
 * - Cells that are GUARANTEED to be safe
 * - Cells that are GUARANTEED to be mines
 * 
 * FAIRNESS: This layer ONLY uses visible information (revealed cells and their numbers).
 * It NEVER accesses hidden mine positions.
 * 
 * @version 1.0
 */

export class DeterministicLayer {
    constructor(botCore) {
        this.bot = botCore;
        
        // Cached analysis results
        this.safeCells = new Set();     // Guaranteed safe
        this.mineCells = new Set();     // Guaranteed mines
        this.constraints = [];          // Active constraints from numbered cells
    }
    
    /**
     * Reset layer state
     */
    reset() {
        this.safeCells.clear();
        this.mineCells.clear();
        this.constraints = [];
    }
    
    /**
     * Find all cells guaranteed to be safe
     * @returns {Array} Array of {x, y} positions
     */
    findSafeCells() {
        this.analyze();
        
        const result = [];
        for (const key of this.safeCells) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.bot.board?.grid?.[y]?.[x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                result.push({ x, y });
            }
        }
        return result;
    }
    
    /**
     * Find all cells guaranteed to be mines
     * @returns {Array} Array of {x, y} positions
     */
    findMineCells() {
        this.analyze();
        
        const result = [];
        for (const key of this.mineCells) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.bot.board?.grid?.[y]?.[x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                result.push({ x, y });
            }
        }
        
        // Include radar-revealed mines
        for (const key of this.bot.visibleState.radarMines) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.bot.board?.grid?.[y]?.[x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                if (!result.some(r => r.x === x && r.y === y)) {
                    result.push({ x, y });
                }
            }
        }
        
        return result;
    }
    
    /**
     * Main analysis function - builds constraints and solves
     */
    analyze() {
        if (!this.bot.board?.grid) return;
        
        this.safeCells.clear();
        this.mineCells.clear();
        this.constraints = [];
        
        // Build constraints from numbered cells
        this.buildConstraints();
        
        // Apply simple deduction rules first
        this.applySimpleRules();
        
        // Apply constraint subset analysis
        this.applySubsetRules();
        
        // Apply cross-reference analysis for complex patterns
        this.applyCrossReferenceAnalysis();
    }
    
    /**
     * Build constraints from all revealed numbered cells
     * Each constraint: {cells: Set, mineCount: number}
     */
    buildConstraints() {
        const gridSize = this.bot.gridSize;
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = this.bot.board.grid[y][x];
                
                // Only revealed cells with numbers create constraints
                if (!cell.isRevealed || cell.neighborCount === 0) continue;
                
                const neighbors = this.bot.getNeighbors(x, y);
                const hiddenCells = new Set();
                let flaggedCount = 0;
                
                for (const n of neighbors) {
                    const nc = this.bot.board.grid[n.y][n.x];
                    if (nc.isFlagged) {
                        flaggedCount++;
                    } else if (!nc.isRevealed) {
                        hiddenCells.add(`${n.x},${n.y}`);
                    }
                }
                
                // Constraint: remaining mines among hidden cells
                const remainingMines = cell.neighborCount - flaggedCount;
                
                if (hiddenCells.size > 0 && remainingMines >= 0) {
                    this.constraints.push({
                        cells: hiddenCells,
                        mineCount: remainingMines,
                        sourceX: x,
                        sourceY: y
                    });
                }
            }
        }
    }
    
    /**
     * Apply simple deduction rules:
     * - If mineCount == 0: all cells are safe
     * - If mineCount == cells.size: all cells are mines
     */
    applySimpleRules() {
        for (const constraint of this.constraints) {
            if (constraint.mineCount === 0) {
                // All cells in this constraint are guaranteed safe
                for (const key of constraint.cells) {
                    this.safeCells.add(key);
                }
            } else if (constraint.mineCount === constraint.cells.size) {
                // All cells in this constraint are guaranteed mines
                for (const key of constraint.cells) {
                    this.mineCells.add(key);
                }
            }
        }
        
        // Remove any cells that are determined as mines from safe set
        for (const key of this.mineCells) {
            this.safeCells.delete(key);
        }
    }
    
    /**
     * Apply subset rules:
     * If constraint A's cells are a subset of constraint B's cells,
     * we can derive new information
     */
    applySubsetRules() {
        const n = this.constraints.length;
        let changed = true;
        let iterations = 0;
        const maxIterations = 5; // Prevent infinite loops
        
        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;
            
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    if (i === j) continue;
                    
                    const cA = this.constraints[i];
                    const cB = this.constraints[j];
                    
                    // Check if A is a subset of B
                    if (this.isSubset(cA.cells, cB.cells)) {
                        // Cells in B but not in A
                        const difference = new Set([...cB.cells].filter(x => !cA.cells.has(x)));
                        
                        if (difference.size === 0) continue;
                        
                        // Mines in difference = B.mineCount - A.mineCount
                        const minesInDiff = cB.mineCount - cA.mineCount;
                        
                        if (minesInDiff === 0) {
                            // All cells in difference are safe
                            for (const key of difference) {
                                if (!this.safeCells.has(key)) {
                                    this.safeCells.add(key);
                                    changed = true;
                                }
                            }
                        } else if (minesInDiff === difference.size) {
                            // All cells in difference are mines
                            for (const key of difference) {
                                if (!this.mineCells.has(key)) {
                                    this.mineCells.add(key);
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Cross-reference analysis for overlapping constraints
     */
    applyCrossReferenceAnalysis() {
        const n = this.constraints.length;
        
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const cA = this.constraints[i];
                const cB = this.constraints[j];
                
                // Find intersection
                const intersection = new Set([...cA.cells].filter(x => cB.cells.has(x)));
                
                if (intersection.size === 0) continue;
                
                // Cells only in A, only in B
                const onlyA = new Set([...cA.cells].filter(x => !cB.cells.has(x)));
                const onlyB = new Set([...cB.cells].filter(x => !cA.cells.has(x)));
                
                // Analyze: if all of A's mines must be in onlyA or intersection
                // Maximum mines in intersection = min(cA.mineCount, cB.mineCount, intersection.size)
                const maxIntersectionMines = Math.min(
                    cA.mineCount,
                    cB.mineCount,
                    intersection.size
                );
                
                // Minimum mines in intersection
                const minIntersectionMines = Math.max(
                    0,
                    cA.mineCount - onlyA.size,
                    cB.mineCount - onlyB.size
                );
                
                // If all of A's mines must be in intersection (onlyA has none)
                if (cA.mineCount <= intersection.size && onlyA.size > 0) {
                    const minesInOnlyA = cA.mineCount - minIntersectionMines;
                    
                    if (minesInOnlyA === 0) {
                        // onlyA cells are all safe
                        for (const key of onlyA) {
                            this.safeCells.add(key);
                        }
                    } else if (minesInOnlyA === onlyA.size) {
                        // onlyA cells are all mines
                        for (const key of onlyA) {
                            this.mineCells.add(key);
                        }
                    }
                }
                
                // Same analysis for B
                if (cB.mineCount <= intersection.size && onlyB.size > 0) {
                    const minesInOnlyB = cB.mineCount - minIntersectionMines;
                    
                    if (minesInOnlyB === 0) {
                        for (const key of onlyB) {
                            this.safeCells.add(key);
                        }
                    } else if (minesInOnlyB === onlyB.size) {
                        for (const key of onlyB) {
                            this.mineCells.add(key);
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Check if setA is a subset of setB
     */
    isSubset(setA, setB) {
        if (setA.size > setB.size) return false;
        for (const item of setA) {
            if (!setB.has(item)) return false;
        }
        return true;
    }
    
    /**
     * Get detailed analysis results for debugging
     */
    getAnalysisReport() {
        this.analyze();
        
        return {
            constraintCount: this.constraints.length,
            safeCellCount: this.safeCells.size,
            mineCellCount: this.mineCells.size,
            safeCells: [...this.safeCells],
            mineCells: [...this.mineCells]
        };
    }
}
