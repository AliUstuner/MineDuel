/**
 * BotAI.js - GLOBAL AKILLI YAPAY ZEKA
 * 
 * Özellikler:
 * - BÜTÜN OYUNCULARDAN ÖĞRENEN TEK BİR YAPAY ZEKA
 * - Supabase ile global öğrenme verisi senkronizasyonu
 * - Radar sonuçlarını görür ve mayınları işaretler
 * - Oyuncu tahtasını izler ve analiz eder
 * - Güçleri stratejik olarak seçer
 * - Kendi kararlarını verir
 * 
 * v6.1 - GLOBAL AI: Herkes aynı AI ile oynuyor!
 * Build: 20260110-001
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
        this.config = this.getConfig(difficulty);
        
        // API endpoint - stats.js içinde birleştirildi
        this.API_URL = '/api/stats';
        
        // Global öğrenme başlangıçta yüklenecek
        this.globalLearningLoaded = false;
        
        // ==================== AKILLI BEYİN ====================
        this.brain = {
            // Kendi durumum
            myState: {
                score: 0,
                progress: 0,
                minesHit: 0,
                movesThisGame: 0
            },
            
            // Rakip (oyuncu) analizi
            playerState: {
                score: 0,
                lastScore: 0,
                scoreHistory: [],
                speed: 0,           // Puan/saniye
                isOnStreak: false,
                estimatedProgress: 0
            },
            
            // Oyun durumu
            gameState: {
                phase: 'early',     // early, mid, late, critical
                timeLeft: 100,
                scoreDiff: 0,
                urgency: 0          // 0-100
            },
            
            // Ruh hali - güç kararlarını etkiler
            mood: 'balanced',       // balanced, aggressive, defensive, desperate
            
            stuckCount: 0
        };
        
        // ==================== BİLGİ DEPOSU ====================
        this.knowledge = {
            safeCells: new Set(),
            mineCells: new Set(),
            flaggedCells: new Set(),
            wrongFlags: new Set(),
            probabilities: new Map(),
            
            // RADAR SONUÇLARI - Radardan öğrenilen mayınlar
            radarMines: new Set(),
            
            // İşlenmemiş radar mayınları (bayraklanmayı bekliyor)
            pendingRadarMines: []
        };
        
        // ==================== GÜÇ YÖNETİMİ ====================
        this.powers = {
            used: { freeze: 0, shield: 0, radar: 0, safeburst: 0 },
            lastUseTime: 0,
            cooldown: this.config.powerCooldown,
            limits: this.config.powerLimits,
            
            // Her güç için stratejik puanlama
            scores: { freeze: 0, shield: 0, radar: 0, safeburst: 0 }
        };
        
        // ==================== ÖĞRENME SİSTEMİ ====================
        // Önce localStorage'dan yükle (hızlı başlangıç için)
        this.learning = this.loadLearning();
        
        // Sonra global veriyi async yükle (Supabase'den)
        this.loadGlobalLearning();
        
        console.log(`[AI] ${difficulty.toUpperCase()} | Win Rate: ${this.getWinRate()}% | GLOBAL AI v6`);
    }
    
    // ==================== ZORLUK AYARLARI ====================
    
    getConfig(difficulty) {
        const configs = {
            easy: {
                thinkTime: { min: 1500, max: 2500 },
                accuracy: 0.55,
                powerCooldown: 30000,
                powerLimits: { freeze: 0, shield: 0, radar: 1, safeburst: 0 },
                riskTolerance: 0.25,
                playerWatchRate: 0.3   // Oyuncuyu %30 izler
            },
            medium: {
                thinkTime: { min: 800, max: 1400 },
                accuracy: 0.75,
                powerCooldown: 18000,
                powerLimits: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
                riskTolerance: 0.30,
                playerWatchRate: 0.6
            },
            hard: {
                thinkTime: { min: 500, max: 900 },
                accuracy: 0.88,
                powerCooldown: 12000,
                powerLimits: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
                riskTolerance: 0.35,
                playerWatchRate: 0.8
            },
            expert: {
                thinkTime: { min: 250, max: 500 },
                accuracy: 0.95,
                powerCooldown: 8000,
                powerLimits: { freeze: 2, shield: 1, radar: 3, safeburst: 2 },
                riskTolerance: 0.40,
                playerWatchRate: 0.95  // Oyuncuyu sürekli izler
            }
        };
        return configs[difficulty] || configs.medium;
    }
    
    // ==================== SAĞLAM ÖĞRENME SİSTEMİ ====================
    
    loadLearning() {
        const STORAGE_KEY = 'mineduel_ai_v6';
        
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                
                // Versiyon kontrolü - eski veriyi temizle
                if (!parsed.version || parsed.version < 6) {
                    console.log('[AI] Eski öğrenme verisi tespit edildi, sıfırlanıyor...');
                    localStorage.removeItem(STORAGE_KEY);
                    localStorage.removeItem('mineduel_ai_v5');
                    localStorage.removeItem('mineduel_ai_v4');
                    localStorage.removeItem('mineduel_bot_learning_v2');
                    return this.getDefaultLearning();
                }
                
                // Veri doğrulaması
                if (this.isValidLearningData(parsed)) {
                    console.log(`[AI] Öğrenme verisi yüklendi | Oyunlar: ${parsed.stats.gamesPlayed} | Kazanma: %${this.calculateWinRate(parsed)}`);
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('[AI] Öğrenme verisi yüklenemedi:', e);
        }
        
        return this.getDefaultLearning();
    }
    
    isValidLearningData(data) {
        // Temel yapı kontrolü
        if (!data || typeof data !== 'object') return false;
        if (!data.stats || !data.powers || !data.strategies || !data.patterns) return false;
        
        // Sayısal değer kontrolü
        const stats = data.stats;
        if (typeof stats.gamesPlayed !== 'number' || isNaN(stats.gamesPlayed)) return false;
        if (typeof stats.wins !== 'number' || isNaN(stats.wins)) return false;
        
        // Mantık kontrolü - wins, gamesPlayed'den fazla olamaz
        if (stats.wins > stats.gamesPlayed) return false;
        if (stats.losses > stats.gamesPlayed) return false;
        
        return true;
    }
    
    getDefaultLearning() {
        return {
            version: 6,  // Versiyon numarası - GLOBAL AI
            
            // Temel istatistikler
            stats: {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                totalScore: 0,
                avgScore: 0
            },
            
            // Güç etkinliği - basit ve güvenilir
            powers: {
                freeze: { used: 0, wonAfter: 0, effectiveness: 0.5 },
                shield: { used: 0, savedMines: 0, effectiveness: 0.5 },
                radar: { used: 0, minesFound: 0, effectiveness: 0.5 },
                safeburst: { used: 0, pointsGained: 0, effectiveness: 0.5 }
            },
            
            // Strateji başarısı
            strategies: {
                aggressive: { used: 0, won: 0, rate: 0.33 },
                defensive: { used: 0, won: 0, rate: 0.33 },
                balanced: { used: 0, won: 0, rate: 0.34 }
            },
            
            // Oyuncu kalıpları
            patterns: {
                avgPlayerSpeed: 5,      // Ortalama puan/saniye
                avgPlayerScore: 200,    // Ortalama oyuncu skoru
                playerUsedPowers: 0,    // Oyuncu güç kullanım sayısı
                gamesAnalyzed: 0
            }
        };
    }
    
    calculateWinRate(data) {
        if (!data?.stats?.gamesPlayed || data.stats.gamesPlayed === 0) return 0;
        return ((data.stats.wins / data.stats.gamesPlayed) * 100).toFixed(1);
    }
    
    saveLearning() {
        const STORAGE_KEY = 'mineduel_ai_v6';
        
        try {
            // Kaydetmeden önce doğrula
            if (!this.isValidLearningData(this.learning)) {
                console.warn('[AI] Geçersiz öğrenme verisi, kaydetme iptal');
                return;
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.learning));
        } catch (e) {
            console.warn('[AI] Öğrenme verisi kaydedilemedi:', e);
        }
    }
    
    // ==================== GLOBAL ÖĞRENME (SUPABASE) ====================
    
    /**
     * Supabase'den global öğrenme verisini yükle
     * BÜTÜN OYUNCULARDAN TOPLANAN VERİ
     */
    async loadGlobalLearning() {
        try {
            const response = await fetch(`${this.API_URL}?bot_learning=true`);
            if (!response.ok) {
                console.warn('[AI] Global veri çekilemedi:', response.status);
                return;
            }
            
            const globalData = await response.json();
            
            // Global veriyi yerel ile birleştir
            this.mergeGlobalLearning(globalData);
            this.globalLearningLoaded = true;
            
            console.log(`[GLOBAL AI] Yüklendi | Toplam Oyun: ${globalData.stats?.gamesPlayed || 0} | Global Win Rate: ${this.calculateGlobalWinRate(globalData)}%`);
        } catch (error) {
            console.warn('[AI] Global öğrenme yüklenemedi:', error);
        }
    }
    
    /**
     * Global veriyi yerel öğrenme ile birleştir
     * Global veriye daha fazla ağırlık ver (daha fazla oyun = daha güvenilir)
     */
    mergeGlobalLearning(globalData) {
        if (!globalData) return;
        
        const local = this.learning;
        const global = globalData;
        
        // Global veri varsa ve daha fazla oyun oynanmışsa, ona ağır bas
        const globalGames = global.stats?.gamesPlayed || 0;
        const localGames = local.stats?.gamesPlayed || 0;
        
        if (globalGames > localGames * 2) {
            // Global veri çok daha fazla, ona güven
            const globalWeight = 0.7;
            const localWeight = 0.3;
            
            // Güç etkinliklerini birleştir
            for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
                if (global.powers?.[power] && local.powers?.[power]) {
                    local.powers[power].effectiveness = 
                        global.powers[power].effectiveness * globalWeight + 
                        local.powers[power].effectiveness * localWeight;
                }
            }
            
            // Strateji oranlarını birleştir
            for (const strat of ['aggressive', 'defensive', 'balanced']) {
                if (global.strategies?.[strat] && local.strategies?.[strat]) {
                    local.strategies[strat].rate = 
                        global.strategies[strat].rate * globalWeight + 
                        local.strategies[strat].rate * localWeight;
                }
            }
            
            // Oyuncu kalıplarını birleştir
            if (global.patterns) {
                local.patterns.avgPlayerSpeed = 
                    (global.patterns.avgPlayerSpeed || 5) * globalWeight + 
                    local.patterns.avgPlayerSpeed * localWeight;
                local.patterns.avgPlayerScore = 
                    (global.patterns.avgPlayerScore || 200) * globalWeight + 
                    local.patterns.avgPlayerScore * localWeight;
            }
            
            console.log('[GLOBAL AI] Global veriler yerel ile birleştirildi (global ağırlıklı)');
        }
    }
    
    /**
     * Oyun sonunda global öğrenmeyi güncelle (Supabase'e kaydet)
     */
    async syncToGlobal(gameResult) {
        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameResult: {
                        botWon: gameResult.won,
                        draw: gameResult.draw,
                        playerScore: gameResult.playerScore || 0,
                        playerSpeed: this.brain.playerState.speed || 5,
                        gameDuration: gameResult.duration || 60000,
                        difficulty: this.difficulty,
                        strategy: this.brain.mood,
                        powersUsed: this.powers.used
                    }
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log(`[GLOBAL AI] Senkronize edildi | Toplam: ${result.totalGames} oyun | Global Win Rate: ${result.winRate}%`);
            }
        } catch (error) {
            console.warn('[AI] Global senkronizasyon başarısız:', error);
        }
    }
    
    calculateGlobalWinRate(data) {
        if (!data?.stats?.gamesPlayed || data.stats.gamesPlayed === 0) return 0;
        return ((data.stats.wins / data.stats.gamesPlayed) * 100).toFixed(1);
    }
    
    // ==================== GÜÇ KULLANIMI KAYDI ====================
    
    // Oyun sırasında güç kullanımını kaydet
    recordPowerUsage(power, result) {
        const p = this.learning.powers[power];
        if (!p) return;
        
        p.used++;
        
        // Özel sonuçları kaydet
        if (power === 'radar' && result?.minesFound) {
            p.minesFound += result.minesFound;
        }
        if (power === 'shield' && result?.savedFromMine) {
            p.savedMines++;
        }
        if (power === 'safeburst' && result?.pointsGained) {
            p.pointsGained += result.pointsGained;
        }
    }
    
    // Oyun sonu öğrenme - EN ÖNEMLİ FONKSİYON
    learnFromGame(gameResult) {
        const l = this.learning;
        const stats = l.stats;
        
        // Temel istatistikler
        stats.gamesPlayed++;
        stats.totalScore += gameResult.myScore || 0;
        stats.avgScore = Math.round(stats.totalScore / stats.gamesPlayed);
        
        if (gameResult.won) {
            stats.wins++;
        } else if (gameResult.draw) {
            stats.draws++;
        } else {
            stats.losses++;
        }
        
        // Güç etkinliği güncelle
        for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
            const p = l.powers[power];
            if (this.powers.used[power] > 0) {
                if (gameResult.won) {
                    p.wonAfter++;
                }
                // Etkinlik oranı = kazandığı oyunlar / kullandığı oyunlar
                p.effectiveness = p.used > 0 ? (p.wonAfter / p.used) : 0.5;
                // 0.2 - 0.8 arasında tut (çok düşük veya yüksek olmasın)
                p.effectiveness = Math.max(0.2, Math.min(0.8, p.effectiveness));
            }
        }
        
        // Strateji başarısı güncelle
        const mood = this.brain.mood;
        if (mood === 'aggressive' || mood === 'desperate') {
            l.strategies.aggressive.used++;
            if (gameResult.won) l.strategies.aggressive.won++;
        } else if (mood === 'defensive') {
            l.strategies.defensive.used++;
            if (gameResult.won) l.strategies.defensive.won++;
        } else {
            l.strategies.balanced.used++;
            if (gameResult.won) l.strategies.balanced.won++;
        }
        
        // Strateji oranlarını güncelle
        for (const strat of ['aggressive', 'defensive', 'balanced']) {
            const s = l.strategies[strat];
            s.rate = s.used > 0 ? (s.won / s.used) : 0.33;
            s.rate = Math.max(0.1, Math.min(0.9, s.rate));
        }
        
        // Oyuncu kalıplarını güncelle
        const pat = l.patterns;
        const playerScore = gameResult.playerScore || 0;
        const playerSpeed = this.brain.playerState.speed || 5;
        
        pat.gamesAnalyzed++;
        // Hareketli ortalama (son oyunlara daha fazla ağırlık)
        const weight = Math.min(0.3, 1 / pat.gamesAnalyzed);
        pat.avgPlayerScore = Math.round(pat.avgPlayerScore * (1 - weight) + playerScore * weight);
        pat.avgPlayerSpeed = pat.avgPlayerSpeed * (1 - weight) + playerSpeed * weight;
        
        // Yerel kaydet
        this.saveLearning();
        
        // 🌐 GLOBAL SENKRONIZASYON - Supabase'e gönder
        // Tüm oyuncuların verilerini birleştir
        this.syncToGlobal(gameResult);
        
        console.log(`[GLOBAL AI] Öğrenme güncellendi | Kazanma: %${this.calculateWinRate(l)} | En iyi strateji: ${this.getBestStrategy()}`);
    }
    }
    
    // En iyi stratejiyi öğrenmeden al
    getBestStrategy() {
        const strats = this.learning.strategies;
        let best = 'balanced';
        let bestRate = strats.balanced.rate;
        
        if (strats.aggressive.rate > bestRate && strats.aggressive.used >= 3) {
            best = 'aggressive';
            bestRate = strats.aggressive.rate;
        }
        if (strats.defensive.rate > bestRate && strats.defensive.used >= 3) {
            best = 'defensive';
        }
        
        return best;
    }
    
    // Güç önerisi al (öğrenmeye göre)
    getPowerRecommendation() {
        const powers = this.learning.powers;
        let best = null;
        let bestEff = 0;
        
        for (const [power, data] of Object.entries(powers)) {
            if (data.effectiveness > bestEff && data.used >= 2) {
                best = power;
                bestEff = data.effectiveness;
            }
        }
        
        return { power: best, effectiveness: bestEff };
    }
    
    getWinRate() {
        return this.calculateWinRate(this.learning);
    }
    
    // ==================== YAŞAM DÖNGÜSÜ ====================
    
    start(board, gridSize) {
        // Clear any previous state completely
        this.stop();
        
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        this.isThinking = false;
        this.isFrozen = false;
        this.frozenUntil = 0;
        
        this.reset();
        
        const winRate = this.getWinRate();
        const bestStrat = this.getBestStrategy();
        console.log(`[AI] Başladı | Zorluk: ${this.difficulty} | Oyunlar: ${this.learning.stats.gamesPlayed} | Kazanma: %${winRate} | En iyi strateji: ${bestStrat}`);
        
        this.scheduleThink();
    }
    
    stop() {
        this.isActive = false;
        this.isThinking = false;
        this.isFrozen = false;
        if (this.moveInterval) {
            clearTimeout(this.moveInterval);
            this.moveInterval = null;
        }
        console.log('[AI] Stopped');
    }
    
    reset() {
        this.knowledge.safeCells.clear();
        this.knowledge.mineCells.clear();
        this.knowledge.flaggedCells.clear();
        this.knowledge.wrongFlags.clear();
        this.knowledge.probabilities.clear();
        this.knowledge.radarMines.clear();
        this.knowledge.pendingRadarMines = [];
        
        this.powers.used = { freeze: 0, shield: 0, radar: 0, safeburst: 0 };
        this.powers.lastUseTime = 0;
        this.powers.scores = { freeze: 0, shield: 0, radar: 0, safeburst: 0 };
        
        this.brain.stuckCount = 0;
        this.brain.mood = 'balanced';
        this.brain.myState = { score: 0, progress: 0, minesHit: 0, movesThisGame: 0 };
        this.brain.playerState = { 
            score: 0, 
            lastScore: 0, 
            scoreHistory: [], 
            speed: 0, 
            isOnStreak: false, 
            estimatedProgress: 0 
        };
        
        // Learning null ise default oluştur
        if (!this.learning || !this.learning.patterns) {
            this.learning = this.getDefaultLearning();
        }
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
            // 1. Algıla - Hem kendi hem oyuncu durumunu
            this.perceive();
            
            // 2. Oyuncuyu izle ve analiz et
            this.watchPlayer();
            
            // 3. Kendi tahtamı analiz et
            this.analyzeBoard();
            
            // 4. Radar sonuçlarını kontrol et
            this.processRadarResults();
            
            // 5. Yanlış bayrakları tespit et
            this.detectWrongFlags();
            
            // 6. Ruh halini belirle
            this.updateMood();
            
            // 7. Güç stratejisini hesapla
            this.calculatePowerStrategy();
            
            // 8. En iyi eylemi seç
            const action = this.decideAction();
            
            // 9. Eylemi uygula
            if (action) {
                this.executeAction(action);
                this.brain.stuckCount = 0;
            } else {
                this.brain.stuckCount++;
                if (this.brain.stuckCount >= 3) {
                    this.emergencyAction();
                }
            }
            
        } catch (error) {
            console.error('[AI] Error:', error);
        }
        
        this.isThinking = false;
        this.game?.hideBotThinking?.();
        
        if (this.isActive && !this.game?.gameEnded) {
            this.scheduleThink();
        }
    }
    
    // ==================== 1. ALGI SİSTEMİ ====================
    
    perceive() {
        const b = this.brain;
        
        // Benim durumum
        b.myState.score = this.game?.opponentScore || 0;
        b.myState.progress = this.calculateMyProgress();
        
        // Oyuncu durumu
        b.playerState.score = this.game?.score || 0;
        
        // Zaman
        const elapsed = Date.now() - (this.game?.matchStartTime || Date.now());
        const total = this.game?.matchDuration || 120000;
        b.gameState.timeLeft = Math.max(0, 100 - (elapsed / total) * 100);
        
        // Skor farkı
        b.gameState.scoreDiff = b.myState.score - b.playerState.score;
        
        // Oyun fazı
        if (b.gameState.timeLeft > 70) b.gameState.phase = 'early';
        else if (b.gameState.timeLeft > 40) b.gameState.phase = 'mid';
        else if (b.gameState.timeLeft > 15) b.gameState.phase = 'late';
        else b.gameState.phase = 'critical';
        
        // Aciliyet hesapla
        const timePressure = (100 - b.gameState.timeLeft) / 2;
        const scorePressure = Math.max(0, -b.gameState.scoreDiff) / 2;
        b.gameState.urgency = Math.min(100, timePressure + scorePressure);
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
    
    // ==================== 2. OYUNCU İZLEME ====================
    
    watchPlayer() {
        try {
            if (Math.random() > this.config.playerWatchRate) return;
            
            const ps = this.brain.playerState;
            if (!ps) return;
            
            const currentScore = this.game?.score || 0;
            
            // Skor değişimi
            if (currentScore !== ps.lastScore) {
                const now = Date.now();
                if (!ps.scoreHistory) ps.scoreHistory = [];
                ps.scoreHistory.push({ score: currentScore, time: now });
                
                // Son 10 kaydı tut
                if (ps.scoreHistory.length > 10) {
                    ps.scoreHistory.shift();
                }
                
                // Hız hesapla
                if (ps.scoreHistory.length >= 2) {
                    const first = ps.scoreHistory[0];
                    const last = ps.scoreHistory[ps.scoreHistory.length - 1];
                    const timeDiff = (last.time - first.time) / 1000;
                    const scoreDiff = last.score - first.score;
                    ps.speed = timeDiff > 0 ? scoreDiff / timeDiff : 0;
                }
                
                // Streak kontrolü
                const recentGain = currentScore - ps.lastScore;
                ps.isOnStreak = recentGain > 20;
                
                ps.lastScore = currentScore;
            }
            
            // Tahmini ilerleme
            const avgPointsPerCell = 5;
            const estimatedCells = currentScore / avgPointsPerCell;
            const mineCount = this.game?.mineCount || 15;
            const totalSafe = (this.gridSize * this.gridSize) - mineCount;
            ps.estimatedProgress = Math.min(100, (estimatedCells / totalSafe) * 100);
            
            // Öğrenme: Oyuncu kalıplarını kaydet
            if (ps.speed > 0 && this.learning?.patterns) {
                const pat = this.learning.patterns;
                if (typeof pat.avgPlayerSpeed === 'number') {
                    pat.avgPlayerSpeed = (pat.avgPlayerSpeed * 0.9) + (ps.speed * 0.1);
                }
            }
            
            // Rakipten öğren: Oyuncu hızlıysa daha agresif ol
            this.learnFromOpponent();
            
        } catch (error) {
            console.warn('[AI] watchPlayer error:', error);
        }
    }
    
    // Rakipten öğrenme - oyuncu stratejisini analiz et
    learnFromOpponent() {
        try {
            const ps = this.brain.playerState;
            if (!ps) return;
            
            // Oyuncu çok hızlı puan alıyorsa, nerede oynuyor izle
            if (ps.isOnStreak) {
                // Oyuncu başarılı - rakip tahtasını analiz et
                this.analyzeOpponentBoard();
            }
            
            // Oyuncu skor farkını kapatıyorsa strateji değiştir
            const scoreDiff = this.brain.gameState.scoreDiff;
            if (scoreDiff > 50 && ps.speed > 8) {
                // Oyuncu geliyor, savunmaya geç
                this.brain.mood = 'defensive';
            }
        } catch (error) {
            // Silent fail
        }
    }
    
    // Rakip tahtasını analiz et - oyuncunun açtığı güvenli bölgelerden öğren
    analyzeOpponentBoard() {
        try {
            // Oyuncu tahtası game.playerBoard'da olabilir
            const playerBoard = this.game?.board?.grid;
            if (!playerBoard) return;
            
            // Oyuncunun açtığı büyük güvenli alanları not al
            // Bu bilgiyi kendi stratejimizde kullanabiliriz
            let openCells = 0;
            for (let y = 0; y < this.gridSize; y++) {
                for (let x = 0; x < this.gridSize; x++) {
                    const cell = playerBoard[y]?.[x];
                    if (cell?.isRevealed && !cell.isMine) {
                        openCells++;
                    }
                }
            }
            
            // Oyuncu bizden çok hücre açtıysa, daha hızlı oynamalıyız
            if (openCells > this.brain.myState.progress * 0.8) {
                this.brain.mood = 'aggressive';
            }
        } catch (error) {
            // Silent fail
        }
    }
    
    // ==================== 3. TAHTA ANALİZİ ====================
    
    analyzeBoard() {
        if (!this.board?.grid) return;
        
        this.knowledge.safeCells.clear();
        this.knowledge.mineCells.clear();
        this.knowledge.probabilities.clear();
        
        // Radar mayınlarını mineCells'e ekle
        for (const key of this.knowledge.radarMines) {
            this.knowledge.mineCells.add(key);
        }
        
        // Bayraklı hücreleri güncelle
        this.knowledge.flaggedCells.clear();
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (this.board.grid[y][x].isFlagged) {
                    this.knowledge.flaggedCells.add(`${x},${y}`);
                }
            }
        }
        
        // Sayı hücrelerinden analiz
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                if (cell.isRevealed && !cell.isMine && cell.neighborCount > 0) {
                    this.analyzeNumberCell(x, y, cell.neighborCount);
                }
            }
        }
        
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
        
        if (remainingMines === unrevealed.length && remainingMines > 0) {
            unrevealed.forEach(n => this.knowledge.mineCells.add(`${n.x},${n.y}`));
        }
        
        if (remainingMines === 0) {
            unrevealed.forEach(n => this.knowledge.safeCells.add(`${n.x},${n.y}`));
        }
        
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
    
    // ==================== 4. RADAR SONUÇLARINI İŞLE ====================
    
    // Game tarafından çağrılır - radar mayınlarını al
    receiveRadarResults(mines) {
        if (!mines || mines.length === 0) return;
        
        console.log(`[AI] 📡 RADAR ${mines.length} MAYIN BULDU!`);
        
        for (const mine of mines) {
            const key = `${mine.x},${mine.y}`;
            
            // Zaten bilmiyorsak kaydet
            if (!this.knowledge.radarMines.has(key)) {
                this.knowledge.radarMines.add(key);
                this.knowledge.mineCells.add(key);
                
                // Bayraklanmamışsa listeye ekle - EN BAŞA ekle (öncelikli)
                const cell = this.board?.grid?.[mine.y]?.[mine.x];
                if (cell && !cell.isFlagged && !cell.isRevealed) {
                    // Zaten listede yoksa ekle
                    const alreadyPending = this.knowledge.pendingRadarMines.some(
                        m => m.x === mine.x && m.y === mine.y
                    );
                    if (!alreadyPending) {
                        this.knowledge.pendingRadarMines.unshift({ x: mine.x, y: mine.y });
                        console.log(`[AI] 🎯 Bayraklanacak mayın eklendi: (${mine.x},${mine.y})`);
                    }
                }
            }
        }
        
        // Öğrenme: Radar mayın bulduysa kaydet
        if (this.learning.powers.radar) {
            this.learning.powers.radar.minesFound += mines.length;
        }
        
        // HEMEN bayraklama yap - radar sonrası beklemeden
        this.flagRadarMinesImmediately();
    }
    
    // Radar mayınlarını hemen bayrakla
    flagRadarMinesImmediately() {
        console.log(`[AI] 🚩 Bekleyen radar mayınları: ${this.knowledge.pendingRadarMines.length}`);
        
        // Tüm bekleyen radar mayınlarını hemen bayrakla
        const minesToFlag = [...this.knowledge.pendingRadarMines];
        
        for (const mine of minesToFlag) {
            const cell = this.board?.grid?.[mine.y]?.[mine.x];
            if (cell && !cell.isFlagged && !cell.isRevealed) {
                console.log(`[AI] 🚩 BAYRAKLANIYOR: (${mine.x},${mine.y})`);
                this.game?.makeBotFlag?.(mine.x, mine.y);
                this.knowledge.flaggedCells.add(`${mine.x},${mine.y}`);
            }
            
            // Listeden çıkar
            this.knowledge.pendingRadarMines = this.knowledge.pendingRadarMines.filter(
                m => !(m.x === mine.x && m.y === mine.y)
            );
        }
    }
    
    processRadarResults() {
        // Board'dan highlighted mines kontrolü (yedek yöntem)
        if (this.board?.highlightedMines && this.board.highlightedMines.length > 0) {
            this.receiveRadarResults(this.board.highlightedMines);
        }
    }
    
    // ==================== 5. YANLIŞ BAYRAK TESPİTİ VE DÜZELTMESİ ====================
    
    detectWrongFlags() {
        this.knowledge.wrongFlags.clear();
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (!cell?.isFlagged) continue;
                
                const key = `${x},${y}`;
                
                // Güvenli olarak bilinen bir hücre bayraklıysa yanlış
                if (this.knowledge.safeCells.has(key)) {
                    this.knowledge.wrongFlags.add(key);
                    console.log(`[AI] Yanlış bayrak tespit: ${key} (güvenli hücre)`);
                    continue;
                }
                
                // Komşu sayılardan kontrol - daha sıkı analiz
                const neighbors = this.getNeighbors(x, y);
                let isSuspicious = false;
                
                for (const n of neighbors) {
                    const nc = this.board.grid[n.y][n.x];
                    if (!nc.isRevealed || nc.isMine || nc.neighborCount === 0) continue;
                    
                    const nNeighbors = this.getNeighbors(n.x, n.y);
                    let flagCount = 0;
                    let hiddenCount = 0;
                    
                    for (const nn of nNeighbors) {
                        const nnc = this.board.grid[nn.y][nn.x];
                        if (nnc.isFlagged) flagCount++;
                        if (!nnc.isRevealed && !nnc.isFlagged) hiddenCount++;
                    }
                    
                    // Fazla bayrak varsa yanlış
                    if (flagCount > nc.neighborCount) {
                        this.knowledge.wrongFlags.add(key);
                        console.log(`[AI] Yanlış bayrak tespit: ${key} (fazla bayrak: ${flagCount}/${nc.neighborCount})`);
                        isSuspicious = true;
                        break;
                    }
                    
                    // Eğer bu bayrak olmadan sayılar tutuyorsa, bayrak yanlış olabilir
                    if (flagCount === nc.neighborCount && hiddenCount > 0) {
                        // Bu durumda gizli hücreler güvenli olmalı
                        for (const nn of nNeighbors) {
                            const nnc = this.board.grid[nn.y][nn.x];
                            if (!nnc.isRevealed && !nnc.isFlagged) {
                                this.knowledge.safeCells.add(`${nn.x},${nn.y}`);
                            }
                        }
                    }
                }
            }
        }
        
        // Oyun ilerledikçe tahtayı yeniden analiz et
        if (this.brain.myState.movesThisGame % 10 === 0) {
            this.deepBoardAnalysis();
        }
    }
    
    // Derin tahta analizi - tüm tahtayı yeniden değerlendir
    deepBoardAnalysis() {
        // Tüm açık sayıları kontrol et
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (!cell?.isRevealed || cell.isMine || cell.neighborCount === 0) continue;
                
                const neighbors = this.getNeighbors(x, y);
                let flagCount = 0;
                let hiddenCells = [];
                
                for (const n of neighbors) {
                    const nc = this.board.grid[n.y][n.x];
                    if (nc.isFlagged) flagCount++;
                    else if (!nc.isRevealed) hiddenCells.push(n);
                }
                
                // Tüm mayınlar bulunmuşsa, kalan hücreler güvenli
                if (flagCount === cell.neighborCount && hiddenCells.length > 0) {
                    for (const h of hiddenCells) {
                        this.knowledge.safeCells.add(`${h.x},${h.y}`);
                    }
                }
                
                // Kalan gizli hücre sayısı = kalan mayın sayısına eşitse, hepsi mayın
                const remainingMines = cell.neighborCount - flagCount;
                if (remainingMines === hiddenCells.length && hiddenCells.length > 0) {
                    for (const h of hiddenCells) {
                        this.knowledge.mineCells.add(`${h.x},${h.y}`);
                    }
                }
            }
        }
    }
    
    // ==================== 6. RUH HALİ ====================
    
    updateMood() {
        const diff = this.brain.gameState.scoreDiff;
        const phase = this.brain.gameState.phase;
        const playerSpeed = this.brain.playerState.speed;
        
        // Öğrenmeden en iyi stratejiyi al
        const bestStrategy = this.getBestStrategy();
        
        // Oyuncu beklenenden hızlıysa agresif ol
        const expectedSpeed = this.learning.patterns.avgPlayerSpeed || 5;
        const playerFaster = playerSpeed > expectedSpeed * 1.2;
        
        if (diff < -60 && (phase === 'late' || phase === 'critical')) {
            this.brain.mood = 'desperate';
        } else if (diff < -30 || playerFaster) {
            this.brain.mood = 'aggressive';
        } else if (diff > 40) {
            this.brain.mood = 'defensive';
        } else {
            // Öğrenilmiş en iyi stratejiyi kullan (3+ oyundan sonra)
            if (this.learning.stats.gamesPlayed >= 3) {
                this.brain.mood = bestStrategy;
            } else {
                this.brain.mood = 'balanced';
            }
        }
    }
    
    // ==================== 7. GÜÇ STRATEJİSİ HESAPLA ====================
    
    calculatePowerStrategy() {
        const scores = this.powers.scores;
        const b = this.brain;
        const diff = b.gameState.scoreDiff;
        const phase = b.gameState.phase;
        const playerSpeed = b.playerState.speed;
        const myScore = b.myState.score;
        
        // Öğrenmeden güç etkinliklerini al
        const powerEff = this.learning.powers;
        
        // Her güç için puan hesapla (0-100)
        
        // FREEZE: Oyuncu hızlı veya önde ise yüksek
        scores.freeze = 0;
        if (playerSpeed > 5) scores.freeze += 40;
        if (diff < -20) scores.freeze += 30;
        if (b.playerState.isOnStreak) scores.freeze += 20;
        if (phase === 'critical' && diff < 0) scores.freeze += 30;
        // Öğrenmeden bonus (etkinlik 0.5'ten yüksekse)
        if (powerEff.freeze.effectiveness > 0.5) {
            scores.freeze += Math.round((powerEff.freeze.effectiveness - 0.5) * 40);
        }
        
        // RADAR: Güvenli hücre bulamadığımda yüksek
        scores.radar = 0;
        if (this.knowledge.safeCells.size === 0) scores.radar += 50;
        if (this.brain.stuckCount >= 1) scores.radar += 30;
        if (phase === 'early' || phase === 'mid') scores.radar += 20;
        // Öğrenmeden bonus
        if (powerEff.radar.effectiveness > 0.5) {
            scores.radar += Math.round((powerEff.radar.effectiveness - 0.5) * 40);
        }
        
        // SAFEBURST: Gerideyken ve hız gerektiğinde yüksek
        scores.safeburst = 0;
        if (diff < -25) scores.safeburst += 40;
        if (b.gameState.urgency > 50) scores.safeburst += 30;
        if (phase !== 'early') scores.safeburst += 20;
        // Öğrenmeden bonus
        if (powerEff.safeburst.effectiveness > 0.5) {
            scores.safeburst += Math.round((powerEff.safeburst.effectiveness - 0.5) * 40);
        }
        
        // SHIELD: Öndeyken ve late game'de yüksek
        scores.shield = 0;
        if (diff > 20) scores.shield += 40;
        if (phase === 'late' || phase === 'critical') scores.shield += 30;
        if (diff > 40) scores.shield += 20;
        // Öğrenmeden bonus
        if (powerEff.shield.effectiveness > 0.5) {
            scores.shield += Math.round((powerEff.shield.effectiveness - 0.5) * 40);
        }
        
        // Maliyet kontrolü - yeterli puan yoksa sıfırla
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        for (const power of Object.keys(scores)) {
            if (myScore < costs[power]) {
                scores[power] = 0;
            }
            // Limit kontrolü
            if (this.powers.used[power] >= this.powers.limits[power]) {
                scores[power] = 0;
            }
        }
    }
    
    // ==================== 8. KARAR VER ====================
    
    decideAction() {
        const actions = [];
        
        // Her hamlede tahtayı yeniden analiz et - hatları yakala
        this.deepBoardAnalysis();
        this.detectWrongFlags();
        
        // EN YÜKSEK ÖNCELİK: Yanlış bayrağı düzelt
        if (this.knowledge.wrongFlags.size > 0) {
            for (const key of this.knowledge.wrongFlags) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && cell.isFlagged && !cell.isRevealed) {
                    console.log(`[AI] Yanlış bayrak düzeltiliyor: ${key}`);
                    actions.push({ type: 'unflag', x, y, priority: 150, reason: 'Yanlış bayrak düzelt' });
                    // Düzeltildikten sonra listeden çıkar
                    this.knowledge.wrongFlags.delete(key);
                    break;
                }
            }
        }
        
        // Radar mayınlarını bayrakla
        while (this.knowledge.pendingRadarMines.length > 0) {
            const mine = this.knowledge.pendingRadarMines[0];
            const cell = this.board?.grid?.[mine.y]?.[mine.x];
            if (cell && !cell.isFlagged && !cell.isRevealed) {
                actions.push({ type: 'flag', x: mine.x, y: mine.y, priority: 95, reason: 'Radar mayını bayrakla' });
                break;
            } else {
                // Bu mayın zaten işlenmiş, listeden çıkar
                this.knowledge.pendingRadarMines.shift();
            }
        }
        
        // Kesin güvenli hücre - GERÇEKTEN güvenli olanı bul
        for (const key of this.knowledge.safeCells) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.board?.grid?.[y]?.[x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                actions.push({ type: 'reveal', x, y, priority: 90, reason: 'Kesin güvenli' });
                break;
            }
        }
        
        // Kesin mayını bayrakla - GERÇEKTEN bayraklanmamış olanı bul
        for (const key of this.knowledge.mineCells) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.board?.grid?.[y]?.[x];
            if (cell && !cell.isFlagged && !cell.isRevealed) {
                actions.push({ type: 'flag', x, y, priority: 85, reason: 'Kesin mayın' });
                break;
            }
        }
        
        // Güç kullan - en yüksek puanlı gücü seç
        const powerAction = this.selectBestPower();
        if (powerAction) {
            actions.push(powerAction);
        }
        
        // Düşük riskli hücre
        const lowRisk = this.findLowRiskCell();
        if (lowRisk) {
            actions.push({
                type: 'reveal',
                x: lowRisk.x,
                y: lowRisk.y,
                priority: 60 - lowRisk.prob * 50,
                reason: `Risk: %${(lowRisk.prob * 100).toFixed(0)}`
            });
        }
        
        // Rastgele hamle
        const random = this.findRandomCell();
        if (random) {
            actions.push({ type: 'reveal', x: random.x, y: random.y, priority: 20, reason: 'Rastgele' });
        }
        
        if (actions.length === 0) return null;
        
        // Sırala
        actions.sort((a, b) => b.priority - a.priority);
        
        // Zorluk seviyesine göre seç
        if (Math.random() < this.config.accuracy) {
            return actions[0];
        } else {
            const idx = Math.floor(Math.random() * Math.min(3, actions.length));
            return actions[idx];
        }
    }
    
    selectBestPower() {
        // Cooldown kontrolü
        const timeSinceLast = Date.now() - this.powers.lastUseTime;
        if (timeSinceLast < this.powers.cooldown) return null;
        
        // En yüksek puanlı gücü bul
        const scores = this.powers.scores;
        let bestPower = null;
        let bestScore = 40;  // Minimum eşik
        
        for (const [power, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore = score;
                bestPower = power;
            }
        }
        
        if (!bestPower) return null;
        
        return {
            type: 'power',
            power: bestPower,
            priority: 70 + bestScore / 5,
            reason: `${bestPower.toUpperCase()} (skor: ${bestScore})`
        };
    }
    
    findLowRiskCell() {
        const maxRisk = this.brain.mood === 'desperate' ? 0.55 : this.config.riskTolerance;
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
    
    emergencyAction() {
        const random = this.findRandomCell();
        if (random) {
            this.game?.makeBotMove?.(random.x, random.y);
            console.log('[AI] Acil hamle:', random.x, random.y);
        }
    }
    
    // ==================== 9. EYLEM UYGULA ====================
    
    executeAction(action) {
        console.log(`[AI] ${this.brain.mood.toUpperCase()} | ${action.type}: ${action.reason}`);
        
        switch (action.type) {
            case 'unflag':
                this.game?.makeBotUnflag?.(action.x, action.y);
                this.knowledge.flaggedCells.delete(`${action.x},${action.y}`);
                break;
                
            case 'flag':
                this.game?.makeBotFlag?.(action.x, action.y);
                this.knowledge.flaggedCells.add(`${action.x},${action.y}`);
                // Radar listesinden çıkar
                this.knowledge.pendingRadarMines = this.knowledge.pendingRadarMines.filter(
                    m => !(m.x === action.x && m.y === action.y)
                );
                break;
                
            case 'reveal':
                const result = this.game?.makeBotMove?.(action.x, action.y);
                this.brain.myState.movesThisGame++;
                if (result?.hitMine) {
                    this.brain.myState.minesHit++;
                }
                break;
                
            case 'power':
                this.usePower(action.power);
                break;
        }
    }
    
    usePower(power) {
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        const cost = costs[power];
        
        if (!this.game?.useBotPower) return false;
        
        const result = this.game.useBotPower(power, cost);
        
        if (result) {
            this.powers.used[power]++;
            this.powers.lastUseTime = Date.now();
            
            // Öğrenme - güç kullanımını kaydet
            const p = this.learning.powers[power];
            if (p) {
                p.used++;
            }
            
            console.log(`[AI] 💥 ${power.toUpperCase()} kullandı!`);
            
            // NOT: Radar mayınları artık game.useBotPower tarafından 
            // receiveRadarResults ile doğrudan gönderiliyor
        }
        
        return result;
    }
    
    // ==================== OYUN SONU ÖĞRENME (gameSupabase tarafından çağrılır) ====================
    
    endGameLearning(botWon, playerScore = 0, botScore = 0, isDraw = false) {
        // Yeni öğrenme sistemini kullan
        this.learnFromGame({
            won: botWon,
            draw: isDraw,
            myScore: botScore,
            playerScore: playerScore
        });
        
        const emoji = botWon ? '🏆' : (isDraw ? '🤝' : '💔');
        const result = botWon ? 'KAZANDI' : (isDraw ? 'BERABERE' : 'KAYBETTİ');
        console.log(`[AI] ${emoji} ${result} | Skor: ${botScore} vs ${playerScore} | Kazanma Oranı: %${this.getWinRate()}`);
    }
}
