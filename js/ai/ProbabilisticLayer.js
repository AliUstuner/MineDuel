/**
 * ProbabilisticLayer.js - Risk Estimation for Minesweeper
 * 
 * When no deterministic moves exist, this layer computes probability-based
 * risk scores for each cell. It uses:
 * 
 * 1. Local constraint analysis (neighbor numbers)
 * 2. Global mine density estimation
 * 3. Pattern-based risk adjustment (from learning)
 * 4. Position heuristics (corners, edges, center)
 * 
 * FAIRNESS: Only uses visible information, never hidden mine positions.
 * 
 * @version 1.0
 */

export class ProbabilisticLayer {
    constructor(botCore) {
        this.bot = botCore;
        
        // Probability map: cell key -> probability of being a mine
        this.probabilities = new Map();
        
        // Learned danger zones from past mistakes
        this.dangerZones = new Map();
        
        // Pattern-based risk adjustments
        this.learnedPatterns = [];
    }
    
    /**
     * Reset layer state
     */
    reset() {
        this.probabilities.clear();
        // Note: dangerZones and learnedPatterns persist across games for learning
    }
    
    /**
     * Find cells with lowest risk
     * @param {number} maxRisk Maximum acceptable risk (0-1)
     * @param {number} maxResults Maximum number of results
     * @returns {Array} Array of {x, y, risk} sorted by risk ascending
     */
    findLowRiskCells(maxRisk = 0.5, maxResults = 5) {
        this.calculateAllProbabilities();
        
        const candidates = [];
        const gridSize = this.bot.gridSize;
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = this.bot.board?.grid?.[y]?.[x];
                if (!cell || cell.isRevealed || cell.isFlagged) continue;
                
                const key = `${x},${y}`;
                const risk = this.probabilities.get(key) || 0.5;
                
                // Skip if confirmed mine
                if (this.bot.visibleState.radarMines.has(key)) continue;
                
                if (risk <= maxRisk) {
                    candidates.push({ x, y, risk });
                }
            }
        }
        
        // Sort by risk (lowest first), then by strategic value
        candidates.sort((a, b) => {
            if (Math.abs(a.risk - b.risk) < 0.05) {
                // Similar risk - prefer cells with higher strategic value
                return this.getStrategicValue(b) - this.getStrategicValue(a);
            }
            return a.risk - b.risk;
        });
        
        return candidates.slice(0, maxResults);
    }
    
    /**
     * Get risk probability for a specific cell
     */
    getRisk(x, y) {
        const key = `${x},${y}`;
        if (!this.probabilities.has(key)) {
            this.calculateAllProbabilities();
        }
        return this.probabilities.get(key) || 0.5;
    }
    
    /**
     * Calculate probabilities for all unrevealed cells
     */
    calculateAllProbabilities() {
        this.probabilities.clear();
        
        if (!this.bot.board?.grid) return;
        
        const gridSize = this.bot.gridSize;
        
        // Step 1: Calculate constraint-based probabilities
        this.calculateConstraintProbabilities();
        
        // Step 2: Apply global mine density for unconstrained cells
        this.applyGlobalDensity();
        
        // Step 3: Apply position heuristics
        this.applyPositionHeuristics();
        
        // Step 4: Apply learned pattern adjustments
        this.applyLearnedPatterns();
        
        // Step 5: Apply danger zone penalties
        this.applyDangerZones();
    }
    
    /**
     * Calculate probabilities based on numbered cell constraints
     */
    calculateConstraintProbabilities() {
        const gridSize = this.bot.gridSize;
        const cellConstraints = new Map(); // key -> [{prob, weight}]
        
        // For each numbered cell, calculate contribution to neighbors
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = this.bot.board.grid[y][x];
                
                if (!cell.isRevealed || cell.neighborCount === 0) continue;
                
                const neighbors = this.bot.getNeighbors(x, y);
                const hidden = [];
                let flagged = 0;
                
                for (const n of neighbors) {
                    const nc = this.bot.board.grid[n.y][n.x];
                    if (nc.isFlagged) flagged++;
                    else if (!nc.isRevealed) hidden.push(n);
                }
                
                const remainingMines = cell.neighborCount - flagged;
                
                if (hidden.length > 0 && remainingMines >= 0) {
                    const probability = remainingMines / hidden.length;
                    
                    // Add constraint to each hidden neighbor
                    for (const h of hidden) {
                        const key = `${h.x},${h.y}`;
                        if (!cellConstraints.has(key)) {
                            cellConstraints.set(key, []);
                        }
                        cellConstraints.get(key).push({
                            prob: probability,
                            weight: 1 / hidden.length // Higher weight for fewer options
                        });
                    }
                }
            }
        }
        
        // Combine constraints for each cell using weighted average
        for (const [key, constraints] of cellConstraints) {
            if (constraints.length === 0) continue;
            
            // Use maximum probability (conservative approach)
            // This is safer than average for mine avoidance
            let maxProb = 0;
            let totalWeight = 0;
            let weightedSum = 0;
            
            for (const c of constraints) {
                maxProb = Math.max(maxProb, c.prob);
                weightedSum += c.prob * c.weight;
                totalWeight += c.weight;
            }
            
            // Blend max and weighted average for final probability
            const avgProb = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
            const finalProb = maxProb * 0.7 + avgProb * 0.3;
            
            this.probabilities.set(key, Math.min(1, finalProb));
        }
    }
    
    /**
     * Apply global mine density to cells without local constraints
     */
    applyGlobalDensity() {
        const gridSize = this.bot.gridSize;
        const totalCells = gridSize * gridSize;
        const totalMines = this.bot.board?.mines?.length || Math.floor(totalCells * 0.15);
        
        // Count revealed cells and flagged cells
        let revealedCount = 0;
        let flaggedCount = 0;
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = this.bot.board.grid[y][x];
                if (cell.isRevealed) revealedCount++;
                if (cell.isFlagged) flaggedCount++;
            }
        }
        
        // Remaining mines and cells
        const remainingMines = totalMines - flaggedCount;
        const remainingCells = totalCells - revealedCount - flaggedCount;
        
        // Global probability for unconstrained cells
        const globalProb = remainingCells > 0 ? remainingMines / remainingCells : 0.5;
        
        // Apply to cells without constraints
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const key = `${x},${y}`;
                const cell = this.bot.board.grid[y][x];
                
                if (cell.isRevealed || cell.isFlagged) continue;
                
                if (!this.probabilities.has(key)) {
                    this.probabilities.set(key, globalProb);
                }
            }
        }
    }
    
    /**
     * Apply position-based heuristics
     * Corners and edges tend to have different mine distributions
     */
    applyPositionHeuristics() {
        const gridSize = this.bot.gridSize;
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const key = `${x},${y}`;
                const cell = this.bot.board?.grid?.[y]?.[x];
                
                if (!cell || cell.isRevealed || cell.isFlagged) continue;
                
                let currentProb = this.probabilities.get(key) || 0.5;
                
                // Corners have fewer neighbors, adjust slightly
                const isCorner = (x === 0 || x === gridSize - 1) && (y === 0 || y === gridSize - 1);
                const isEdge = !isCorner && (x === 0 || x === gridSize - 1 || y === 0 || y === gridSize - 1);
                
                // Check if adjacent to revealed area (frontier cells)
                const neighbors = this.bot.getNeighbors(x, y);
                const hasRevealedNeighbor = neighbors.some(n => 
                    this.bot.board.grid[n.y][n.x].isRevealed
                );
                
                // Frontier cells near low numbers might be safer
                if (hasRevealedNeighbor) {
                    // Get neighbor numbers
                    let minNeighborNumber = 8;
                    for (const n of neighbors) {
                        const nc = this.bot.board.grid[n.y][n.x];
                        if (nc.isRevealed && nc.neighborCount > 0) {
                            minNeighborNumber = Math.min(minNeighborNumber, nc.neighborCount);
                        }
                    }
                    
                    // Cells near 1s might be slightly safer than cells near 3s
                    if (minNeighborNumber <= 2) {
                        currentProb *= 0.95; // Slight reduction
                    }
                }
                
                // Cells not adjacent to any revealed cell are unknown
                // They might be good for opening new areas
                if (!hasRevealedNeighbor && currentProb > 0.3) {
                    // Slight bonus for potentially opening new areas
                    currentProb *= 0.98;
                }
                
                this.probabilities.set(key, Math.max(0, Math.min(1, currentProb)));
            }
        }
    }
    
    /**
     * Apply learned patterns from past mistakes
     */
    applyLearnedPatterns() {
        if (this.learnedPatterns.length === 0) return;
        
        const gridSize = this.bot.gridSize;
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const key = `${x},${y}`;
                const cell = this.bot.board?.grid?.[y]?.[x];
                
                if (!cell || cell.isRevealed || cell.isFlagged) continue;
                
                // Check if current cell matches any dangerous pattern
                const neighborState = this.getNeighborState(x, y);
                
                for (const pattern of this.learnedPatterns) {
                    if (this.matchesPattern(neighborState, pattern)) {
                        // Increase probability based on pattern severity
                        const currentProb = this.probabilities.get(key) || 0.5;
                        const increase = pattern.severity * 0.2;
                        this.probabilities.set(key, Math.min(0.95, currentProb + increase));
                    }
                }
            }
        }
    }
    
    /**
     * Apply danger zone penalties
     */
    applyDangerZones() {
        for (const [key, dangerLevel] of this.dangerZones) {
            if (this.probabilities.has(key)) {
                const currentProb = this.probabilities.get(key);
                const newProb = Math.max(currentProb, dangerLevel);
                this.probabilities.set(key, newProb);
            }
        }
    }
    
    /**
     * Get neighbor state for pattern matching
     */
    getNeighborState(x, y) {
        const neighbors = this.bot.getNeighbors(x, y);
        const state = {
            revealedCount: 0,
            flaggedCount: 0,
            hiddenCount: 0,
            numbers: [],
            maxNumber: 0
        };
        
        for (const n of neighbors) {
            const cell = this.bot.board?.grid?.[n.y]?.[n.x];
            if (!cell) continue;
            
            if (cell.isRevealed) {
                state.revealedCount++;
                if (cell.neighborCount > 0) {
                    state.numbers.push(cell.neighborCount);
                    state.maxNumber = Math.max(state.maxNumber, cell.neighborCount);
                }
            } else if (cell.isFlagged) {
                state.flaggedCount++;
            } else {
                state.hiddenCount++;
            }
        }
        
        return state;
    }
    
    /**
     * Check if neighbor state matches a learned pattern
     */
    matchesPattern(state, pattern) {
        // Simple similarity check
        const revealedMatch = Math.abs(state.revealedCount - pattern.revealedCount) <= 1;
        const hiddenMatch = Math.abs(state.hiddenCount - pattern.hiddenCount) <= 1;
        const hasCommonNumber = state.numbers.some(n => pattern.numbers.includes(n));
        
        return revealedMatch && hiddenMatch && hasCommonNumber;
    }
    
    /**
     * Get strategic value of a cell (for tie-breaking)
     */
    getStrategicValue(cell) {
        const gridSize = this.bot.gridSize;
        const { x, y } = cell;
        
        let value = 0;
        
        // Prefer cells adjacent to revealed areas (expand frontier)
        const neighbors = this.bot.getNeighbors(x, y);
        const revealedNeighbors = neighbors.filter(n => 
            this.bot.board?.grid?.[n.y]?.[n.x]?.isRevealed
        ).length;
        
        value += revealedNeighbors * 10;
        
        // Prefer cells that might open large areas
        // Cells with many hidden neighbors might cascade
        const hiddenNeighbors = neighbors.filter(n => {
            const c = this.bot.board?.grid?.[n.y]?.[n.x];
            return c && !c.isRevealed && !c.isFlagged;
        }).length;
        
        value += hiddenNeighbors * 5;
        
        // Slight preference for center (more information)
        const centerDist = Math.abs(x - gridSize/2) + Math.abs(y - gridSize/2);
        value -= centerDist;
        
        return value;
    }
    
    /**
     * Record a mistake for learning
     */
    recordMistake(x, y, context) {
        const key = `${x},${y}`;
        
        // Add to danger zones
        this.dangerZones.set(key, 1.0);
        
        // Learn pattern
        const neighborState = this.getNeighborState(x, y);
        
        // Check if similar pattern exists
        let found = false;
        for (const pattern of this.learnedPatterns) {
            if (this.matchesPattern(neighborState, pattern)) {
                pattern.count++;
                pattern.severity = Math.min(1, pattern.severity + 0.1);
                found = true;
                break;
            }
        }
        
        if (!found) {
            this.learnedPatterns.push({
                ...neighborState,
                count: 1,
                severity: 0.3
            });
        }
        
        // Keep only top patterns
        if (this.learnedPatterns.length > 20) {
            this.learnedPatterns.sort((a, b) => b.count - a.count);
            this.learnedPatterns = this.learnedPatterns.slice(0, 20);
        }
    }
    
    /**
     * Get probability report for debugging
     */
    getProbabilityReport() {
        this.calculateAllProbabilities();
        
        const entries = [...this.probabilities.entries()];
        entries.sort((a, b) => a[1] - b[1]);
        
        return {
            totalCells: entries.length,
            safest: entries.slice(0, 5).map(([key, prob]) => ({ key, prob })),
            riskiest: entries.slice(-5).map(([key, prob]) => ({ key, prob })),
            learnedPatterns: this.learnedPatterns.length,
            dangerZones: this.dangerZones.size
        };
    }
}
