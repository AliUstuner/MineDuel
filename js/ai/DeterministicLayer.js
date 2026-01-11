/**
 * DeterministicLayer.js - Advanced Minesweeper Deduction Engine
 * 
 * MASTER LEVEL AI - Uses multiple advanced techniques:
 * 1. Constraint Satisfaction Problem (CSP) solving
 * 2. Subset/Superset analysis
 * 3. Cross-reference (intersection) analysis
 * 4. Pattern recognition (1-1, 1-2, 1-2-1, corners)
 * 5. Global mine count reasoning
 * 6. Gaussian elimination style constraint reduction
 * 
 * @version 2.0 - Master Level
 */

export class DeterministicLayer {
    constructor(botCore) {
        this.bot = botCore;
        
        // Analysis results
        this.safeCells = new Set();
        this.mineCells = new Set();
        this.constraints = [];
        this.suspiciousFlags = new Set();
        
        // Cache - aynı durumda tekrar analiz yapma
        this.lastAnalysisTime = 0;
        this.lastBoardState = null;
        this.analysisValid = false;
        
        // Analysis statistics (per analysis, not cumulative)
        this.stats = {
            simpleDeductions: 0,
            subsetDeductions: 0,
            crossRefDeductions: 0,
            patternDeductions: 0,
            globalDeductions: 0
        };
    }
    
    reset() {
        this.safeCells.clear();
        this.mineCells.clear();
        this.constraints = [];
        this.suspiciousFlags.clear();
        this.lastAnalysisTime = 0;
        this.lastBoardState = null;
        this.analysisValid = false;
        this.stats = { simpleDeductions: 0, subsetDeductions: 0, crossRefDeductions: 0, patternDeductions: 0, globalDeductions: 0 };
    }
    
    /**
     * Find guaranteed safe cells
     */
    findSafeCells() {
        this.analyzeIfNeeded();
        
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
     * Find guaranteed mine cells
     */
    findMineCells() {
        this.analyzeIfNeeded();
        
        const result = [];
        for (const key of this.mineCells) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.bot.board?.grid?.[y]?.[x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                result.push({ x, y });
            }
        }
        
        // Radar mayınlarını ekle
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
     * Get suspicious flags
     */
    getSuspiciousFlags() {
        const result = [];
        for (const key of this.suspiciousFlags) {
            const [x, y] = key.split(',').map(Number);
            result.push({ x, y });
        }
        return result;
    }
    
    /**
     * Check if analysis is needed (cache mechanism)
     */
    analyzeIfNeeded() {
        // Her zaman analiz yap - cache sorun çıkarıyor
        // Board state sürekli değişiyor, cache güvenilir değil
        this.analyze();
    }
    
    /**
     * Get a hash of the current board state
     */
    getBoardStateHash() {
        if (!this.bot.board?.grid) return '';
        
        let hash = '';
        const gridSize = this.bot.gridSize;
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = this.bot.board.grid[y]?.[x];
                if (cell) {
                    if (cell.isRevealed) hash += cell.neighborCount;
                    else if (cell.isFlagged) hash += 'F';
                    else hash += '.';
                }
            }
        }
        return hash;
    }
    
    /**
     * Invalidate cache (call when board changes)
     */
    invalidateCache() {
        this.analysisValid = false;
    }
    
    /**
     * Main analysis - runs all deduction techniques
     */
    analyze() {
        if (!this.bot.board?.grid) {
            console.warn('[DeterministicLayer] No board grid!');
            return;
        }
        
        // Reset stats for THIS analysis (not cumulative!)
        this.stats = {
            simpleDeductions: 0,
            subsetDeductions: 0,
            crossRefDeductions: 0,
            patternDeductions: 0,
            globalDeductions: 0
        };
        
        this.safeCells.clear();
        this.mineCells.clear();
        this.constraints = [];
        this.suspiciousFlags.clear();
        
        // 1. Constraint'leri oluştur
        this.buildConstraints();
        
        // Debug: kaç constraint oluştu?
        if (this.constraints.length === 0) {
            console.warn('[DeterministicLayer] No constraints built! Checking board...');
            this.debugBoard();
        }
        
        // 2. Basit kuralları uygula (mineCount = 0 veya cells.size)
        this.applySimpleRules();
        
        // 3. Pattern tanıma (1-1, 1-2, köşe desenleri)
        this.applyPatternRecognition();
        
        // 4. Subset analizi (A ⊂ B ilişkisi)
        this.applySubsetAnalysis();
        
        // 5. Cross-reference analizi (kesişim)
        this.applyCrossReferenceAnalysis();
        
        // 6. Gelişmiş constraint reduction
        this.applyConstraintReduction();
        
        // 7. Global mayın sayısı analizi
        this.applyGlobalMineAnalysis();
        
        // Son temizlik
        for (const key of this.mineCells) {
            this.safeCells.delete(key);
        }
        
        console.log(`[DeterministicLayer] Analysis: ${this.safeCells.size} safe, ${this.mineCells.size} mines | ` +
                    `Simple: ${this.stats.simpleDeductions}, Pattern: ${this.stats.patternDeductions}, ` +
                    `Subset: ${this.stats.subsetDeductions}, CrossRef: ${this.stats.crossRefDeductions}`);
    }
    
    /**
     * Debug board state
     */
    debugBoard() {
        const gridSize = this.bot.gridSize;
        let revealedCount = 0;
        let numberedCount = 0;
        let hiddenCount = 0;
        let flaggedCount = 0;
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = this.bot.board.grid[y]?.[x];
                if (!cell) continue;
                
                if (cell.isRevealed) {
                    revealedCount++;
                    if (cell.neighborCount > 0) numberedCount++;
                } else if (cell.isFlagged) {
                    flaggedCount++;
                } else {
                    hiddenCount++;
                }
            }
        }
        
        console.log(`[DeterministicLayer] Board state: ${revealedCount} revealed (${numberedCount} numbered), ${hiddenCount} hidden, ${flaggedCount} flagged`);
    }
    
    /**
     * Build constraints from numbered cells
     */
    buildConstraints() {
        const gridSize = this.bot.gridSize;
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = this.bot.board.grid[y]?.[x];
                if (!cell || !cell.isRevealed) continue;
                
                const count = cell.neighborCount || 0;
                if (count === 0) continue;
                
                const neighbors = this.bot.getNeighbors(x, y);
                const hiddenCells = new Set();
                let flaggedCount = 0;
                
                for (const n of neighbors) {
                    const nc = this.bot.board.grid[n.y]?.[n.x];
                    if (!nc) continue;
                    
                    if (nc.isFlagged) {
                        flaggedCount++;
                    } else if (!nc.isRevealed) {
                        hiddenCells.add(`${n.x},${n.y}`);
                    }
                }
                
                const remainingMines = count - flaggedCount;
                
                // Yanlış bayrak tespiti
                if (remainingMines < 0) {
                    this.markSuspiciousFlags(neighbors);
                    continue;
                }
                
                if (hiddenCells.size > 0) {
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
    
    markSuspiciousFlags(neighbors) {
        for (const n of neighbors) {
            const nc = this.bot.board.grid[n.y]?.[n.x];
            if (nc && nc.isFlagged) {
                this.suspiciousFlags.add(`${n.x},${n.y}`);
            }
        }
    }
    
    /**
     * Simple rules: mineCount = 0 or mineCount = cells.size
     */
    applySimpleRules() {
        for (const c of this.constraints) {
            if (c.mineCount === 0) {
                for (const key of c.cells) {
                    this.safeCells.add(key);
                    this.stats.simpleDeductions++;
                }
            } else if (c.mineCount === c.cells.size) {
                for (const key of c.cells) {
                    this.mineCells.add(key);
                    this.stats.simpleDeductions++;
                }
            }
        }
    }
    
    /**
     * Pattern recognition for common Minesweeper patterns
     */
    applyPatternRecognition() {
        const gridSize = this.bot.gridSize;
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = this.bot.board.grid[y]?.[x];
                if (!cell || !cell.isRevealed) continue;
                
                const count = cell.neighborCount || 0;
                if (count === 0) continue;
                
                // 1-1 Pattern (yatay ve dikey)
                this.check11Pattern(x, y, count);
                
                // 1-2 Pattern
                this.check12Pattern(x, y, count);
                
                // 1-2-1 Pattern
                this.check121Pattern(x, y, count);
                
                // Köşe analizi
                this.checkCornerPattern(x, y, count);
            }
        }
    }
    
    /**
     * 1-1 Pattern: İki bitişik 1, aralarındaki hücrelerden biri mayın
     */
    check11Pattern(x, y, count) {
        if (count !== 1) return;
        
        // Yatay kontrol (x+1)
        const rightCell = this.bot.board.grid[y]?.[x + 1];
        if (rightCell?.isRevealed && (rightCell.neighborCount || 0) === 1) {
            this.analyze11Pair(x, y, x + 1, y, 'horizontal');
        }
        
        // Dikey kontrol (y+1)
        const downCell = this.bot.board.grid[y + 1]?.[x];
        if (downCell?.isRevealed && (downCell.neighborCount || 0) === 1) {
            this.analyze11Pair(x, y, x, y + 1, 'vertical');
        }
    }
    
    analyze11Pair(x1, y1, x2, y2, direction) {
        // İki 1'in ortak olmayan komşularını bul
        const neighbors1 = new Set(this.bot.getNeighbors(x1, y1).map(n => `${n.x},${n.y}`));
        const neighbors2 = new Set(this.bot.getNeighbors(x2, y2).map(n => `${n.x},${n.y}`));
        
        // Sadece birinin komşusu olan hidden hücreler
        const only1 = this.getHiddenOnly(neighbors1, neighbors2);
        const only2 = this.getHiddenOnly(neighbors2, neighbors1);
        
        // Her iki 1 de zaten tatmin edilmişse atla
        const hidden1 = this.getHiddenCells(neighbors1);
        const hidden2 = this.getHiddenCells(neighbors2);
        
        // Eğer bir tarafta sadece 1 hidden varsa ve diğer tarafta da 1 hidden varsa
        // ve her ikisi de aynı hücreyi işaret ediyorsa, ortak olan mayındır
        const common = [...hidden1].filter(h => hidden2.has(h));
        
        if (common.length === 1 && only1.size === 0 && only2.size === 0) {
            // Tek ortak hidden hücre mayındır
            this.mineCells.add(common[0]);
            this.stats.patternDeductions++;
        }
        
        // Eğer only1'de hidden yoksa ve common'da 1 mine varsa
        // only2'deki tüm hücreler güvenli
        if (only1.size === 0 && common.length >= 1) {
            for (const key of only2) {
                this.safeCells.add(key);
                this.stats.patternDeductions++;
            }
        }
        if (only2.size === 0 && common.length >= 1) {
            for (const key of only1) {
                this.safeCells.add(key);
                this.stats.patternDeductions++;
            }
        }
    }
    
    getHiddenOnly(set1, set2) {
        const result = new Set();
        for (const key of set1) {
            if (!set2.has(key)) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.bot.board.grid[y]?.[x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    result.add(key);
                }
            }
        }
        return result;
    }
    
    getHiddenCells(neighborSet) {
        const result = new Set();
        for (const key of neighborSet) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.bot.board.grid[y]?.[x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                result.add(key);
            }
        }
        return result;
    }
    
    /**
     * 1-2 Pattern: 1'in yanındaki 2
     */
    check12Pattern(x, y, count) {
        if (count !== 2) return;
        
        // 2'nin yanındaki 1'leri bul
        const neighbors = this.bot.getNeighbors(x, y);
        
        for (const n of neighbors) {
            const nc = this.bot.board.grid[n.y]?.[n.x];
            if (nc?.isRevealed && (nc.neighborCount || 0) === 1) {
                this.analyze12Pair(n.x, n.y, x, y);
            }
        }
    }
    
    analyze12Pair(x1, y1, x2, y2) {
        // x1,y1 = 1, x2,y2 = 2
        const neighbors1 = new Set(this.bot.getNeighbors(x1, y1).map(n => `${n.x},${n.y}`));
        const neighbors2 = new Set(this.bot.getNeighbors(x2, y2).map(n => `${n.x},${n.y}`));
        
        const hidden1 = this.getHiddenCells(neighbors1);
        const hidden2 = this.getHiddenCells(neighbors2);
        
        const common = [...hidden1].filter(h => hidden2.has(h));
        const only2 = [...hidden2].filter(h => !hidden1.has(h));
        
        // 1'in tüm hidden komşuları 2'nin de komşusuysa
        // 2'nin kalan mayını only2'de
        if ([...hidden1].every(h => hidden2.has(h))) {
            // 1'in mayını common'da, 2'nin 1 mayını da only2'de
            if (only2.length === 1) {
                // only2 kesin mayın
                this.mineCells.add(only2[0]);
                this.stats.patternDeductions++;
            }
        }
    }
    
    /**
     * 1-2-1 Pattern: Classic Minesweeper pattern
     */
    check121Pattern(x, y, count) {
        if (count !== 2) return;
        
        // Yatay 1-2-1 kontrol
        const left = this.bot.board.grid[y]?.[x - 1];
        const right = this.bot.board.grid[y]?.[x + 1];
        
        if (left?.isRevealed && (left.neighborCount || 0) === 1 &&
            right?.isRevealed && (right.neighborCount || 0) === 1) {
            this.analyze121(x - 1, y, x, y, x + 1, y, 'horizontal');
        }
        
        // Dikey 1-2-1 kontrol
        const up = this.bot.board.grid[y - 1]?.[x];
        const down = this.bot.board.grid[y + 1]?.[x];
        
        if (up?.isRevealed && (up.neighborCount || 0) === 1 &&
            down?.isRevealed && (down.neighborCount || 0) === 1) {
            this.analyze121(x, y - 1, x, y, x, y + 1, 'vertical');
        }
    }
    
    analyze121(x1, y1, x2, y2, x3, y3, direction) {
        // 1-2-1 pattern: mayınlar 1'lerin dışındaki köşelerinde
        const neighbors1 = this.getHiddenCells(new Set(this.bot.getNeighbors(x1, y1).map(n => `${n.x},${n.y}`)));
        const neighbors2 = this.getHiddenCells(new Set(this.bot.getNeighbors(x2, y2).map(n => `${n.x},${n.y}`)));
        const neighbors3 = this.getHiddenCells(new Set(this.bot.getNeighbors(x3, y3).map(n => `${n.x},${n.y}`)));
        
        // Sadece uç 1'lerin komşusu olan hücreler (2'nin değil)
        const only1 = [...neighbors1].filter(h => !neighbors2.has(h));
        const only3 = [...neighbors3].filter(h => !neighbors2.has(h));
        
        // 2'nin ortadaki (1'lerle paylaşılan) hidden hücreleri güvenli olabilir
        const commonWith1 = [...neighbors2].filter(h => neighbors1.has(h) && !neighbors3.has(h));
        const commonWith3 = [...neighbors2].filter(h => neighbors3.has(h) && !neighbors1.has(h));
        
        // Eğer only1 ve only3 birer hücre ise, bunlar mayın, geri kalan güvenli
        if (only1.length === 1 && only3.length === 1) {
            this.mineCells.add(only1[0]);
            this.mineCells.add(only3[0]);
            this.stats.patternDeductions += 2;
            
            // 2'nin diğer komşuları güvenli
            for (const key of neighbors2) {
                if (key !== only1[0] && key !== only3[0]) {
                    this.safeCells.add(key);
                    this.stats.patternDeductions++;
                }
            }
        }
    }
    
    /**
     * Corner pattern analysis
     */
    checkCornerPattern(x, y, count) {
        const gridSize = this.bot.gridSize;
        
        // Köşe hücresi mi?
        const isCorner = (x === 0 || x === gridSize - 1) && (y === 0 || y === gridSize - 1);
        const isEdge = x === 0 || x === gridSize - 1 || y === 0 || y === gridSize - 1;
        
        if (!isEdge) return;
        
        const neighbors = this.bot.getNeighbors(x, y);
        const hidden = [];
        let flagged = 0;
        
        for (const n of neighbors) {
            const nc = this.bot.board.grid[n.y]?.[n.x];
            if (!nc) continue;
            if (nc.isFlagged) flagged++;
            else if (!nc.isRevealed) hidden.push(`${n.x},${n.y}`);
        }
        
        const remaining = count - flagged;
        
        // Kenar/köşe hücresinde daha az komşu var, analiz daha kolay
        if (remaining === 0) {
            for (const key of hidden) {
                this.safeCells.add(key);
                this.stats.patternDeductions++;
            }
        } else if (remaining === hidden.length) {
            for (const key of hidden) {
                this.mineCells.add(key);
                this.stats.patternDeductions++;
            }
        }
    }
    
    /**
     * Subset analysis: If A ⊂ B, derive new information
     */
    applySubsetAnalysis() {
        let changed = true;
        let iterations = 0;
        
        while (changed && iterations < 10) {
            changed = false;
            iterations++;
            
            for (let i = 0; i < this.constraints.length; i++) {
                for (let j = 0; j < this.constraints.length; j++) {
                    if (i === j) continue;
                    
                    const cA = this.constraints[i];
                    const cB = this.constraints[j];
                    
                    // A ⊂ B?
                    if (this.isSubset(cA.cells, cB.cells)) {
                        const diff = new Set([...cB.cells].filter(x => !cA.cells.has(x)));
                        if (diff.size === 0) continue;
                        
                        const minesInDiff = cB.mineCount - cA.mineCount;
                        
                        if (minesInDiff === 0) {
                            for (const key of diff) {
                                if (!this.safeCells.has(key)) {
                                    this.safeCells.add(key);
                                    this.stats.subsetDeductions++;
                                    changed = true;
                                }
                            }
                        } else if (minesInDiff === diff.size) {
                            for (const key of diff) {
                                if (!this.mineCells.has(key)) {
                                    this.mineCells.add(key);
                                    this.stats.subsetDeductions++;
                                    changed = true;
                                }
                            }
                        }
                        
                        // Yeni constraint oluştur (diff için)
                        if (minesInDiff > 0 && minesInDiff < diff.size) {
                            const newConstraint = { cells: diff, mineCount: minesInDiff, derived: true };
                            if (!this.constraintExists(newConstraint)) {
                                this.constraints.push(newConstraint);
                            }
                        }
                    }
                }
            }
            
            // Her iterasyonda bulunanları constraint'lerden çıkar
            this.updateConstraintsWithKnowledge();
        }
    }
    
    constraintExists(newC) {
        for (const c of this.constraints) {
            if (c.cells.size === newC.cells.size && 
                c.mineCount === newC.mineCount &&
                [...c.cells].every(x => newC.cells.has(x))) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Cross-reference analysis for overlapping constraints
     */
    applyCrossReferenceAnalysis() {
        for (let i = 0; i < this.constraints.length; i++) {
            for (let j = i + 1; j < this.constraints.length; j++) {
                const cA = this.constraints[i];
                const cB = this.constraints[j];
                
                const intersection = new Set([...cA.cells].filter(x => cB.cells.has(x)));
                if (intersection.size === 0) continue;
                
                const onlyA = new Set([...cA.cells].filter(x => !cB.cells.has(x)));
                const onlyB = new Set([...cB.cells].filter(x => !cA.cells.has(x)));
                
                // Min/max mayın sayısı intersection'da
                const maxInInt = Math.min(cA.mineCount, cB.mineCount, intersection.size);
                const minInInt = Math.max(0, cA.mineCount - onlyA.size, cB.mineCount - onlyB.size);
                
                // onlyA analizi
                const maxInOnlyA = cA.mineCount - minInInt;
                const minInOnlyA = cA.mineCount - maxInInt;
                
                if (minInOnlyA === onlyA.size && onlyA.size > 0) {
                    for (const key of onlyA) {
                        this.mineCells.add(key);
                        this.stats.crossRefDeductions++;
                    }
                } else if (maxInOnlyA === 0 && onlyA.size > 0) {
                    for (const key of onlyA) {
                        this.safeCells.add(key);
                        this.stats.crossRefDeductions++;
                    }
                }
                
                // onlyB analizi
                const maxInOnlyB = cB.mineCount - minInInt;
                const minInOnlyB = cB.mineCount - maxInInt;
                
                if (minInOnlyB === onlyB.size && onlyB.size > 0) {
                    for (const key of onlyB) {
                        this.mineCells.add(key);
                        this.stats.crossRefDeductions++;
                    }
                } else if (maxInOnlyB === 0 && onlyB.size > 0) {
                    for (const key of onlyB) {
                        this.safeCells.add(key);
                        this.stats.crossRefDeductions++;
                    }
                }
            }
        }
    }
    
    /**
     * Advanced constraint reduction (Gaussian-like)
     */
    applyConstraintReduction() {
        // Bilinen değerleri constraint'lerden çıkar
        this.updateConstraintsWithKnowledge();
        
        // Tekrar simple rules uygula
        this.applySimpleRules();
    }
    
    updateConstraintsWithKnowledge() {
        for (const c of this.constraints) {
            // Bilinen mayınları çıkar
            for (const key of [...c.cells]) {
                if (this.mineCells.has(key)) {
                    c.cells.delete(key);
                    c.mineCount = Math.max(0, c.mineCount - 1);
                } else if (this.safeCells.has(key)) {
                    c.cells.delete(key);
                }
            }
        }
        
        // Boş constraint'leri temizle
        this.constraints = this.constraints.filter(c => c.cells.size > 0);
    }
    
    /**
     * Global mine count analysis
     */
    applyGlobalMineAnalysis() {
        const totalMines = this.bot.game?.mineCount || 15;
        const gridSize = this.bot.gridSize;
        
        // Toplam bayrak sayısı
        let flagCount = 0;
        let hiddenCount = 0;
        const hiddenCells = new Set();
        
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = this.bot.board.grid[y]?.[x];
                if (!cell) continue;
                
                if (cell.isFlagged) flagCount++;
                else if (!cell.isRevealed) {
                    hiddenCount++;
                    hiddenCells.add(`${x},${y}`);
                }
            }
        }
        
        // Bilinen mayınları ekle
        const knownMines = this.mineCells.size + flagCount;
        const remainingMines = totalMines - knownMines;
        
        // Tüm mayınlar bulundu
        if (remainingMines <= 0) {
            // Tüm kalan hidden hücreler güvenli
            for (const key of hiddenCells) {
                if (!this.mineCells.has(key)) {
                    this.safeCells.add(key);
                    this.stats.globalDeductions++;
                }
            }
        }
        
        // Kalan hidden = kalan mayın sayısı
        const unknownHidden = hiddenCount - this.mineCells.size;
        if (unknownHidden === remainingMines && remainingMines > 0) {
            for (const key of hiddenCells) {
                if (!this.mineCells.has(key) && !this.safeCells.has(key)) {
                    this.mineCells.add(key);
                    this.stats.globalDeductions++;
                }
            }
        }
    }
    
    isSubset(setA, setB) {
        if (setA.size > setB.size) return false;
        for (const item of setA) {
            if (!setB.has(item)) return false;
        }
        return true;
    }
    
    /**
     * Debug report
     */
    getAnalysisReport() {
        this.analyze();
        return {
            constraints: this.constraints.length,
            safeCells: this.safeCells.size,
            mineCells: this.mineCells.size,
            stats: { ...this.stats }
        };
    }
}
