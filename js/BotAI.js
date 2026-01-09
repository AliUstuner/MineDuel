/**
 * BotAI.js - GERÇEK YAPAY ZEKA SİSTEMİ
 * 
 * Bu AI kendi kararlarını verir. Her durumu analiz eder ve
 * en mantıklı hamleyi seçer. Sabit kurallar yok - dinamik düşünce var.
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
        
        // ==================== BEYİN ====================
        this.brain = {
            // Anlık durum algısı
            perception: {
                myScore: 0,
                playerScore: 0,
                scoreDiff: 0,
                timeLeft: 100,
                myProgress: 0,
                playerProgress: 0,
                threat: 0,          // 0-100 tehdit seviyesi
                opportunity: 0,     // 0-100 fırsat seviyesi
                urgency: 0          // 0-100 aciliyet
            },
            
            // Hafıza
            memory: {
                lastPlayerScore: 0,
                playerScoreHistory: [],
                myMoveHistory: [],
                powerHistory: [],
                mistakeCount: 0,
                successStreak: 0
            },
            
            // Duygusal durum (karar etkiler)
            mood: 'calm', // calm, aggressive, defensive, desperate, confident
            
            // Güç durumu
            powers: {
                used: { freeze: 0, shield: 0, radar: 0, safeburst: 0 },
                lastUseTime: 0
            }
        };
        
        // Zorluk ayarları
        this.config = this.getConfig(difficulty);
        
        // Bilinen hücreler
        this.knowledge = {
            safeCells: new Set(),
            mineCells: new Set(),
            flaggedCells: new Set(),
            probabilityMap: new Map()
        };
        
        console.log(`[AI] ${difficulty.toUpperCase()} Brain initialized`);
    }
    
    getConfig(difficulty) {
        const configs = {
            easy: {
                thinkSpeed: { min: 1200, max: 2000 },
                intelligence: 0.6,      // Ne kadar akıllı (0-1)
                powerAwareness: 0.3,    // Güç kullanma eğilimi
                maxPowers: { freeze: 0, shield: 0, radar: 1, safeburst: 0 },
                minPowerCooldown: 25000
            },
            medium: {
                thinkSpeed: { min: 700, max: 1300 },
                intelligence: 0.8,
                powerAwareness: 0.6,
                maxPowers: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
                minPowerCooldown: 15000
            },
            hard: {
                thinkSpeed: { min: 400, max: 800 },
                intelligence: 0.92,
                powerAwareness: 0.8,
                maxPowers: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
                minPowerCooldown: 10000
            },
            expert: {
                thinkSpeed: { min: 200, max: 500 },
                intelligence: 0.98,
                powerAwareness: 0.95,
                maxPowers: { freeze: 2, shield: 1, radar: 3, safeburst: 2 },
                minPowerCooldown: 6000
            }
        };
        return configs[difficulty] || configs.medium;
    }

    // ==================== YAŞAM DÖNGÜSÜ ====================
    
    start(board, gridSize) {
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        this.reset();
        console.log(`[AI] Starting on ${gridSize}x${gridSize} board`);
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
        this.knowledge.probabilityMap.clear();
        this.brain.powers.used = { freeze: 0, shield: 0, radar: 0, safeburst: 0 };
        this.brain.powers.lastUseTime = 0;
        this.brain.memory = {
            lastPlayerScore: 0,
            playerScoreHistory: [],
            myMoveHistory: [],
            powerHistory: [],
            mistakeCount: 0,
            successStreak: 0
        };
        this.brain.mood = 'calm';
    }
    
    freeze(duration) {
        this.isFrozen = true;
        this.frozenUntil = Date.now() + duration;
    }
    
    scheduleThink() {
        if (!this.isActive || this.game?.gameEnded) return;
        
        const { min, max } = this.config.thinkSpeed;
        const delay = min + Math.random() * (max - min);
        
        this.moveInterval = setTimeout(() => this.think(), delay);
    }

    // ==================== ANA DÜŞÜNCE DÖNGÜSÜ ====================
    
    async think() {
        if (!this.isActive || this.isThinking || this.game?.gameEnded) return;
        
        // Dondurulmuş mu?
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.scheduleThink();
            return;
        }
        this.isFrozen = false;
        
        this.isThinking = true;
        this.game?.showBotThinking?.();
        
        try {
            // 1. ALGI - Dünyayı anla
            this.perceive();
            
            // 2. DUYGU - Ruh halini belirle
            this.updateMood();
            
            // 3. ANALİZ - Tahtayı analiz et
            this.analyzeBoard();
            
            // 4. KARAR - Ne yapacağına karar ver
            const decision = this.decide();
            
            // 5. EYLEM - Kararı uygula
            if (decision) {
                this.execute(decision);
            }
            
        } catch (error) {
            console.error('[AI] Think error:', error);
        }
        
        this.isThinking = false;
        this.game?.hideBotThinking?.();
        
        if (this.isActive && !this.game?.gameEnded) {
            this.scheduleThink();
        }
    }

    // ==================== 1. ALGI SİSTEMİ ====================
    
    perceive() {
        const p = this.brain.perception;
        
        // Skorlar
        p.myScore = this.game?.opponentScore || 0;
        p.playerScore = this.game?.score || 0;
        p.scoreDiff = p.myScore - p.playerScore;
        
        // Zaman
        const elapsed = Date.now() - (this.game?.matchStartTime || Date.now());
        const total = this.game?.matchDuration || 120000;
        p.timeLeft = Math.max(0, 100 - (elapsed / total) * 100);
        
        // İlerleme hesapla
        p.myProgress = this.calculateMyProgress();
        p.playerProgress = this.estimatePlayerProgress();
        
        // Tehdit seviyesi (0-100)
        // Oyuncu önde + hızlı ilerliyorsa tehdit yüksek
        const playerLead = Math.max(0, p.playerScore - p.myScore);
        const playerSpeed = this.calculatePlayerSpeed();
        p.threat = Math.min(100, (playerLead / 2) + (playerSpeed * 10));
        
        // Fırsat seviyesi (0-100)
        // Güvenli hücreler varsa ve skor iyi ise fırsat yüksek
        const safeCellCount = this.knowledge.safeCells.size;
        p.opportunity = Math.min(100, safeCellCount * 20 + (p.scoreDiff > 0 ? 20 : 0));
        
        // Aciliyet (0-100)
        // Az zaman + geride = yüksek aciliyet
        const timePressure = (100 - p.timeLeft) / 2;
        const scorePressure = Math.max(0, -p.scoreDiff) / 2;
        p.urgency = Math.min(100, timePressure + scorePressure);
        
        // Oyuncu skor geçmişini kaydet
        if (p.playerScore !== this.brain.memory.lastPlayerScore) {
            this.brain.memory.playerScoreHistory.push({
                score: p.playerScore,
                time: Date.now()
            });
            // Son 10 kaydı tut
            if (this.brain.memory.playerScoreHistory.length > 10) {
                this.brain.memory.playerScoreHistory.shift();
            }
            this.brain.memory.lastPlayerScore = p.playerScore;
        }
    }
    
    calculateMyProgress() {
        if (!this.board?.grid) return 0;
        
        let revealed = 0;
        const total = this.gridSize * this.gridSize;
        const mineCount = this.board.mines?.length || 0;
        const safeCells = total - mineCount;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (this.board.grid[y][x].isRevealed) revealed++;
            }
        }
        
        return safeCells > 0 ? (revealed / safeCells) * 100 : 0;
    }
    
    estimatePlayerProgress() {
        const playerScore = this.game?.score || 0;
        // Ortalama hücre başına 5 puan varsay
        const estimatedCells = playerScore / 5;
        const mineCount = this.game?.mineCount || 15;
        const safeCells = (this.gridSize * this.gridSize) - mineCount;
        return Math.min(100, (estimatedCells / safeCells) * 100);
    }
    
    calculatePlayerSpeed() {
        const history = this.brain.memory.playerScoreHistory;
        if (history.length < 2) return 0;
        
        const recent = history.slice(-3);
        if (recent.length < 2) return 0;
        
        const first = recent[0];
        const last = recent[recent.length - 1];
        const timeDiff = (last.time - first.time) / 1000; // saniye
        const scoreDiff = last.score - first.score;
        
        return timeDiff > 0 ? scoreDiff / timeDiff : 0;
    }

    // ==================== 2. DUYGU SİSTEMİ ====================
    
    updateMood() {
        const p = this.brain.perception;
        
        // Ruh halini belirle
        if (p.scoreDiff > 50 && p.timeLeft < 30) {
            this.brain.mood = 'confident';  // Çok önde ve az zaman
        } else if (p.scoreDiff < -60 && p.timeLeft < 25) {
            this.brain.mood = 'desperate';  // Çok geride ve az zaman
        } else if (p.threat > 60) {
            this.brain.mood = 'aggressive'; // Tehdit altında
        } else if (p.scoreDiff > 30) {
            this.brain.mood = 'defensive';  // Önde, korumacı ol
        } else {
            this.brain.mood = 'calm';       // Normal oyna
        }
    }

    // ==================== 3. TAHTA ANALİZİ ====================
    
    analyzeBoard() {
        if (!this.board?.grid) return;
        
        this.knowledge.safeCells.clear();
        this.knowledge.mineCells.clear();
        this.knowledge.probabilityMap.clear();
        
        // Tüm açık hücreleri analiz et
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                
                if (cell.isRevealed && !cell.isMine && cell.neighborCount > 0) {
                    this.analyzeNumberCell(x, y, cell.neighborCount);
                }
                
                if (cell.isFlagged) {
                    this.knowledge.flaggedCells.add(`${x},${y}`);
                }
            }
        }
        
        // Kalan hücreler için temel olasılık hesapla
        this.calculateBaseProbabilities();
    }
    
    analyzeNumberCell(x, y, number) {
        const neighbors = this.getNeighbors(x, y);
        
        const unrevealed = [];
        let flaggedCount = 0;
        
        for (const n of neighbors) {
            const cell = this.board.grid[n.y][n.x];
            if (cell.isFlagged) {
                flaggedCount++;
            } else if (!cell.isRevealed) {
                unrevealed.push(n);
            }
        }
        
        const remainingMines = number - flaggedCount;
        
        if (unrevealed.length === 0) return;
        
        // Tüm kalanlar mayın
        if (remainingMines === unrevealed.length && remainingMines > 0) {
            for (const n of unrevealed) {
                this.knowledge.mineCells.add(`${n.x},${n.y}`);
            }
        }
        
        // Tüm kalanlar güvenli
        if (remainingMines === 0) {
            for (const n of unrevealed) {
                this.knowledge.safeCells.add(`${n.x},${n.y}`);
            }
        }
        
        // Olasılık hesapla
        if (remainingMines > 0 && remainingMines < unrevealed.length) {
            const prob = remainingMines / unrevealed.length;
            for (const n of unrevealed) {
                const key = `${n.x},${n.y}`;
                const current = this.knowledge.probabilityMap.get(key) || 0;
                this.knowledge.probabilityMap.set(key, Math.max(current, prob));
            }
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
                if (!cell.isRevealed && !cell.isFlagged && !this.knowledge.probabilityMap.has(key)) {
                    unrevealedCount++;
                }
            }
        }
        
        const baseProb = unrevealedCount > 0 ? remaining / unrevealedCount : 0.5;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                const key = `${x},${y}`;
                if (!cell.isRevealed && !cell.isFlagged && !this.knowledge.probabilityMap.has(key)) {
                    this.knowledge.probabilityMap.set(key, baseProb);
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

    // ==================== 4. KARAR SİSTEMİ ====================
    
    decide() {
        const p = this.brain.perception;
        const mood = this.brain.mood;
        
        // Her karar anında düşün: "Şu an en iyi ne yapabilirim?"
        
        const options = [];
        
        // Seçenek 1: Güvenli hücre aç
        if (this.knowledge.safeCells.size > 0) {
            options.push({
                type: 'reveal_safe',
                priority: 90,  // Yüksek öncelik
                reason: 'Kesin güvenli hücre var'
            });
        }
        
        // Seçenek 2: Mayın bayrakla
        const unflaggedMine = this.findUnflaggedMine();
        if (unflaggedMine) {
            options.push({
                type: 'flag_mine',
                target: unflaggedMine,
                priority: 85,
                reason: 'Kesin mayın bulundu'
            });
        }
        
        // Seçenek 3: Düşük olasılıklı hücre aç
        const lowRiskCell = this.findLowRiskCell();
        if (lowRiskCell) {
            options.push({
                type: 'reveal_risky',
                target: lowRiskCell,
                priority: 50 + (100 - lowRiskCell.probability * 100),
                reason: `Düşük risk: %${(lowRiskCell.probability * 100).toFixed(0)}`
            });
        }
        
        // Seçenek 4: Güç kullan
        const powerDecision = this.considerPower();
        if (powerDecision) {
            options.push(powerDecision);
        }
        
        // Seçenek 5: Rastgele hamle (son çare)
        const randomCell = this.findRandomCell();
        if (randomCell) {
            options.push({
                type: 'reveal_random',
                target: randomCell,
                priority: 20,
                reason: 'Başka seçenek yok'
            });
        }
        
        // Zeka seviyesine göre seçim
        if (options.length === 0) return null;
        
        // Önceliklere göre sırala
        options.sort((a, b) => b.priority - a.priority);
        
        // Akıllı bot en iyi seçeneği seçer, aptal bot rastgele seçer
        if (Math.random() < this.config.intelligence) {
            return options[0];
        } else {
            // Rastgele bir seçenek seç
            const idx = Math.floor(Math.random() * Math.min(3, options.length));
            return options[idx];
        }
    }
    
    findUnflaggedMine() {
        for (const key of this.knowledge.mineCells) {
            if (!this.knowledge.flaggedCells.has(key)) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isFlagged && !cell.isRevealed) {
                    return { x, y };
                }
            }
        }
        return null;
    }
    
    findLowRiskCell() {
        const candidates = [];
        const maxRisk = this.brain.mood === 'desperate' ? 0.6 : 0.35;
        
        for (const [key, prob] of this.knowledge.probabilityMap) {
            if (prob <= maxRisk && !this.knowledge.mineCells.has(key)) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    candidates.push({ x, y, probability: prob });
                }
            }
        }
        
        if (candidates.length === 0) return null;
        
        candidates.sort((a, b) => a.probability - b.probability);
        return candidates[0];
    }
    
    findRandomCell() {
        const candidates = [];
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                const key = `${x},${y}`;
                if (cell && !cell.isRevealed && !cell.isFlagged && !this.knowledge.mineCells.has(key)) {
                    candidates.push({ x, y });
                }
            }
        }
        
        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // ==================== GÜÇ KARAR SİSTEMİ ====================
    
    considerPower() {
        const p = this.brain.perception;
        const mood = this.brain.mood;
        const timeSinceLast = Date.now() - this.brain.powers.lastUseTime;
        
        // Cooldown kontrolü
        if (timeSinceLast < this.config.minPowerCooldown) return null;
        
        // Yeterli skor var mı?
        if (p.myScore < 40) return null;
        
        // Güç kullanma eğilimi (rastgele faktör)
        if (Math.random() > this.config.powerAwareness) return null;
        
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        const used = this.brain.powers.used;
        const max = this.config.maxPowers;
        
        // ===== FREEZE =====
        // Düşünce: "Oyuncu benden iyi gidiyor, onu durdurmam lazım"
        if (used.freeze < max.freeze && p.myScore >= costs.freeze) {
            const shouldFreeze = 
                (p.threat > 50) ||                           // Tehdit altındayım
                (p.playerScore > p.myScore + 25) ||          // Oyuncu önde
                (mood === 'aggressive' && p.urgency > 40) || // Agresifim ve aceleci
                (mood === 'desperate');                       // Çaresizim
            
            if (shouldFreeze) {
                return {
                    type: 'use_power',
                    power: 'freeze',
                    priority: 80 + p.threat / 2,
                    reason: `Freeze: Tehdit ${p.threat.toFixed(0)}%, Oyuncu ${p.playerScore - p.myScore} önde`
                };
            }
        }
        
        // ===== RADAR =====
        // Düşünce: "Nereye bassam bilmiyorum, bilgiye ihtiyacım var"
        if (used.radar < max.radar && p.myScore >= costs.radar) {
            const noInfo = this.knowledge.safeCells.size === 0;
            const stuck = this.brain.memory.successStreak < -2;
            
            if (noInfo || stuck) {
                return {
                    type: 'use_power',
                    power: 'radar',
                    priority: 70,
                    reason: 'Radar: Bilgi gerekli'
                };
            }
        }
        
        // ===== SAFEBURST =====
        // Düşünce: "Gerideyim, hızlı puan almam lazım"
        if (used.safeburst < max.safeburst && p.myScore >= costs.safeburst) {
            const behind = p.playerScore > p.myScore + 20;
            const needSpeed = p.urgency > 50;
            
            if (behind && needSpeed) {
                return {
                    type: 'use_power',
                    power: 'safeburst',
                    priority: 75,
                    reason: `SafeBurst: ${p.playerScore - p.myScore} puan gerideyim`
                };
            }
        }
        
        // ===== SHIELD =====
        // Düşünce: "Öndeyim, avantajımı korumam lazım"
        if (used.shield < max.shield && p.myScore >= costs.shield) {
            const ahead = p.myScore > p.playerScore + 20;
            const lateGame = p.timeLeft < 40;
            
            if (ahead && lateGame) {
                return {
                    type: 'use_power',
                    power: 'shield',
                    priority: 65,
                    reason: `Shield: ${p.myScore - p.playerScore} önde, koruma`
                };
            }
        }
        
        return null;
    }

    // ==================== 5. EYLEM SİSTEMİ ====================
    
    execute(decision) {
        console.log(`[AI] ${this.brain.mood.toUpperCase()} | ${decision.type}: ${decision.reason}`);
        
        switch (decision.type) {
            case 'reveal_safe':
                this.revealSafeCell();
                break;
                
            case 'flag_mine':
                this.flagCell(decision.target.x, decision.target.y);
                break;
                
            case 'reveal_risky':
            case 'reveal_random':
                this.revealCell(decision.target.x, decision.target.y);
                break;
                
            case 'use_power':
                this.usePower(decision.power);
                break;
        }
    }
    
    revealSafeCell() {
        const safeKey = this.knowledge.safeCells.values().next().value;
        if (!safeKey) return;
        
        const [x, y] = safeKey.split(',').map(Number);
        this.knowledge.safeCells.delete(safeKey);
        this.revealCell(x, y);
    }
    
    revealCell(x, y) {
        const result = this.game?.makeBotMove?.(x, y);
        
        if (result) {
            this.brain.memory.myMoveHistory.push({
                x, y,
                result: result.hitMine ? 'mine' : 'safe',
                time: Date.now()
            });
            
            if (result.hitMine) {
                this.brain.memory.mistakeCount++;
                this.brain.memory.successStreak = Math.min(0, this.brain.memory.successStreak - 1);
            } else {
                this.brain.memory.successStreak = Math.max(0, this.brain.memory.successStreak + 1);
            }
        }
    }
    
    flagCell(x, y) {
        this.game?.makeBotFlag?.(x, y);
        this.knowledge.flaggedCells.add(`${x},${y}`);
    }
    
    usePower(power) {
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        
        if (this.game?.useBotPower?.(power, costs[power])) {
            this.brain.powers.used[power]++;
            this.brain.powers.lastUseTime = Date.now();
            
            this.brain.memory.powerHistory.push({
                power,
                time: Date.now(),
                myScore: this.brain.perception.myScore,
                playerScore: this.brain.perception.playerScore
            });
            
            console.log(`[AI] POWER USED: ${power.toUpperCase()}`);
        }
    }

    // ==================== ÖĞRENME ====================
    
    endGameLearning(won, finalScore, opponentScore) {
        console.log(`[AI] Game End: ${won ? 'WON' : 'LOST'} | ${finalScore} vs ${opponentScore}`);
        console.log(`[AI] Mistakes: ${this.brain.memory.mistakeCount}`);
        console.log(`[AI] Powers used:`, this.brain.powers.used);
    }
}
