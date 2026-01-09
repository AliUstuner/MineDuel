/**
 * BotAI.js - GELİŞMİŞ YAPAY ZEKA SİSTEMİ
 * 
 * Özellikler:
 * - Committee AI: Birden fazla AI birlikte karar verir
 * - Öğrenme Sistemi: Tüm oyunlardan öğrenir
 * - Adaletli Zorluk: Her seviye dengeli
 * - Akıllı Güç Kullanımı: Stratejik güç yönetimi
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
        
        // Zorluk ayarları
        this.config = this.getBalancedConfig(difficulty);
        
        // Beyin durumu
        this.brain = {
            perception: {
                myScore: 0,
                playerScore: 0,
                scoreDiff: 0,
                timeLeft: 100,
                gamePhase: 'early' // early, mid, late, critical
            },
            mood: 'balanced',
            stuckCount: 0
        };
        
        // Bilgi deposu
        this.knowledge = {
            safeCells: new Set(),
            mineCells: new Set(),
            flaggedCells: new Set(),
            wrongFlags: new Set(),
            probabilities: new Map()
        };
        
        // GÜÇ YÖNETİMİ - Basit ve çalışan sistem
        this.powers = {
            used: { freeze: 0, shield: 0, radar: 0, safeburst: 0 },
            lastUseTime: 0,
            cooldown: this.config.powerCooldown,
            limits: this.config.powerLimits
        };
        
        // Öğrenme sistemi
        this.learning = this.loadLearning();
        
        console.log(`[AI] ${difficulty.toUpperCase()} initialized | Games: ${this.learning.gamesPlayed}`);
    }
    
    // ==================== ADALETLI ZORLUK SEVİYELERİ ====================
    
    getBalancedConfig(difficulty) {
        const configs = {
            easy: {
                // Yavaş düşünür, sık hata yapar
                thinkTime: { min: 1500, max: 2500 },
                accuracy: 0.55,           // %55 doğru karar
                mistakeChance: 0.20,      // %20 hata şansı
                powerCooldown: 30000,     // 30 sn
                powerLimits: { freeze: 0, shield: 0, radar: 1, safeburst: 0 },
                powerUseChance: 0.1,      // %10 güç kullanma şansı
                riskTolerance: 0.25
            },
            medium: {
                // Dengeli oynar
                thinkTime: { min: 800, max: 1400 },
                accuracy: 0.75,
                mistakeChance: 0.10,
                powerCooldown: 20000,     // 20 sn
                powerLimits: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
                powerUseChance: 0.4,      // %40 güç kullanma şansı
                riskTolerance: 0.30
            },
            hard: {
                // Hızlı ve akıllı
                thinkTime: { min: 500, max: 900 },
                accuracy: 0.88,
                mistakeChance: 0.05,
                powerCooldown: 12000,     // 12 sn
                powerLimits: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
                powerUseChance: 0.6,
                riskTolerance: 0.35
            },
            expert: {
                // Çok hızlı, çok akıllı
                thinkTime: { min: 250, max: 500 },
                accuracy: 0.95,
                mistakeChance: 0.02,
                powerCooldown: 8000,      // 8 sn
                powerLimits: { freeze: 2, shield: 1, radar: 3, safeburst: 2 },
                powerUseChance: 0.8,      // %80 güç kullanma şansı
                riskTolerance: 0.45
            }
        };
        return configs[difficulty] || configs.medium;
    }
    
    // ==================== ÖĞRENME SİSTEMİ ====================
    
    loadLearning() {
        try {
            const data = localStorage.getItem('mineduel_bot_learning_v2');
            if (data) {
                const parsed = JSON.parse(data);
                console.log('[AI] Learning data loaded:', parsed.gamesPlayed, 'games');
                return parsed;
            }
        } catch (e) {}
        
        return {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            
            // Güç etkinliği
            powerStats: {
                freeze: { used: 0, wonAfter: 0 },
                shield: { used: 0, savedMine: 0 },
                radar: { used: 0, foundMine: 0 },
                safeburst: { used: 0, pointsGained: 0 }
            },
            
            // Hamle istatistikleri
            moveStats: {
                totalMoves: 0,
                correctMoves: 0,
                mineHits: 0
            },
            
            // Kazanma stratejileri
            winPatterns: {
                aggressivePower: 0,
                defensivePlay: 0,
                speedWin: 0
            }
        };
    }
    
    saveLearning() {
        try {
            localStorage.setItem('mineduel_bot_learning_v2', JSON.stringify(this.learning));
        } catch (e) {}
    }
    
    // ==================== YAŞAM DÖNGÜSÜ ====================
    
    start(board, gridSize) {
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        this.reset();
        console.log(`[AI] Started on ${gridSize}x${gridSize}`);
        this.scheduleThink();
    }
    
    stop() {
        this.isActive = false;
        if (this.moveInterval) {
            clearTimeout(this.moveInterval);
            this.moveInterval = null;
        }
    }
    
    reset() {
        this.knowledge.safeCells.clear();
        this.knowledge.mineCells.clear();
        this.knowledge.flaggedCells.clear();
        this.knowledge.wrongFlags.clear();
        this.knowledge.probabilities.clear();
        this.powers.used = { freeze: 0, shield: 0, radar: 0, safeburst: 0 };
        this.powers.lastUseTime = 0;
        this.brain.stuckCount = 0;
        this.brain.mood = 'balanced';
    }
    
    freeze(duration) {
        this.isFrozen = true;
        this.frozenUntil = Date.now() + duration;
    }
    
    scheduleThink() {
        if (!this.isActive || this.game?.gameEnded) return;
        
        const { min, max } = this.config.thinkTime;
        const delay = min + Math.random() * (max - min);
        
        this.moveInterval = setTimeout(() => this.think(), delay);
    }
    
    // ==================== ANA DÜŞÜNME DÖNGÜSÜ ====================
    
    async think() {
        if (!this.isActive || this.isThinking || this.game?.gameEnded) return;
        
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.scheduleThink();
            return;
        }
        this.isFrozen = false;
        
        this.isThinking = true;
        this.game?.showBotThinking?.();
        
        try {
            // 1. Durumu algıla
            this.perceive();
            
            // 2. Tahtayı analiz et
            this.analyzeBoard();
            
            // 3. Yanlış bayrakları tespit et
            this.detectWrongFlags();
            
            // 4. GÜÇ KULLANMA KARARI - Her düşünmede kontrol et
            if (this.shouldUsePower()) {
                const powerUsed = this.tryUsePower();
                if (powerUsed) {
                    this.finishThinking();
                    return;
                }
            }
            
            // 5. En iyi hamleyi bul (Committee AI)
            const decision = this.committeeDecision();
            
            // 6. Hamleyi uygula
            if (decision) {
                this.execute(decision);
                this.brain.stuckCount = 0;
            } else {
                this.brain.stuckCount++;
                if (this.brain.stuckCount >= 3) {
                    this.emergencyMove();
                }
            }
            
        } catch (error) {
            console.error('[AI] Think error:', error);
        }
        
        this.finishThinking();
    }
    
    finishThinking() {
        this.isThinking = false;
        this.game?.hideBotThinking?.();
        
        if (this.isActive && !this.game?.gameEnded) {
            this.scheduleThink();
        }
    }
    
    // ==================== ALGI SİSTEMİ ====================
    
    perceive() {
        const p = this.brain.perception;
        
        p.myScore = this.game?.opponentScore || 0;
        p.playerScore = this.game?.score || 0;
        p.scoreDiff = p.myScore - p.playerScore;
        
        const elapsed = Date.now() - (this.game?.matchStartTime || Date.now());
        const total = this.game?.matchDuration || 120000;
        p.timeLeft = Math.max(0, 100 - (elapsed / total) * 100);
        
        // Oyun fazı
        if (p.timeLeft > 70) p.gamePhase = 'early';
        else if (p.timeLeft > 40) p.gamePhase = 'mid';
        else if (p.timeLeft > 15) p.gamePhase = 'late';
        else p.gamePhase = 'critical';
        
        // Ruh hali
        if (p.scoreDiff < -50) this.brain.mood = 'desperate';
        else if (p.scoreDiff < -20) this.brain.mood = 'aggressive';
        else if (p.scoreDiff > 30) this.brain.mood = 'defensive';
        else this.brain.mood = 'balanced';
    }
    
    // ==================== TAHTA ANALİZİ ====================
    
    analyzeBoard() {
        if (!this.board?.grid) return;
        
        this.knowledge.safeCells.clear();
        this.knowledge.mineCells.clear();
        this.knowledge.probabilities.clear();
        
        // Bayraklı hücreleri güncelle
        this.knowledge.flaggedCells.clear();
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (this.board.grid[y][x].isFlagged) {
                    this.knowledge.flaggedCells.add(`${x},${y}`);
                }
            }
        }
        
        // Sayı hücrelerinden bilgi çıkar
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (cell.isRevealed && !cell.isMine && cell.neighborCount > 0) {
                    this.analyzeNumberCell(x, y, cell.neighborCount);
                }
            }
        }
        
        // Temel olasılıkları hesapla
        this.calculateBaseProbabilities();
    }
    
    analyzeNumberCell(x, y, number) {
        const neighbors = this.getNeighbors(x, y);
        const unrevealed = [];
        let flaggedCount = 0;
        
        for (const n of neighbors) {
            const cell = this.board.grid[n.y][n.x];
            if (cell.isFlagged) flaggedCount++;
            else if (!cell.isRevealed) unrevealed.push(n);
        }
        
        const remainingMines = number - flaggedCount;
        
        if (unrevealed.length === 0) return;
        
        // Kesin mayınlar
        if (remainingMines === unrevealed.length && remainingMines > 0) {
            unrevealed.forEach(n => this.knowledge.mineCells.add(`${n.x},${n.y}`));
        }
        
        // Kesin güvenli
        if (remainingMines === 0) {
            unrevealed.forEach(n => this.knowledge.safeCells.add(`${n.x},${n.y}`));
        }
        
        // Olasılık
        if (remainingMines > 0 && remainingMines < unrevealed.length) {
            const prob = remainingMines / unrevealed.length;
            unrevealed.forEach(n => {
                const key = `${n.x},${n.y}`;
                const current = this.knowledge.probabilities.get(key) || 0;
                this.knowledge.probabilities.set(key, Math.max(current, prob));
            });
        }
    }
    
    calculateBaseProbabilities() {
        const totalMines = this.board?.mines?.length || 15;
        const flagged = this.knowledge.flaggedCells.size;
        const remaining = totalMines - flagged;
        
        let unrevealedCount = 0;
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                const key = `${x},${y}`;
                if (!cell.isRevealed && !cell.isFlagged && !this.knowledge.probabilities.has(key)) {
                    unrevealedCount++;
                }
            }
        }
        
        const baseProb = unrevealedCount > 0 ? remaining / unrevealedCount : 0.5;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                const key = `${x},${y}`;
                if (!cell.isRevealed && !cell.isFlagged && !this.knowledge.probabilities.has(key)) {
                    this.knowledge.probabilities.set(key, baseProb);
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
    
    // ==================== YANLIŞ BAYRAK TESPİTİ ====================
    
    detectWrongFlags() {
        this.knowledge.wrongFlags.clear();
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (!cell?.isFlagged) continue;
                
                // Bu bayrak kesin güvenli olarak işaretlenmişse yanlış
                const key = `${x},${y}`;
                if (this.knowledge.safeCells.has(key)) {
                    this.knowledge.wrongFlags.add(key);
                    continue;
                }
                
                // Komşu sayılardan kontrol
                const neighbors = this.getNeighbors(x, y);
                for (const n of neighbors) {
                    const nc = this.board.grid[n.y][n.x];
                    if (!nc.isRevealed || nc.isMine || nc.neighborCount === 0) continue;
                    
                    const nNeighbors = this.getNeighbors(n.x, n.y);
                    let flagCount = 0;
                    for (const nn of nNeighbors) {
                        if (this.board.grid[nn.y][nn.x].isFlagged) flagCount++;
                    }
                    
                    // Bayrak sayısı numara'dan fazlaysa yanlış bayrak var
                    if (flagCount > nc.neighborCount) {
                        this.knowledge.wrongFlags.add(key);
                        break;
                    }
                }
            }
        }
    }
    
    // ==================== COMMITTEE AI - ÇOKLU KARAR ====================
    
    committeeDecision() {
        // 3 farklı strateji ile karar ver
        const strategies = [
            this.safeFirstStrategy(),      // Güvenli öncelikli
            this.probabilisticStrategy(),  // Olasılık bazlı
            this.aggressiveStrategy()      // Agresif
        ];
        
        // Her stratejiyi puanla
        const votes = [];
        
        for (const decision of strategies) {
            if (decision) {
                votes.push(decision);
            }
        }
        
        if (votes.length === 0) return null;
        
        // En yüksek öncelikli kararı seç
        votes.sort((a, b) => b.priority - a.priority);
        
        // Zorluk seviyesine göre doğru kararı seç
        if (Math.random() < this.config.accuracy) {
            return votes[0]; // En iyi karar
        } else {
            // Hata yap - rastgele seç
            const idx = Math.floor(Math.random() * votes.length);
            return votes[idx];
        }
    }
    
    safeFirstStrategy() {
        // Önce yanlış bayrağı düzelt
        if (this.knowledge.wrongFlags.size > 0) {
            const wrongKey = this.knowledge.wrongFlags.values().next().value;
            const [x, y] = wrongKey.split(',').map(Number);
            return { type: 'unflag', x, y, priority: 100, reason: 'Yanlış bayrak düzelt' };
        }
        
        // Kesin güvenli hücre
        if (this.knowledge.safeCells.size > 0) {
            const key = this.knowledge.safeCells.values().next().value;
            const [x, y] = key.split(',').map(Number);
            return { type: 'reveal', x, y, priority: 95, reason: 'Kesin güvenli' };
        }
        
        // Kesin mayını bayrakla
        for (const key of this.knowledge.mineCells) {
            if (!this.knowledge.flaggedCells.has(key)) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isFlagged && !cell.isRevealed) {
                    return { type: 'flag', x, y, priority: 90, reason: 'Kesin mayın' };
                }
            }
        }
        
        return null;
    }
    
    probabilisticStrategy() {
        const maxRisk = this.config.riskTolerance;
        const candidates = [];
        
        for (const [key, prob] of this.knowledge.probabilities) {
            if (prob <= maxRisk && !this.knowledge.mineCells.has(key)) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    candidates.push({ x, y, prob });
                }
            }
        }
        
        if (candidates.length === 0) return null;
        
        candidates.sort((a, b) => a.prob - b.prob);
        const best = candidates[0];
        
        return {
            type: 'reveal',
            x: best.x,
            y: best.y,
            priority: 70 - best.prob * 50,
            reason: `Risk: %${(best.prob * 100).toFixed(0)}`
        };
    }
    
    aggressiveStrategy() {
        // Desperate modda daha riskli hamleler
        if (this.brain.mood !== 'desperate' && this.brain.mood !== 'aggressive') {
            return null;
        }
        
        const candidates = [];
        
        for (const [key, prob] of this.knowledge.probabilities) {
            if (prob <= 0.5 && !this.knowledge.mineCells.has(key)) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    candidates.push({ x, y, prob });
                }
            }
        }
        
        if (candidates.length === 0) return null;
        
        // Rastgele bir tanesini seç (agresif)
        const idx = Math.floor(Math.random() * Math.min(5, candidates.length));
        const chosen = candidates[idx];
        
        return {
            type: 'reveal',
            x: chosen.x,
            y: chosen.y,
            priority: 40,
            reason: 'Agresif hamle'
        };
    }
    
    emergencyMove() {
        // Hiçbir şey bulamadığında acil hamle
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                const key = `${x},${y}`;
                if (cell && !cell.isRevealed && !cell.isFlagged && !this.knowledge.mineCells.has(key)) {
                    this.game?.makeBotMove?.(x, y);
                    console.log('[AI] Emergency move:', x, y);
                    return;
                }
            }
        }
    }
    
    // ==================== GÜÇ KULLANIM SİSTEMİ ====================
    
    shouldUsePower() {
        const timeSinceLast = Date.now() - this.powers.lastUseTime;
        if (timeSinceLast < this.powers.cooldown) return false;
        
        const myScore = this.game?.opponentScore || 0;
        if (myScore < 35) return false;
        
        // Zorluk seviyesine göre şans
        return Math.random() < this.config.powerUseChance;
    }
    
    tryUsePower() {
        const p = this.brain.perception;
        const myScore = p.myScore;
        const playerScore = p.playerScore;
        const diff = myScore - playerScore;
        
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        
        console.log(`[AI] Trying power - Score: ${myScore}, Phase: ${p.gamePhase}, Mood: ${this.brain.mood}`);
        
        // ===== FREEZE =====
        if (this.canUsePower('freeze', costs.freeze)) {
            // Oyuncu önde veya hızlı ilerliyor
            if (playerScore > myScore + 20 || this.brain.mood === 'desperate') {
                if (this.usePower('freeze', costs.freeze)) {
                    console.log('[AI] 🧊 FREEZE used!');
                    return true;
                }
            }
        }
        
        // ===== RADAR =====
        if (this.canUsePower('radar', costs.radar)) {
            // Güvenli hücre bulamadığında
            if (this.knowledge.safeCells.size === 0 || this.brain.stuckCount >= 1) {
                if (this.usePower('radar', costs.radar)) {
                    console.log('[AI] 📡 RADAR used!');
                    return true;
                }
            }
        }
        
        // ===== SAFEBURST =====
        if (this.canUsePower('safeburst', costs.safeburst)) {
            // Gerideyken veya mid-game'de
            if (diff < -15 && p.gamePhase !== 'early') {
                if (this.usePower('safeburst', costs.safeburst)) {
                    console.log('[AI] 💥 SAFEBURST used!');
                    return true;
                }
            }
        }
        
        // ===== SHIELD =====
        if (this.canUsePower('shield', costs.shield)) {
            // Öndeyken ve late game
            if (diff > 15 && (p.gamePhase === 'late' || p.gamePhase === 'critical')) {
                if (this.usePower('shield', costs.shield)) {
                    console.log('[AI] 🛡️ SHIELD used!');
                    return true;
                }
            }
        }
        
        return false;
    }
    
    canUsePower(power, cost) {
        const myScore = this.game?.opponentScore || 0;
        const used = this.powers.used[power] || 0;
        const limit = this.powers.limits[power] || 0;
        
        return myScore >= cost && used < limit;
    }
    
    usePower(power, cost) {
        if (!this.game?.useBotPower) {
            console.log('[AI] useBotPower not available');
            return false;
        }
        
        const result = this.game.useBotPower(power, cost);
        
        if (result) {
            this.powers.used[power]++;
            this.powers.lastUseTime = Date.now();
            
            // Öğrenme istatistiği
            this.learning.powerStats[power].used++;
            this.saveLearning();
        }
        
        return result;
    }
    
    // ==================== HAMLE UYGULAMA ====================
    
    execute(decision) {
        console.log(`[AI] ${decision.reason}`);
        
        switch (decision.type) {
            case 'unflag':
                this.game?.makeBotUnflag?.(decision.x, decision.y);
                this.knowledge.flaggedCells.delete(`${decision.x},${decision.y}`);
                break;
                
            case 'reveal':
                const result = this.game?.makeBotMove?.(decision.x, decision.y);
                if (result?.hitMine) {
                    this.learning.moveStats.mineHits++;
                } else {
                    this.learning.moveStats.correctMoves++;
                }
                this.learning.moveStats.totalMoves++;
                break;
                
            case 'flag':
                this.game?.makeBotFlag?.(decision.x, decision.y);
                this.knowledge.flaggedCells.add(`${decision.x},${decision.y}`);
                break;
        }
    }
    
    // ==================== OYUN SONU ====================
    
    endGameLearning(botWon) {
        this.learning.gamesPlayed++;
        if (botWon) {
            this.learning.wins++;
        } else {
            this.learning.losses++;
        }
        
        this.saveLearning();
        
        const winRate = this.learning.gamesPlayed > 0 
            ? (this.learning.wins / this.learning.gamesPlayed * 100).toFixed(1) 
            : 0;
            
        console.log(`[AI] Game ${botWon ? 'WON' : 'LOST'} | Record: ${this.learning.wins}/${this.learning.gamesPlayed} (${winRate}%)`);
    }
}
