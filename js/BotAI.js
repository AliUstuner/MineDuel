/**
 * BotAI.js - ADVANCED INTELLIGENT MINESWEEPER AI
 * 
 * A serious, strategic AI that:
 * - Uses Constraint Satisfaction Problem (CSP) solving for mine detection
 * - Continuously analyzes both boards (self and opponent)
 * - Makes decisions based on game theory and probability
 * - Adapts strategy based on game state
 * - Learns from each game played
 * 
 * Core Philosophy: "Every decision must maximize winning probability"
 */

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
        this.stuckCounter = 0;
        
        // ==================== INTELLIGENT ANALYSIS SYSTEM ====================
        
        // Real-time board state analysis
        this.boardAnalysis = {
            // My board state
            myBoard: {
                revealedCells: 0,
                flaggedCells: 0,
                safeCellsRemaining: 0,
                minesRemaining: 0,
                completionPercent: 0,
                dangerZones: [],
                safeZones: [],
                uncertainZones: []
            },
            // Opponent (player) board state
            opponentBoard: {
                revealedCells: 0,
                estimatedCompletion: 0,
                scoreRate: 0,
                lastScoreCheck: 0,
                lastScore: 0,
                isOnStreak: false,
                streakLength: 0
            }
        };
        
        // Probability map for each cell
        this.probabilityMap = new Map();
        
        // Known information
        this.knownMines = new Set();
        this.knownSafe = new Set();
        this.flaggedCells = new Set();
        
        // ==================== STRATEGIC STATE ====================
        
        this.strategy = {
            mode: 'balanced',
            lastModeChange: 0,
            powerBudget: 0,
            targetScore: 0,
            riskTolerance: 0.3,
            
            powersUsed: { freeze: 0, shield: 0, radar: 0, safeburst: 0 },
            powerLimits: this.getPowerLimits(difficulty),
            lastPowerTime: 0,
            powerCooldown: this.getPowerCooldown(difficulty)
        };
        
        // ==================== LEARNING SYSTEM ====================
        
        this.learning = this.loadLearning();
        
        // Current game tracking
        this.gameStats = {
            movesMade: 0,
            minesHit: 0,
            correctFlags: 0,
            wrongFlags: 0,
            decisionsAnalyzed: 0
        };
        
        // Move history
        this.moveHistory = [];
        
        // ==================== DIFFICULTY SETTINGS ====================
        
        this.settings = this.getSettings();
        
        console.log(`[AI] Initialized ${difficulty.toUpperCase()} AI - Games played: ${this.learning.totalGames}`);
    }

    // ==================== SETTINGS BY DIFFICULTY ====================
    
    getSettings() {
        const configs = {
            easy: {
                thinkTime: { min: 1500, max: 2500 },
                mistakeRate: 0.25,
                analysisDepth: 1,
                useCSP: false,
                useProbability: false
            },
            medium: {
                thinkTime: { min: 800, max: 1500 },
                mistakeRate: 0.12,
                analysisDepth: 2,
                useCSP: true,
                useProbability: true
            },
            hard: {
                thinkTime: { min: 400, max: 900 },
                mistakeRate: 0.05,
                analysisDepth: 3,
                useCSP: true,
                useProbability: true
            },
            expert: {
                thinkTime: { min: 200, max: 500 },
                mistakeRate: 0.01,
                analysisDepth: 4,
                useCSP: true,
                useProbability: true
            }
        };
        
        return configs[this.difficulty] || configs.medium;
    }
    
    // Power limits by difficulty
    getPowerLimits(difficulty) {
        const limits = {
            easy: { freeze: 0, shield: 0, radar: 1, safeburst: 0 },
            medium: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
            hard: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
            expert: { freeze: 2, shield: 1, radar: 3, safeburst: 2 }
        };
        return limits[difficulty] || limits.medium;
    }
    
    // Cooldown by difficulty (ms)
    getPowerCooldown(difficulty) {
        const cooldowns = {
            easy: 30000,    // 30 saniye - çok nadir
            medium: 18000,  // 18 saniye
            hard: 12000,    // 12 saniye
            expert: 8000    // 8 saniye - çok agresif
        };
        return cooldowns[difficulty] || 18000;
    }

    // ==================== LEARNING PERSISTENCE ====================
    
    loadLearning() {
        try {
            const data = localStorage.getItem('mineduel_ai_v3');
            if (data) return JSON.parse(data);
        } catch (e) {}
        
        return {
            totalGames: 0,
            wins: 0,
            losses: 0,
            avgScore: 0,
            powerEffectiveness: {
                freeze: { uses: 0, success: 0 },
                shield: { uses: 0, success: 0 },
                radar: { uses: 0, success: 0 },
                safeburst: { uses: 0, success: 0 }
            }
        };
    }
    
    saveLearning() {
        try {
            localStorage.setItem('mineduel_ai_v3', JSON.stringify(this.learning));
        } catch (e) {}
    }

    // ==================== GAME LIFECYCLE ====================
    
    start(board, gridSize) {
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        this.isThinking = false;
        this.resetGameState();
        
        console.log(`[AI] Starting on ${gridSize}x${gridSize} board`);
        this.scheduleNextMove();
    }
    
    stop() {
        this.isActive = false;
        if (this.moveInterval) {
            clearTimeout(this.moveInterval);
            this.moveInterval = null;
        }
        console.log('[AI] Stopped');
    }
    
    resetGameState() {
        this.probabilityMap.clear();
        this.knownMines.clear();
        this.knownSafe.clear();
        this.flaggedCells.clear();
        this.moveHistory = [];
        this.stuckCounter = 0;
        
        this.strategy.powersUsed = { freeze: 0, shield: 0, radar: 0, safeburst: 0 };
        this.strategy.lastPowerTime = 0;
        this.strategy.mode = 'balanced';
        
        this.gameStats = {
            movesMade: 0,
            minesHit: 0,
            correctFlags: 0,
            wrongFlags: 0,
            decisionsAnalyzed: 0
        };
        
        this.boardAnalysis.opponentBoard.lastScoreCheck = Date.now();
        this.boardAnalysis.opponentBoard.lastScore = 0;
    }
    
    // ==================== MAIN THINKING LOOP ====================
    
    scheduleNextMove() {
        if (!this.isActive || this.game?.gameEnded) return;
        
        const { min, max } = this.settings.thinkTime;
        const delay = min + Math.random() * (max - min);
        
        this.moveInterval = setTimeout(() => this.think(), delay);
    }
    
    async think() {
        if (!this.isActive || this.isThinking || this.game?.gameEnded) return;
        
        // Check if frozen
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.scheduleNextMove();
            return;
        }
        this.isFrozen = false;
        
        this.isThinking = true;
        this.game?.showBotThinking?.();
        
        try {
            await this.delay(100);
            
            // STEP 1: ANALYZE GAME STATE
            this.analyzeGameState();
            
            // STEP 2: UPDATE STRATEGY
            this.updateStrategy();
            
            // STEP 3: CONSIDER POWER USAGE
            if (this.shouldUsePower()) {
                const powerUsed = this.selectAndUsePower();
                if (powerUsed) {
                    this.finishThinking();
                    return;
                }
            }
            
            // STEP 4: MAKE BEST MOVE
            const decision = this.makeDecision();
            
            if (decision) {
                this.executeDecision(decision);
            } else {
                this.stuckCounter++;
                if (this.stuckCounter >= 3) {
                    this.tryRecovery();
                }
            }
            
        } catch (error) {
            console.error('[AI] Error:', error);
        }
        
        this.finishThinking();
    }
    
    finishThinking() {
        this.isThinking = false;
        this.game?.hideBotThinking?.();
        
        if (this.isActive && !this.game?.gameEnded) {
            this.scheduleNextMove();
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== GAME STATE ANALYSIS ====================
    
    analyzeGameState() {
        this.analyzeMyBoard();
        this.analyzeOpponentBoard();
        this.gameStats.decisionsAnalyzed++;
    }
    
    analyzeMyBoard() {
        if (!this.board?.grid) return;
        
        let revealed = 0;
        let flagged = 0;
        let unrevealed = 0;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (cell.isRevealed) {
                    revealed++;
                } else if (cell.isFlagged) {
                    flagged++;
                    this.flaggedCells.add(`${x},${y}`);
                } else {
                    unrevealed++;
                }
            }
        }
        
        const totalCells = this.gridSize * this.gridSize;
        const mineCount = this.board.mines?.length || 0;
        const safeCells = totalCells - mineCount;
        
        this.boardAnalysis.myBoard = {
            revealedCells: revealed,
            flaggedCells: flagged,
            safeCellsRemaining: safeCells - revealed,
            minesRemaining: mineCount - flagged,
            completionPercent: safeCells > 0 ? (revealed / safeCells) * 100 : 0,
            totalUnrevealed: unrevealed
        };
        
        // Update probability map
        if (this.settings.useProbability) {
            this.calculateProbabilities();
        }
    }
    
    analyzeOpponentBoard() {
        if (!this.game) return;
        
        const now = Date.now();
        const playerScore = this.game.score || 0;
        const timeDelta = (now - this.boardAnalysis.opponentBoard.lastScoreCheck) / 1000;
        
        if (timeDelta > 0.5) {
            const scoreDelta = playerScore - this.boardAnalysis.opponentBoard.lastScore;
            this.boardAnalysis.opponentBoard.scoreRate = scoreDelta / timeDelta;
            
            if (scoreDelta > 15) {
                this.boardAnalysis.opponentBoard.isOnStreak = true;
                this.boardAnalysis.opponentBoard.streakLength++;
            } else {
                this.boardAnalysis.opponentBoard.isOnStreak = false;
                this.boardAnalysis.opponentBoard.streakLength = 0;
            }
            
            this.boardAnalysis.opponentBoard.lastScore = playerScore;
            this.boardAnalysis.opponentBoard.lastScoreCheck = now;
        }
        
        const estimatedCells = Math.floor(playerScore / 5);
        const mineCount = this.game.mineCount || 15;
        const totalSafeCells = (this.gridSize * this.gridSize) - mineCount;
        this.boardAnalysis.opponentBoard.estimatedCompletion = Math.min(100, (estimatedCells / totalSafeCells) * 100);
    }

    // ==================== PROBABILITY CALCULATION (CSP) ====================
    
    calculateProbabilities() {
        if (!this.board?.grid) return;
        
        this.probabilityMap.clear();
        this.knownSafe.clear();
        this.knownMines.clear();
        
        const unrevealed = [];
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (!cell.isRevealed && !cell.isFlagged) {
                    unrevealed.push({ x, y });
                }
            }
        }
        
        const totalMines = this.board.mines?.length || 15;
        const flaggedCount = this.flaggedCells.size;
        const remainingMines = totalMines - flaggedCount;
        const baseProbability = unrevealed.length > 0 ? remainingMines / unrevealed.length : 0;
        
        unrevealed.forEach(cell => {
            this.probabilityMap.set(`${cell.x},${cell.y}`, baseProbability);
        });
        
        if (this.settings.useCSP) {
            this.applyCSPConstraints();
        }
    }
    
    applyCSPConstraints() {
        // Apply constraints from revealed number cells
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (!cell.isRevealed || cell.isMine || cell.neighborCount === 0) continue;
                
                const neighbors = this.getNeighbors(x, y);
                const unrevealedNeighbors = neighbors.filter(n => {
                    const nc = this.board.grid[n.y][n.x];
                    return !nc.isRevealed && !nc.isFlagged;
                });
                const flaggedNeighbors = neighbors.filter(n => 
                    this.board.grid[n.y][n.x].isFlagged
                ).length;
                
                const remainingMines = cell.neighborCount - flaggedNeighbors;
                
                if (unrevealedNeighbors.length === 0) continue;
                
                // All unrevealed neighbors are mines
                if (remainingMines === unrevealedNeighbors.length && remainingMines > 0) {
                    unrevealedNeighbors.forEach(n => {
                        const key = `${n.x},${n.y}`;
                        this.probabilityMap.set(key, 1.0);
                        this.knownMines.add(key);
                    });
                }
                
                // All neighbors are safe
                if (remainingMines === 0) {
                    unrevealedNeighbors.forEach(n => {
                        const key = `${n.x},${n.y}`;
                        this.probabilityMap.set(key, 0.0);
                        this.knownSafe.add(key);
                    });
                }
                
                // Probability calculation
                if (remainingMines > 0 && remainingMines < unrevealedNeighbors.length) {
                    const probability = remainingMines / unrevealedNeighbors.length;
                    unrevealedNeighbors.forEach(n => {
                        const key = `${n.x},${n.y}`;
                        const current = this.probabilityMap.get(key) || 0.5;
                        this.probabilityMap.set(key, Math.max(current, probability));
                    });
                }
            }
        }
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

    // ==================== STRATEGY SYSTEM ====================
    
    updateStrategy() {
        const myScore = this.game?.opponentScore || 0;
        const playerScore = this.game?.score || 0;
        const scoreDiff = myScore - playerScore;
        
        const timeRemaining = this.getTimeRemaining();
        const totalTime = this.game?.matchDuration || 120000;
        const timePercent = timeRemaining / totalTime;
        
        // Determine strategy mode
        let newMode = 'balanced';
        
        if (scoreDiff > 50 && timePercent < 0.5) {
            newMode = 'defensive';
            this.strategy.riskTolerance = 0.15;
        } else if (scoreDiff < -50 && timePercent < 0.25) {
            newMode = 'desperate';
            this.strategy.riskTolerance = 0.6;
        } else if (scoreDiff < -30) {
            newMode = 'aggressive';
            this.strategy.riskTolerance = 0.45;
        } else if (scoreDiff > 30) {
            newMode = 'defensive';
            this.strategy.riskTolerance = 0.2;
        } else {
            newMode = 'balanced';
            this.strategy.riskTolerance = 0.3;
        }
        
        if (newMode !== this.strategy.mode) {
            console.log(`[AI] Strategy: ${this.strategy.mode} -> ${newMode} (diff: ${scoreDiff})`);
            this.strategy.mode = newMode;
        }
        
        this.strategy.powerBudget = Math.max(0, myScore - playerScore - 40);
        this.strategy.targetScore = playerScore + 30;
    }
    
    getTimeRemaining() {
        if (!this.game) return 60000;
        const elapsed = Date.now() - (this.game.matchStartTime || Date.now());
        return Math.max(0, (this.game.matchDuration || 120000) - elapsed);
    }

    // ==================== POWER DECISION SYSTEM ====================
    
    shouldUsePower() {
        const timeSinceLast = Date.now() - this.strategy.lastPowerTime;
        if (timeSinceLast < this.strategy.powerCooldown) return false;
        
        const myScore = this.game?.opponentScore || 0;
        // Minimum skor: en ucuz güç (radar=30) + biraz pay
        if (myScore < 40) return false;
        
        return true;
    }
    
    selectAndUsePower() {
        const myScore = this.game?.opponentScore || 0;
        const playerScore = this.game?.score || 0;
        const scoreDiff = myScore - playerScore;
        const timePercent = this.getTimeRemaining() / (this.game?.matchDuration || 120000);
        
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        
        console.log(`[AI POWER] Evaluating powers - myScore: ${myScore}, playerScore: ${playerScore}, diff: ${scoreDiff}, timeLeft: ${(timePercent * 100).toFixed(1)}%`);
        
        // ============ FREEZE ============
        // Oyuncu önde gidiyorsa veya çok hızlıysa dondur
        if (this.strategy.powersUsed.freeze < this.strategy.powerLimits.freeze) {
            const playerAhead = playerScore > myScore + 30; // 30 puan önde
            const playerFast = this.boardAnalysis.opponentBoard.scoreRate > 8; // Hızlı oynuyor
            const midToLateGame = timePercent < 0.70; // Oyunun %70'i geçmiş
            const canAfford = myScore >= costs.freeze + 20;
            
            if (canAfford && midToLateGame && (playerAhead || playerFast)) {
                console.log(`[AI POWER] FREEZE conditions met - ahead: ${playerAhead}, fast: ${playerFast}`);
                if (this.usePower('freeze')) {
                    return true;
                }
            }
        }
        
        // ============ RADAR ============
        // Güvenli hücre bulamadığında veya rastgele şansla
        if (this.strategy.powersUsed.radar < this.strategy.powerLimits.radar) {
            const noSafeCells = this.knownSafe.size === 0;
            const stuck = this.stuckCounter >= 1;
            const randomChance = Math.random() < 0.15; // %15 şans
            const canAfford = myScore >= costs.radar + 10;
            
            if (canAfford && (noSafeCells || stuck || randomChance)) {
                console.log(`[AI POWER] RADAR conditions met - noSafe: ${noSafeCells}, stuck: ${stuck}`);
                if (this.usePower('radar')) {
                    return true;
                }
            }
        }
        
        // ============ SAFEBURST ============
        // Gerideyken veya oyunun ortasında hız kazanmak için
        if (this.strategy.powersUsed.safeburst < this.strategy.powerLimits.safeburst) {
            const behind = playerScore > myScore + 20;
            const midGame = timePercent < 0.60 && timePercent > 0.20;
            const canAfford = myScore >= costs.safeburst + 15;
            
            if (canAfford && behind && midGame) {
                console.log(`[AI POWER] SAFEBURST conditions met - behind by ${playerScore - myScore}`);
                if (this.usePower('safeburst')) {
                    return true;
                }
            }
        }
        
        // ============ SHIELD ============
        // Öndeyken ve oyunun sonuna yaklaşırken koruma
        if (this.strategy.powersUsed.shield < this.strategy.powerLimits.shield) {
            const ahead = scoreDiff > 15;
            const lateGame = timePercent < 0.35; // Son %35
            const canAfford = myScore >= costs.shield + 20;
            
            if (canAfford && ahead && lateGame) {
                console.log(`[AI POWER] SHIELD conditions met - ahead by ${scoreDiff}`);
                if (this.usePower('shield')) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    usePower(power) {
        if (!this.game?.useBotPower) return false;
        
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        const cost = costs[power];
        
        if (this.game.useBotPower(power, cost)) {
            this.strategy.powersUsed[power]++;
            this.strategy.lastPowerTime = Date.now();
            this.learning.powerEffectiveness[power].uses++;
            
            if (power === 'radar') {
                this.processRadarResult();
            }
            
            return true;
        }
        return false;
    }
    
    processRadarResult() {
        if (!this.board?.highlightedMines) return;
        
        this.board.highlightedMines.forEach(mine => {
            const key = `${mine.x},${mine.y}`;
            this.knownMines.add(key);
            this.probabilityMap.set(key, 1.0);
        });
        
        console.log(`[AI] Radar found ${this.board.highlightedMines.length} mines`);
    }

    // ==================== DECISION MAKING ====================
    
    makeDecision() {
        // Priority 1: Flag confirmed mines
        const mineToFlag = this.findMineToFlag();
        if (mineToFlag) {
            return { type: 'flag', ...mineToFlag };
        }
        
        // Priority 2: Reveal confirmed safe cells
        const safeCell = this.findSafeCell();
        if (safeCell) {
            return { type: 'reveal', ...safeCell };
        }
        
        // Priority 3: Best probabilistic move
        const probMove = this.findBestProbabilisticMove();
        if (probMove) {
            return { type: 'reveal', ...probMove };
        }
        
        // Priority 4: Fallback
        const fallback = this.findFallbackMove();
        if (fallback) {
            return { type: 'reveal', ...fallback };
        }
        
        return null;
    }
    
    findMineToFlag() {
        for (const key of this.knownMines) {
            if (!this.flaggedCells.has(key)) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isFlagged && !cell.isRevealed) {
                    return { x, y };
                }
            }
        }
        return null;
    }
    
    findSafeCell() {
        for (const key of this.knownSafe) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.board?.grid?.[y]?.[x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                return { x, y, confidence: 1.0 };
            }
        }
        return null;
    }
    
    findBestProbabilisticMove() {
        const candidates = [];
        
        for (const [key, prob] of this.probabilityMap) {
            if (prob < this.strategy.riskTolerance && !this.knownMines.has(key)) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    candidates.push({ x, y, probability: prob });
                }
            }
        }
        
        if (candidates.length === 0) return null;
        
        candidates.sort((a, b) => a.probability - b.probability);
        
        // Apply mistakes for easier difficulties
        if (Math.random() < this.settings.mistakeRate) {
            const idx = Math.floor(Math.random() * Math.min(5, candidates.length));
            return candidates[idx];
        }
        
        // Pick from top 3 with weighted randomness
        const top = candidates.slice(0, 3);
        const weights = [0.6, 0.25, 0.15];
        const rand = Math.random();
        let cum = 0;
        
        for (let i = 0; i < top.length; i++) {
            cum += weights[i];
            if (rand < cum) return top[i];
        }
        
        return top[0];
    }
    
    findFallbackMove() {
        const candidates = [];
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                const key = `${x},${y}`;
                if (cell && !cell.isRevealed && !cell.isFlagged && !this.knownMines.has(key)) {
                    const isEdge = x === 0 || x === this.gridSize-1 || y === 0 || y === this.gridSize-1;
                    candidates.push({ x, y, score: isEdge ? 2 : 1 });
                }
            }
        }
        
        if (candidates.length === 0) return null;
        
        candidates.sort((a, b) => b.score - a.score);
        const idx = Math.floor(Math.random() * Math.min(5, candidates.length));
        return candidates[idx];
    }
    
    // ==================== DECISION EXECUTION ====================
    
    executeDecision(decision) {
        if (decision.type === 'flag') {
            this.game?.makeBotFlag?.(decision.x, decision.y);
            this.flaggedCells.add(`${decision.x},${decision.y}`);
            this.stuckCounter = 0;
        } else if (decision.type === 'reveal') {
            const result = this.game?.makeBotMove?.(decision.x, decision.y);
            this.gameStats.movesMade++;
            
            if (result) {
                if (result.hitMine) {
                    this.gameStats.minesHit++;
                    this.stuckCounter++;
                } else {
                    this.stuckCounter = 0;
                }
                
                this.moveHistory.push({
                    x: decision.x,
                    y: decision.y,
                    result: result.hitMine ? 'mine' : 'safe',
                    time: Date.now()
                });
            }
        }
    }
    
    // ==================== RECOVERY SYSTEM ====================
    
    tryRecovery() {
        console.log('[AI] Recovery attempt');
        
        const wrongFlag = this.findSuspiciousFlag();
        if (wrongFlag) {
            this.removeFlag(wrongFlag.x, wrongFlag.y);
            this.stuckCounter = 0;
            return;
        }
        
        const random = this.findFallbackMove();
        if (random) {
            this.game?.makeBotMove?.(random.x, random.y);
            this.stuckCounter = 0;
        }
    }
    
    findSuspiciousFlag() {
        for (const key of this.flaggedCells) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.board?.grid?.[y]?.[x];
            if (!cell?.isFlagged) continue;
            
            const neighbors = this.getNeighbors(x, y);
            for (const n of neighbors) {
                const nc = this.board.grid[n.y][n.x];
                if (!nc.isRevealed || nc.isMine) continue;
                
                const nNeighbors = this.getNeighbors(n.x, n.y);
                const flagCount = nNeighbors.filter(nn => 
                    this.board.grid[nn.y][nn.x].isFlagged
                ).length;
                
                if (flagCount > nc.neighborCount) {
                    return { x, y };
                }
            }
        }
        return null;
    }
    
    removeFlag(x, y) {
        const key = `${x},${y}`;
        this.flaggedCells.delete(key);
        this.knownMines.delete(key);
        
        if (this.game?.makeBotUnflag) {
            this.game.makeBotUnflag(x, y);
        }
    }

    // ==================== FREEZE HANDLING ====================
    
    freeze(duration) {
        this.isFrozen = true;
        this.frozenUntil = Date.now() + duration;
    }

    // ==================== GAME END LEARNING ====================
    
    endGameLearning(won, finalScore, opponentScore) {
        this.learning.totalGames++;
        if (won) this.learning.wins++;
        else this.learning.losses++;
        
        const prevTotal = this.learning.avgScore * (this.learning.totalGames - 1);
        this.learning.avgScore = (prevTotal + finalScore) / this.learning.totalGames;
        
        this.saveLearning();
        
        console.log(`[AI] Game: ${won ? 'WON' : 'LOST'} | ${finalScore} vs ${opponentScore} | Record: ${this.learning.wins}/${this.learning.totalGames}`);
    }
}
