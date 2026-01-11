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
 * - HATA ÖĞRENME: Mayın basma ve yanlış bayrak hatalarından öğrenir
 * - PATTERN TANIMA: Benzer durumlardan kaçınır
 * - DENEYİM KAYDI: Her oyundan detaylı veri toplar
 * - RAKİP ANALİZİ: Oyuncunun tahtasını da izler
 * 
 * v8.0 - BEBEK AI: Sıfırdan öğrenen, hızla gelişen AI
 * Build: 20260110-003
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
        
        // ==================== DENEYİM KAYIT SİSTEMİ ====================
        this.experience = {
            // Bu oyundaki tüm hamleler
            moves: [],
            
            // Bu oyundaki hatalar
            mistakes: [],
            
            // Başarılı hamleler
            successes: [],
            
            // Rakip analizi
            opponentMoves: [],
            
            // Oyun istatistikleri
            gameStats: {
                startTime: null,
                endTime: null,
                totalMoves: 0,
                safeMoves: 0,
                mineHits: 0,
                flagsPlaced: 0,
                correctFlags: 0,
                wrongFlags: 0,
                powersUsed: [],
                opponentScore: 0,
                myScore: 0
            }
        };
        
        // ==================== RAKİP İZLEME SİSTEMİ ====================
        // initOpponentAnalysis() ile doldurulacak
        this.opponentAnalysis = null;
        
        // ==================== AKILLI BEYİN ====================
        this.brain = {
            // Kendi durumum
            myState: {
                score: 0,
                progress: 0,
                minesHit: 0,
                movesThisGame: 0,
                correctFlags: 0,
                wrongFlagsPlaced: 0
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
            
            stuckCount: 0,
            
            // Hata takibi - kendi hatalarından öğrenme
            mistakes: {
                mineHits: [],       // Mayına basılan pozisyonlar ve çevre durumu
                wrongFlags: [],     // Yanlış konulan bayraklar ve nedenleri
                missedMines: [],    // Kaçırılan mayınlar (fark edilebilseydi)
                patterns: []        // Öğrenilmiş tehlikeli pattern'ler
            },
            
            // Son hamleler - pattern öğrenme
            recentMoves: []
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
            pendingRadarMines: [],
            
            // Öğrenilmiş tehlikeli bölgeler (pattern'lerden)
            dangerZones: new Map()  // key -> danger level (0-1)
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
        
        // Opponent analysis'i initialize et
        this.initOpponentAnalysis();
        
        // ==================== ÖĞRENMEDEN DAVRANIŞ AYARLA ====================
        this.adjustBehaviorFromLearning();
        
        console.log(`[AI] ${difficulty.toUpperCase()} | Win Rate: ${this.getWinRate()}% | Games: ${this.learning.stats.gamesPlayed} | GLOBAL AI v8`);
    }
    
    // Öğrenme verisinden davranışı ayarla
    adjustBehaviorFromLearning() {
        const stats = this.learning.stats;
        const winRate = stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed) : 0.5;
        
        // Kazanma oranı düşükse daha dikkatli ol
        if (winRate < 0.3 && stats.gamesPlayed >= 3) {
            // Çok kaybediyoruz - daha güvenli oyna
            this.config.riskTolerance = Math.max(0.15, this.config.riskTolerance - 0.1);
            console.log(`[AI] 📉 Düşük kazanma oranı (${(winRate*100).toFixed(0)}%) - Risk azaltıldı`);
        } else if (winRate > 0.6 && stats.gamesPlayed >= 3) {
            // Çok kazanıyoruz - biraz daha agresif olabiliriz
            this.config.riskTolerance = Math.min(0.5, this.config.riskTolerance + 0.05);
            console.log(`[AI] 📈 Yüksek kazanma oranı (${(winRate*100).toFixed(0)}%) - Daha agresif`);
        }
        
        // En etkili gücü belirle
        const powers = this.learning.powers;
        let bestPower = 'radar';
        let bestEff = 0;
        for (const [power, data] of Object.entries(powers)) {
            if (data.effectiveness > bestEff) {
                bestPower = power;
                bestEff = data.effectiveness;
            }
        }
        this.preferredPower = bestPower;
        console.log(`[AI] 🔋 Tercih edilen güç: ${bestPower} (etkinlik: ${(bestEff*100).toFixed(0)}%)`);
    }
    
    // ==================== OPPONENT ANALYSIS INIT ====================
    
    initOpponentAnalysis() {
        this.opponentAnalysis = {
            boardState: null,
            revealedCells: 0,
            flaggedCells: 0,
            scoreHistory: [],
            movePatterns: [],
            avgMoveTime: 0,
            isAggressive: false,
            preferredAreas: [],
            lastMoveTime: Date.now(),
            moveTimes: [],
            consecutiveSafes: 0,
            consecutiveMines: 0,
            cascadeCount: 0,
            cornerPreference: 0,
            edgePreference: 0,
            centerPreference: 0,
            flagAccuracy: 0,
            totalFlags: 0,
            correctFlags: 0,
            riskTolerance: 0.5,
            skillLevel: 'unknown',
            learnedPatterns: []
        };
    }
    
    // ==================== ZORLUK AYARLARI ====================
    
    getConfig(difficulty) {
        const configs = {
            easy: {
                thinkTime: { min: 1500, max: 2500 },
                accuracy: 0.70,  // Artırıldı - daha akıllı hamleler
                powerCooldown: 30000,
                powerLimits: { freeze: 0, shield: 0, radar: 1, safeburst: 0 },
                riskTolerance: 0.25,
                playerWatchRate: 0.3,
                flagChance: 0.6  // Bayrak koyma şansı
            },
            medium: {
                thinkTime: { min: 800, max: 1400 },
                accuracy: 0.85,  // Artırıldı
                powerCooldown: 18000,
                powerLimits: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
                riskTolerance: 0.30,
                playerWatchRate: 0.6,
                flagChance: 0.8
            },
            hard: {
                thinkTime: { min: 400, max: 700 },
                accuracy: 0.95,  // Artırıldı
                powerCooldown: 10000,
                powerLimits: { freeze: 1, shield: 1, radar: 2, safeburst: 1 },
                riskTolerance: 0.35,
                playerWatchRate: 1.0,
                independentPlay: true,
                flagChance: 0.95
            },
            expert: {
                thinkTime: { min: 200, max: 400 },
                accuracy: 0.99,  // Neredeyse mükemmel
                powerCooldown: 6000,
                powerLimits: { freeze: 2, shield: 2, radar: 3, safeburst: 2 },
                riskTolerance: 0.45,
                playerWatchRate: 1.0,
                independentPlay: true,
                flagChance: 1.0
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
        
        // Global veri varsa HER ZAMAN birleştir (daha agresif öğrenme)
        const globalGames = global.stats?.gamesPlayed || 0;
        const localGames = local.stats?.gamesPlayed || 0;
        
        // Ağırlıklar - global oyun sayısına göre dinamik
        // Daha fazla global veri = daha fazla güven
        let globalWeight, localWeight;
        if (globalGames >= 20) {
            globalWeight = 0.85;
            localWeight = 0.15;
        } else if (globalGames >= 10) {
            globalWeight = 0.75;
            localWeight = 0.25;
        } else if (globalGames >= 5) {
            globalWeight = 0.65;
            localWeight = 0.35;
        } else if (globalGames >= 1) {
            globalWeight = 0.55;
            localWeight = 0.45;
        } else {
            // Global veri yok, sadece yerel kullan
            return;
        }
        
        // GLOBAL STATLARİ DOĞRUDAN AKTAR
        if (globalGames > localGames) {
            local.stats.gamesPlayed = globalGames;
            local.stats.wins = global.stats?.wins || 0;
            local.stats.losses = global.stats?.losses || 0;
            local.stats.draws = global.stats?.draws || 0;
        }
        
        // Güç etkinliklerini birleştir
        for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
            if (global.powers?.[power]) {
                const globalEff = global.powers[power].effectiveness || 0.5;
                const localEff = local.powers?.[power]?.effectiveness || 0.5;
                
                local.powers[power] = local.powers[power] || { used: 0, effectiveness: 0.5 };
                local.powers[power].effectiveness = globalEff * globalWeight + localEff * localWeight;
                local.powers[power].used = Math.max(local.powers[power].used, global.powers[power].used || 0);
            }
        }
        
        // Strateji oranlarını birleştir - HER ZAMAN
        for (const strat of ['aggressive', 'defensive', 'balanced']) {
            if (global.strategies?.[strat]) {
                const globalRate = global.strategies[strat].rate || 0.33;
                const localRate = local.strategies?.[strat]?.rate || 0.33;
                const globalUsed = global.strategies[strat].used || 0;
                
                local.strategies[strat] = local.strategies[strat] || { used: 0, won: 0, rate: 0.33 };
                local.strategies[strat].rate = globalRate * globalWeight + localRate * localWeight;
                local.strategies[strat].used = Math.max(local.strategies[strat].used, globalUsed);
            }
        }
        
        // Oyuncu kalıplarını birleştir
        if (global.patterns) {
            local.patterns.avgPlayerSpeed = 
                (global.patterns.avgPlayerSpeed || 5) * globalWeight + 
                (local.patterns?.avgPlayerSpeed || 5) * localWeight;
            local.patterns.avgPlayerScore = 
                (global.patterns.avgPlayerScore || 200) * globalWeight + 
                (local.patterns?.avgPlayerScore || 200) * localWeight;
            local.patterns.avgGameDuration = 
                (global.patterns.avgGameDuration || 60000) * globalWeight + 
                (local.patterns?.avgGameDuration || 60000) * localWeight;
        }
        
        // Öğrenmeyi kaydet
        this.saveLearning();
        
        console.log(`%c[GLOBAL AI] ✅ Birleştirme tamamlandı | Global: ${globalGames} oyun | Ağırlık: ${(globalWeight * 100).toFixed(0)}%`, 'color: #00ff00; font-weight: bold;');
        console.log(`[GLOBAL AI] 📊 En iyi strateji: ${this.getBestStrategyFromGlobal(global.strategies)} | Güç önerisi: ${this.getBestPowerFromGlobal(global.powers)}`);
    }
    
    // Global veriden en iyi stratejiyi bul
    getBestStrategyFromGlobal(strategies) {
        if (!strategies) return 'balanced';
        
        let best = 'balanced';
        let bestRate = 0;
        
        for (const strat of ['aggressive', 'defensive', 'balanced']) {
            const rate = strategies[strat]?.rate || 0;
            const used = strategies[strat]?.used || 0;
            if (rate > bestRate && used >= 1) {
                best = strat;
                bestRate = rate;
            }
        }
        
        return best;
    }
    
    // Global veriden en iyi gücü bul
    getBestPowerFromGlobal(powers) {
        if (!powers) return 'radar';
        
        let best = 'radar';
        let bestEff = 0;
        
        for (const power of ['freeze', 'shield', 'radar', 'safeburst']) {
            const eff = powers[power]?.effectiveness || 0.5;
            const used = powers[power]?.used || 0;
            if (eff > bestEff && used >= 1) {
                best = power;
                bestEff = eff;
            }
        }
        
        return best;
    }
    
    /**
     * Oyun sonunda global öğrenmeyi güncelle (Supabase'e kaydet)
     */
    async syncToGlobal(gameResult) {
        try {
            // Deneyim verilerini topla
            const experienceData = this.collectExperienceData(gameResult);
            
            // Strateji mapping - desperate -> aggressive (veritabanında desperate yok)
            let strategy = this.brain?.mood || 'balanced';
            if (strategy === 'desperate') strategy = 'aggressive';
            
            console.log('%c╔══════════════════════════════════════════════════════════╗', 'color: #00ff00; font-weight: bold;');
            console.log('%c║  🤖 GLOBAL AI - DENEYIM SENKRONIZASYONU BAŞLIYOR...      ║', 'color: #00ff00; font-weight: bold;');
            console.log('%c╚══════════════════════════════════════════════════════════╝', 'color: #00ff00; font-weight: bold;');
            console.log('[GLOBAL AI] 📤 Gönderilen veri:', {
                url: this.API_URL,
                won: gameResult.won,
                strategy: strategy,
                totalMoves: experienceData.totalMoves,
                mistakes: experienceData.mistakeCount,
                successes: experienceData.successCount
            });
            
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameResult: {
                        botWon: gameResult.won,
                        draw: gameResult.draw,
                        playerScore: gameResult.playerScore || 0,
                        botScore: gameResult.myScore || 0,
                        playerSpeed: this.brain?.playerState?.speed || 5,
                        gameDuration: gameResult.duration || 60000,
                        difficulty: this.difficulty,
                        strategy: strategy,
                        powersUsed: this.powers?.used || {},
                        // YENİ: Detaylı deneyim verisi
                        experience: experienceData
                    }
                })
            });
            
            console.log('[GLOBAL AI] API Response status:', response.status);
            
            if (response.ok) {
                const result = await response.json();
                console.log('%c╔══════════════════════════════════════════════════════════╗', 'color: #00ff00; font-weight: bold;');
                console.log('%c║  ✅ DENEYIM BAŞARIYLA KAYDEDİLDİ!                        ║', 'color: #00ff00; font-weight: bold;');
                console.log(`%c║  📊 Toplam Oyun: ${String(result.totalGames).padEnd(6)} | Win Rate: ${String(result.winRate + '%').padEnd(7)}        ║`, 'color: #00ff00; font-weight: bold;');
                console.log('%c╚══════════════════════════════════════════════════════════╝', 'color: #00ff00; font-weight: bold;');
                
                // Oyuncu analiz sonuçlarını göster
                const oa = this.opponentAnalysis;
                if (oa.movePatterns.length > 0) {
                    console.log('%c╔══════════════════════════════════════════════════════════╗', 'color: #00ccff; font-weight: bold;');
                    console.log('%c║  👁️  OYUNCU ANALİZİ - BOT ÖĞRENME RAPORU                 ║', 'color: #00ccff; font-weight: bold;');
                    console.log('%c╠══════════════════════════════════════════════════════════╣', 'color: #00ccff; font-weight: bold;');
                    console.log(`%c║  🎯 Beceri Seviyesi: ${oa.skillLevel.padEnd(20)}              ║`, 'color: #00ccff; font-weight: bold;');
                    console.log(`%c║  ⚡ Ortalama Hamle Süresi: ${String(Math.round(oa.avgMoveTime)) + 'ms'.padEnd(15)}       ║`, 'color: #00ccff; font-weight: bold;');
                    console.log(`%c║  🎲 Risk Toleransı: %${(oa.riskTolerance * 100).toFixed(0).padEnd(20)}        ║`, 'color: #00ccff; font-weight: bold;');
                    console.log(`%c║  🌊 Cascade Sayısı: ${String(oa.cascadeCount).padEnd(23)}       ║`, 'color: #00ccff; font-weight: bold;');
                    console.log(`%c║  🚩 Bayrak Doğruluğu: %${(oa.flagAccuracy * 100).toFixed(0).padEnd(19)}       ║`, 'color: #00ccff; font-weight: bold;');
                    console.log(`%c║  📚 Öğrenilen Pattern: ${String(oa.learnedPatterns.length).padEnd(21)}       ║`, 'color: #00ccff; font-weight: bold;');
                    console.log(`%c║  🎮 Toplam Hamle: ${String(oa.movePatterns.length).padEnd(25)}       ║`, 'color: #00ccff; font-weight: bold;');
                    console.log('%c╚══════════════════════════════════════════════════════════╝', 'color: #00ccff; font-weight: bold;');
                }
                
                // Başarılı senkronizasyondan sonra yerel deneyimi sıfırla
                this.resetExperience();
            } else {
                const errorText = await response.text();
                console.log('%c╔══════════════════════════════════════════════════════════╗', 'color: #ff0000; font-weight: bold;');
                console.log('%c║  ❌ API HATASI - YEREL KAYIT YAPILIYOR                   ║', 'color: #ff0000; font-weight: bold;');
                console.log('%c╚══════════════════════════════════════════════════════════╝', 'color: #ff0000; font-weight: bold;');
                console.error('[GLOBAL AI] Hata:', response.status, errorText);
                
                // Hata durumunda yerel olarak sakla
                this.saveExperienceLocally(experienceData);
            }
        } catch (error) {
            console.log('%c╔══════════════════════════════════════════════════════════╗', 'color: #ff0000; font-weight: bold;');
            console.log('%c║  ❌ BAĞLANTI HATASI - YEREL KAYIT YAPILIYOR              ║', 'color: #ff0000; font-weight: bold;');
            console.log('%c╚══════════════════════════════════════════════════════════╝', 'color: #ff0000; font-weight: bold;');
            console.error('[GLOBAL AI] Senkronizasyon başarısız:', error);
            // Hata durumunda yerel olarak sakla
            this.saveExperienceLocally(this.collectExperienceData(gameResult));
        }
    }
    
    /**
     * Oyun deneyim verilerini topla
     */
    collectExperienceData(gameResult) {
        return {
            // Oyun sonucu
            won: gameResult.won,
            draw: gameResult.draw,
            myScore: gameResult.myScore || this.brain.myState.score,
            playerScore: gameResult.playerScore || 0,
            
            // Hamle istatistikleri
            totalMoves: this.experience.moves.length,
            successCount: this.experience.successes.length,
            mistakeCount: this.experience.mistakes.length,
            
            // Mayın ve bayrak istatistikleri
            minesHit: this.brain.myState.minesHit,
            correctFlags: this.brain.myState.correctFlags,
            wrongFlags: this.brain.myState.wrongFlagsPlaced,
            
            // Güç kullanımı
            powersUsed: { ...this.powers.used },
            
            // Öğrenilen pattern'ler
            learnedPatterns: this.brain.mistakes.patterns.length,
            learnedFromOpponent: this.opponentAnalysis.learnedPatterns?.length || 0,
            
            // Strateji
            strategy: this.brain.mood,
            
            // Rakip analizi (GENİŞLETİLMİŞ)
            opponentAnalysis: this.getOpponentAnalysisSummary(),
            
            // Zaman
            duration: gameResult.duration || (Date.now() - (this.experience.gameStats.startTime || Date.now()))
        };
    }
    
    /**
     * Deneyimi yerel olarak sakla (API başarısız olursa)
     */
    saveExperienceLocally(experienceData) {
        try {
            const STORAGE_KEY = 'mineduel_ai_experience_queue';
            const queue = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            queue.push({
                ...experienceData,
                timestamp: Date.now()
            });
            
            // En fazla 50 oyun sakla
            while (queue.length > 50) {
                queue.shift();
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
            console.log(`[AI] 💾 Deneyim yerel olarak kaydedildi (Kuyrukta: ${queue.length} oyun)`);
        } catch (e) {
            console.warn('[AI] Yerel kayıt başarısız:', e);
        }
    }
    
    /**
     * Deneyimi sıfırla (yeni oyun için)
     */
    resetExperience() {
        this.experience = {
            moves: [],
            mistakes: [],
            successes: [],
            opponentMoves: [],
            gameStats: {
                startTime: null,
                endTime: null,
                totalMoves: 0,
                safeMoves: 0,
                mineHits: 0,
                flagsPlaced: 0,
                correctFlags: 0,
                wrongFlags: 0,
                powersUsed: [],
                opponentScore: 0,
                myScore: 0
            }
        };
    }
    
    /**
     * Hamle kaydet (her hamleden sonra çağrılır)
     */
    recordMove(moveData) {
        const move = {
            type: moveData.type,  // 'reveal', 'flag', 'unflag', 'power'
            x: moveData.x,
            y: moveData.y,
            result: moveData.result,  // 'safe', 'mine', 'flag_correct', 'flag_wrong'
            neighborState: moveData.neighborState,
            probability: moveData.probability,
            timestamp: Date.now(),
            gamePhase: this.brain.gameState.phase,
            mood: this.brain.mood,
            scoreBefore: this.brain.myState.score
        };
        
        this.experience.moves.push(move);
        
        // Başarılı veya hatalı olarak kategorize et
        if (move.result === 'mine' || move.result === 'flag_wrong') {
            this.experience.mistakes.push(move);
        } else if (move.result === 'safe' || move.result === 'flag_correct') {
            this.experience.successes.push(move);
        }
        
        // Son 100 hamleyi tut
        if (this.experience.moves.length > 100) {
            this.experience.moves.shift();
        }
    }
    
    // ==================== OYUNCU İZLEME SİSTEMİ ====================
    
    /**
     * Oyuncunun hamlesini izle ve analiz et
     * Bu fonksiyon gameSupabase.js'den her oyuncu hamlesinde çağrılır
     */
    watchPlayerMove(moveData) {
        // Null check - opponentAnalysis yoksa oluştur
        if (!this.opponentAnalysis) {
            this.initOpponentAnalysis();
        }
        
        const now = Date.now();
        const oa = this.opponentAnalysis;
        
        // Gerekli array'ler yoksa oluştur
        if (!oa.moveTimes) oa.moveTimes = [];
        if (!oa.movePatterns) oa.movePatterns = [];
        if (!oa.scoreHistory) oa.scoreHistory = [];
        if (!oa.preferredAreas) oa.preferredAreas = [];
        if (!oa.learnedPatterns) oa.learnedPatterns = [];
        
        // Hamle süresini hesapla
        const moveTime = now - (oa.lastMoveTime || now);
        oa.lastMoveTime = now;
        oa.moveTimes.push(moveTime);
        
        // Son 20 hamlenin ortalamasını al
        if (oa.moveTimes.length > 20) oa.moveTimes.shift();
        oa.avgMoveTime = oa.moveTimes.reduce((a, b) => a + b, 0) / oa.moveTimes.length;
        
        // Hamle detaylarını kaydet
        const playerMove = {
            x: moveData.x,
            y: moveData.y,
            type: moveData.type, // 'reveal', 'flag'
            result: moveData.result, // 'safe', 'mine', 'cascade'
            cellsRevealed: moveData.cellsRevealed || 1,
            scoreChange: moveData.scoreChange || 0,
            timestamp: now,
            moveTime: moveTime
        };
        
        oa.movePatterns.push(playerMove);
        if (oa.movePatterns.length > 50) oa.movePatterns.shift();
        
        // İstatistikleri güncelle
        if (moveData.type === 'reveal') {
            oa.revealedCells += moveData.cellsRevealed || 1;
            
            if (moveData.result === 'mine') {
                oa.consecutiveMines++;
                oa.consecutiveSafes = 0;
            } else {
                oa.consecutiveSafes++;
                oa.consecutiveMines = 0;
                
                if (moveData.cellsRevealed > 3) {
                    oa.cascadeCount++;
                }
            }
            
            // Pozisyon tercihlerini analiz et
            this.analyzePositionPreference(moveData.x, moveData.y);
        }
        
        if (moveData.type === 'flag') {
            oa.flaggedCells++;
            oa.totalFlags++;
            if (moveData.isCorrect) {
                oa.correctFlags++;
            }
            oa.flagAccuracy = oa.totalFlags > 0 ? oa.correctFlags / oa.totalFlags : 0;
        }
        
        // Skor geçmişi
        if (moveData.currentScore !== undefined) {
            oa.scoreHistory.push({
                score: moveData.currentScore,
                time: now
            });
            if (oa.scoreHistory.length > 100) oa.scoreHistory.shift();
        }
        
        // Agresiflik analizi
        this.analyzePlayerAggression();
        
        // Beceri seviyesini değerlendir
        this.evaluatePlayerSkill();
        
        // Rakipten öğren
        this.learnFromOpponent(playerMove);
        
        // Debug log (sadece önemli hamleler)
        if (moveData.cellsRevealed > 5 || moveData.result === 'mine') {
            console.log(`[AI WATCH] 👁️ Oyuncu: ${moveData.type} (${moveData.x},${moveData.y}) → ${moveData.result} | Cascade: ${moveData.cellsRevealed || 1} | Skill: ${oa.skillLevel}`);
        }
    }
    
    /**
     * Oyuncunun pozisyon tercihlerini analiz et
     */
    analyzePositionPreference(x, y) {
        if (!this.opponentAnalysis) return;
        const oa = this.opponentAnalysis;
        const gridSize = this.gridSize || 10;
        
        // Array'ler yoksa oluştur
        if (!oa.preferredAreas) oa.preferredAreas = [];
        
        // Köşe kontrolü
        if ((x === 0 || x === gridSize - 1) && (y === 0 || y === gridSize - 1)) {
            oa.cornerPreference = (oa.cornerPreference || 0) + 1;
        }
        // Kenar kontrolü
        else if (x === 0 || x === gridSize - 1 || y === 0 || y === gridSize - 1) {
            oa.edgePreference = (oa.edgePreference || 0) + 1;
        }
        // Merkez kontrolü
        else if (x > 2 && x < gridSize - 3 && y > 2 && y < gridSize - 3) {
            oa.centerPreference = (oa.centerPreference || 0) + 1;
        }
        
        // Tercih edilen alanları güncelle
        const areaKey = `${Math.floor(x / 3)},${Math.floor(y / 3)}`;
        if (!oa.preferredAreas.includes(areaKey)) {
            oa.preferredAreas.push(areaKey);
            if (oa.preferredAreas.length > 10) oa.preferredAreas.shift();
        }
    }
    
    /**
     * Oyuncunun agresifliğini analiz et
     */
    analyzePlayerAggression() {
        if (!this.opponentAnalysis) return;
        const oa = this.opponentAnalysis;
        
        // Hızlı oyuncu = agresif
        const isQuick = (oa.avgMoveTime || 2000) < 1500;
        
        // Çok cascade yapan = iyi
        const hasCascades = (oa.cascadeCount || 0) > 3;
        
        // Risk alan (mayına çok basan) = agresif
        const takesRisks = (oa.consecutiveMines || 0) > 0;
        
        oa.isAggressive = isQuick || takesRisks;
        
        // Risk toleransını hesapla
        const totalMoves = (oa.movePatterns || []).length;
        if (totalMoves > 5) {
            const mineMoves = oa.movePatterns.filter(m => m.result === 'mine').length;
            oa.riskTolerance = mineMoves / totalMoves;
        }
    }
    
    /**
     * Oyuncunun beceri seviyesini değerlendir
     */
    evaluatePlayerSkill() {
        if (!this.opponentAnalysis) return;
        const oa = this.opponentAnalysis;
        const movePatterns = oa.movePatterns || [];
        const totalMoves = movePatterns.length;
        
        if (totalMoves < 5) {
            oa.skillLevel = 'unknown';
            return;
        }
        
        // Puanlama sistemi
        let skillScore = 50;
        
        // Hız (hızlı = iyi)
        const avgMoveTime = oa.avgMoveTime || 2000;
        if (avgMoveTime < 1000) skillScore += 15;
        else if (avgMoveTime < 2000) skillScore += 10;
        else if (avgMoveTime > 4000) skillScore -= 10;
        
        // Cascade oranı (yüksek = iyi)
        const cascadeRate = (oa.cascadeCount || 0) / Math.max(1, totalMoves);
        if (cascadeRate > 0.3) skillScore += 15;
        else if (cascadeRate > 0.15) skillScore += 10;
        
        // Mayın oranı (düşük = iyi)
        const mineRate = movePatterns.filter(m => m.result === 'mine').length / totalMoves;
        if (mineRate < 0.1) skillScore += 15;
        else if (mineRate < 0.2) skillScore += 5;
        else if (mineRate > 0.3) skillScore -= 15;
        
        // Bayrak doğruluğu
        const flagAccuracy = oa.flagAccuracy || 0;
        if (flagAccuracy > 0.8) skillScore += 10;
        else if (flagAccuracy < 0.3 && (oa.totalFlags || 0) > 3) skillScore -= 10;
        
        // Skor artış hızı
        const scoreHistory = oa.scoreHistory || [];
        if (scoreHistory.length > 5) {
            const recentScores = scoreHistory.slice(-5);
            if (recentScores[4] && recentScores[0]) {
                const scoreGrowth = (recentScores[4].score - recentScores[0].score) / 5;
                if (scoreGrowth > 30) skillScore += 10;
                else if (scoreGrowth > 15) skillScore += 5;
            }
        }
        
        // Seviye belirleme
        if (skillScore >= 80) oa.skillLevel = 'expert';
        else if (skillScore >= 65) oa.skillLevel = 'advanced';
        else if (skillScore >= 45) oa.skillLevel = 'intermediate';
        else oa.skillLevel = 'beginner';
    }
    
    /**
     * Rakipten öğren - oyuncunun başarılı hamlelerini taklit et
     */
    learnFromOpponent(playerMove) {
        if (!this.opponentAnalysis) this.initOpponentAnalysis();
        const oa = this.opponentAnalysis;
        if (!oa.learnedPatterns) oa.learnedPatterns = [];
        
        // Cascade yapan hamleleri öğren
        if (playerMove && playerMove.result === 'safe' && playerMove.cellsRevealed > 5) {
            const pattern = {
                type: 'cascade_position',
                x: playerMove.x,
                y: playerMove.y,
                area: `${Math.floor(playerMove.x / 3)},${Math.floor(playerMove.y / 3)}`,
                cellsRevealed: playerMove.cellsRevealed,
                learned: Date.now()
            };
            
            oa.learnedPatterns.push(pattern);
            if (oa.learnedPatterns.length > 20) oa.learnedPatterns.shift();
            
            // Bu bilgiyi kendi stratejimde kullan
            this.applyLearnedPattern(pattern);
        }
        
        // Hızlı skor artışı yapan bölgeleri öğren
        if (playerMove && playerMove.scoreChange > 30) {
            const pattern = {
                type: 'high_score_area',
                x: playerMove.x,
                y: playerMove.y,
                area: `${Math.floor(playerMove.x / 3)},${Math.floor(playerMove.y / 3)}`,
                scoreChange: playerMove.scoreChange,
                learned: Date.now()
            };
            
            oa.learnedPatterns.push(pattern);
        }
    }
    
    /**
     * Öğrenilen pattern'i uygula
     */
    applyLearnedPattern(pattern) {
        // Benzer bölgelere öncelik ver
        if (pattern.type === 'cascade_position') {
            const areaX = Math.floor(pattern.x / 3);
            const areaY = Math.floor(pattern.y / 3);
            
            // Bu bölgedeki hücrelere düşük tehlike puanı ver
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = `area_${areaX + dx}_${areaY + dy}`;
                    const current = this.knowledge.dangerZones.get(key) || 0.5;
                    this.knowledge.dangerZones.set(key, Math.max(0.1, current - 0.1));
                }
            }
        }
    }
    
    /**
     * Oyuncu skorunu güncelle (game.js'den çağrılır)
     */
    updatePlayerScore(score) {
        const now = Date.now();
        const ps = this.brain.playerState;
        
        ps.lastScore = ps.score;
        ps.score = score;
        
        // Skor geçmişini tut
        ps.scoreHistory.push({ score, time: now });
        if (ps.scoreHistory.length > 50) ps.scoreHistory.shift();
        
        // Hız hesapla (puan/saniye)
        if (ps.scoreHistory.length > 1) {
            const first = ps.scoreHistory[0];
            const last = ps.scoreHistory[ps.scoreHistory.length - 1];
            const timeDiff = (last.time - first.time) / 1000;
            if (timeDiff > 0) {
                ps.speed = last.score / timeDiff;
            }
        }
        
        // Streak kontrolü
        ps.isOnStreak = score > ps.lastScore + 20;
        
        // Skor farkını güncelle
        this.brain.gameState.scoreDiff = this.brain.myState.score - score;
    }
    
    /**
     * Deneyim verisine rakip analizini ekle
     */
    getOpponentAnalysisSummary() {
        const oa = this.opponentAnalysis || {};
        return {
            skillLevel: oa.skillLevel || 'unknown',
            avgMoveTime: Math.round(oa.avgMoveTime || 0),
            isAggressive: oa.isAggressive || false,
            riskTolerance: (oa.riskTolerance || 0).toFixed(2),
            cascadeCount: oa.cascadeCount || 0,
            flagAccuracy: ((oa.flagAccuracy || 0) * 100).toFixed(0) + '%',
            preferredAreas: (oa.preferredAreas || []).slice(0, 5),
            learnedPatterns: (oa.learnedPatterns || []).length,
            totalMoves: (oa.movePatterns || []).length
        };
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
        const playerSpeed = this.brain?.playerState?.speed || 5;
        
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
    
    // En iyi stratejiyi öğrenmeden al
    getBestStrategy() {
        const strats = this.learning.strategies;
        let best = 'balanced';
        let bestRate = strats.balanced?.rate || 0.33;
        
        // Global veri varsa HEMEN strateji değiştir (1+ oyun yeterli)
        const minGames = this.globalLearningLoaded ? 1 : 2;
        
        if ((strats.aggressive?.rate || 0) > bestRate && (strats.aggressive?.used || 0) >= minGames) {
            best = 'aggressive';
            bestRate = strats.aggressive.rate;
        }
        if ((strats.defensive?.rate || 0) > bestRate && (strats.defensive?.used || 0) >= minGames) {
            best = 'defensive';
            bestRate = strats.defensive.rate;
        }
        
        return best;
    }
    
    // Güç önerisi al (öğrenmeye göre)
    getPowerRecommendation() {
        const powers = this.learning.powers;
        let best = 'radar';  // Varsayılan radar
        let bestEff = 0;
        
        // Global veri varsa daha az oyundan öğren
        const minGames = this.globalLearningLoaded ? 1 : 2;
        
        for (const [power, data] of Object.entries(powers)) {
            if ((data.effectiveness || 0.5) > bestEff && (data.used || 0) >= minGames) {
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
        
        // ⭐ DENEYİM KAYDINI BAŞLAT
        this.resetExperience();
        this.experience.gameStats.startTime = Date.now();
        
        // İlk hamle için tahtayı hemen analiz et
        this.initialBoardScan();
        
        const winRate = this.getWinRate();
        const bestStrat = this.getBestStrategy();
        console.log(`[AI] 🚀 BEBEK AI v8 Başladı | Zorluk: ${this.difficulty} | Oyunlar: ${this.learning.stats.gamesPlayed} | Kazanma: %${winRate} | En iyi strateji: ${bestStrat}`);
        
        // Hemen düşünmeye başla - gecikmesiz
        this.scheduleThink();
        
        // Global learning'i arka planda yükle (ilk hamleyi geciktirmez)
        if (!this.globalLearningLoaded) {
            this.loadGlobalLearning();
        }
        
        // API durumunu kontrol et (arka planda)
        this.testAPIConnection();
    }
    
    // API bağlantısını test et
    async testAPIConnection() {
        try {
            const response = await fetch(`${this.API_URL}?test=true`);
            if (response.ok) {
                const result = await response.json();
                console.log(`[AI] ✅ API Bağlantısı OK | Supabase: ${result.supabaseConfigured ? 'Aktif' : 'Pasif'}`);
            } else {
                console.warn(`[AI] ⚠️ API Hatası: ${response.status}`);
            }
        } catch (error) {
            console.error('[AI] ❌ API bağlantısı başarısız:', error.message);
        }
    }
    
    // Oyun başında tahtayı tara ve güvenli başlangıç noktaları bul
    initialBoardScan() {
        if (!this.board?.grid) return;
        
        // Köşeler ve kenarlar genellikle güvenlidir - başlangıç stratejisi
        const corners = [
            { x: 0, y: 0 },
            { x: this.gridSize - 1, y: 0 },
            { x: 0, y: this.gridSize - 1 },
            { x: this.gridSize - 1, y: this.gridSize - 1 }
        ];
        
        // Merkeze yakın noktalar (büyük alan açma potansiyeli)
        const center = Math.floor(this.gridSize / 2);
        const centerPoints = [
            { x: center, y: center },
            { x: center - 1, y: center },
            { x: center + 1, y: center },
            { x: center, y: center - 1 },
            { x: center, y: center + 1 }
        ];
        
        // Başlangıç stratejisi: Köşelerden veya merkezden başla
        const startPoints = Math.random() > 0.5 ? corners : centerPoints;
        
        for (const point of startPoints) {
            const cell = this.board.grid[point.y]?.[point.x];
            if (cell && !cell.isRevealed && !cell.isFlagged && !cell.isMine) {
                // İlk hamle için güvenli hücre olarak işaretle
                this.knowledge.safeCells.add(`${point.x},${point.y}`);
                break;
            }
        }
        
        console.log(`[AI] İlk tarama tamamlandı - ${this.knowledge.safeCells.size} güvenli hücre bulundu`);
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
        this.knowledge.dangerZones = new Map();  // ⭐ Tehlikeli bölgeler
        
        this.powers.used = { freeze: 0, shield: 0, radar: 0, safeburst: 0 };
        this.powers.lastUseTime = 0;
        this.powers.scores = { freeze: 0, shield: 0, radar: 0, safeburst: 0 };
        
        this.brain.stuckCount = 0;
        this.brain.mood = 'balanced';
        this.brain.myState = { 
            score: 0, 
            progress: 0, 
            minesHit: 0, 
            movesThisGame: 0,
            correctFlags: 0,
            wrongFlagsPlaced: 0
        };
        this.brain.playerState = { 
            score: 0, 
            lastScore: 0, 
            scoreHistory: [], 
            speed: 0, 
            isOnStreak: false, 
            estimatedProgress: 0 
        };
        
        // Rakip analizi sıfırla
        this.opponentAnalysis = {
            boardState: null,
            revealedCells: 0,
            flaggedCells: 0,
            scoreHistory: [],
            movePatterns: [],
            avgMoveTime: 0,
            isAggressive: false,
            preferredAreas: []
        };
        
        // Hatalar - oyunlar arası öğrenme için KORU (patterns'ı koru)
        if (!this.brain.mistakes) {
            this.brain.mistakes = { mineHits: [], wrongFlags: [], missedMines: [], patterns: [] };
        } else {
            // Sadece anlık hataları sıfırla, patterns'ı koru
            this.brain.mistakes.mineHits = [];
            this.brain.mistakes.wrongFlags = [];
            this.brain.mistakes.missedMines = [];
            // patterns korunuyor - öğrenme devam ediyor!
        }
        
        // recentMoves'u sıfırla - yeni oyun
        this.brain.recentMoves = [];
        
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
                this.brain.myState.movesThisGame++;
            } else {
                this.brain.stuckCount++;
                console.log(`[AI] Takıldı (${this.brain.stuckCount}/2) - acil eylem aranıyor`);
                
                // 2 kere takılırsa acil eylem yap
                if (this.brain.stuckCount >= 2) {
                    this.emergencyAction();
                    this.brain.stuckCount = 0;
                }
            }
            
        } catch (error) {
            console.error('[AI] Error:', error);
            // Hata durumunda bile acil eylem yap
            this.emergencyAction();
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
                this.opponentAnalysis.isAggressive = true;
            } else {
                this.opponentAnalysis.isAggressive = false;
            }
            
            // Oyuncu skor farkını kapatıyorsa strateji değiştir
            const scoreDiff = this.brain.gameState.scoreDiff;
            if (scoreDiff > 50 && ps.speed > 8) {
                // Oyuncu geliyor, savunmaya geç
                this.brain.mood = 'defensive';
            }
            
            // Oyuncu davranışlarını kaydet
            this.recordOpponentBehavior();
        } catch (error) {
            // Silent fail
        }
    }
    
    // Rakip davranışlarını kaydet
    recordOpponentBehavior() {
        const ps = this.brain.playerState;
        if (!ps) return;
        
        // Skor geçmişini kaydet
        this.opponentAnalysis.scoreHistory.push({
            score: ps.score,
            speed: ps.speed,
            timestamp: Date.now()
        });
        
        // Son 20 kaydı tut
        if (this.opponentAnalysis.scoreHistory.length > 20) {
            this.opponentAnalysis.scoreHistory.shift();
        }
        
        // Ortalama hız hesapla
        if (this.opponentAnalysis.scoreHistory.length > 1) {
            const speeds = this.opponentAnalysis.scoreHistory.map(s => s.speed);
            this.opponentAnalysis.avgMoveTime = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        }
    }
    
    // Rakip tahtasını analiz et - oyuncunun açtığı güvenli bölgelerden öğren
    analyzeOpponentBoard() {
        try {
            // Oyuncu tahtası game.board'da (oyuncunun tahtası)
            const playerBoard = this.game?.board?.grid;
            if (!playerBoard) return;
            
            let openCells = 0;
            let flaggedCells = 0;
            const openAreas = [];
            
            // Oyuncunun açtığı alanları analiz et
            for (let y = 0; y < this.gridSize; y++) {
                for (let x = 0; x < this.gridSize; x++) {
                    const cell = playerBoard[y]?.[x];
                    if (!cell) continue;
                    
                    if (cell.isRevealed && !cell.isMine) {
                        openCells++;
                        // Açık alanların merkezlerini bul
                        if (cell.neighborCount === 0) {
                            openAreas.push({ x, y });
                        }
                    }
                    if (cell.isFlagged) {
                        flaggedCells++;
                    }
                }
            }
            
            // Rakip analizi güncelle
            this.opponentAnalysis.revealedCells = openCells;
            this.opponentAnalysis.flaggedCells = flaggedCells;
            
            // Oyuncu hangi bölgelere odaklanıyor?
            if (openAreas.length > 0) {
                // En yoğun bölgeyi bul
                const centerX = openAreas.reduce((sum, p) => sum + p.x, 0) / openAreas.length;
                const centerY = openAreas.reduce((sum, p) => sum + p.y, 0) / openAreas.length;
                
                this.opponentAnalysis.preferredAreas.push({
                    centerX: Math.round(centerX),
                    centerY: Math.round(centerY),
                    cellCount: openCells,
                    timestamp: Date.now()
                });
                
                // Son 5 kaydı tut
                if (this.opponentAnalysis.preferredAreas.length > 5) {
                    this.opponentAnalysis.preferredAreas.shift();
                }
            }
            
            // Oyuncu bizden çok hücre açtıysa, daha hızlı oynamalıyız
            const myProgress = this.calculateMyProgress();
            const opponentProgress = (openCells / ((this.gridSize * this.gridSize) - (this.game?.mineCount || 15))) * 100;
            
            if (opponentProgress > myProgress * 1.2) {
                // Oyuncu %20 daha ileri, agresif ol
                this.brain.mood = 'aggressive';
                console.log(`[AI] ⚡ Rakip önde! (${opponentProgress.toFixed(0)}% vs ${myProgress.toFixed(0)}%) - Agresif moda geçiliyor`);
            }
            
            // Deneyim olarak kaydet
            this.experience.opponentMoves.push({
                openCells,
                flaggedCells,
                progress: opponentProgress,
                timestamp: Date.now()
            });
            
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
        
        // KESİN MAYIN: Kalan mayın sayısı = kalan gizli hücre sayısı
        if (remainingMines === unrevealed.length && remainingMines > 0) {
            // TÜM gizli hücreler kesin mayın!
            unrevealed.forEach(n => {
                const key = `${n.x},${n.y}`;
                this.knowledge.mineCells.add(key);
                // Yüksek olasılık da ver
                this.knowledge.probabilities.set(key, 1.0);
                console.log(`[AI] 🎯 Kesin mayın tespit: (${n.x},${n.y}) - Sayı ${number}'den`);
            });
        }
        
        // KESİN GÜVENLİ: Hiç mayın kalmadı
        if (remainingMines === 0) {
            unrevealed.forEach(n => this.knowledge.safeCells.add(`${n.x},${n.y}`));
        }
        
        // YÜKSEK OLASILIK: Mayın olma ihtimali yüksek
        if (remainingMines > 0 && remainingMines < unrevealed.length) {
            const prob = remainingMines / unrevealed.length;
            unrevealed.forEach(n => {
                const key = `${n.x},${n.y}`;
                const current = this.knowledge.probabilities.get(key) || 0;
                this.knowledge.probabilities.set(key, Math.max(current, prob));
                
                // %80+ olasılıklı hücreleri potansiyel mayın olarak işaretle
                if (prob >= 0.8) {
                    this.knowledge.mineCells.add(key);
                }
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
        const previousWrongFlags = new Set(this.knowledge.wrongFlags);
        this.knowledge.wrongFlags.clear();
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (!cell?.isFlagged) continue;
                
                const key = `${x},${y}`;
                
                // Güvenli olarak bilinen bir hücre bayraklıysa yanlış
                if (this.knowledge.safeCells.has(key)) {
                    this.knowledge.wrongFlags.add(key);
                    // YENİ: Yanlış bayraktan öğren
                    if (!previousWrongFlags.has(key)) {
                        this.learnFromWrongFlag(x, y);
                    }
                    console.log(`[AI] 🚩❌ Yanlış bayrak tespit: ${key} (güvenli hücre)`);
                    continue;
                }
                
                // RADAR KONTROLÜ: Radar mayınlarını yanlış olarak işaretleme
                if (this.knowledge.radarMines.has(key)) {
                    // Radar mayını, kesin mayın - yanlış değil
                    continue;
                }
                
                // Komşu sayılardan kontrol - daha sıkı analiz
                const neighbors = this.getNeighbors(x, y);
                
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
                    
                    // Fazla bayrak varsa yanlış - KESİN TESPİT
                    if (flagCount > nc.neighborCount) {
                        this.knowledge.wrongFlags.add(key);
                        // YENİ: Yanlış bayraktan öğren
                        if (!previousWrongFlags.has(key)) {
                            this.learnFromWrongFlag(x, y);
                        }
                        console.log(`[AI] 🚩❌ Yanlış bayrak tespit: ${key} (fazla bayrak: ${flagCount}/${nc.neighborCount})`);
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
        // İlk geçiş: Temel analiz - HER SAYIYI KONTROL ET
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
                
                const remainingMines = cell.neighborCount - flagCount;
                
                // Tüm mayınlar bulunmuşsa, kalan hücreler güvenli
                if (flagCount === cell.neighborCount && hiddenCells.length > 0) {
                    for (const h of hiddenCells) {
                        this.knowledge.safeCells.add(`${h.x},${h.y}`);
                    }
                }
                
                // KESİN MAYIN: Kalan mayın sayısı = kalan gizli hücre sayısı
                if (remainingMines > 0 && remainingMines === hiddenCells.length) {
                    for (const h of hiddenCells) {
                        const key = `${h.x},${h.y}`;
                        this.knowledge.mineCells.add(key);
                        this.knowledge.probabilities.set(key, 1.0);
                        console.log(`[AI] 🎯 Kesin mayın (deep): ${key} - Sayı ${cell.neighborCount}, ${hiddenCells.length} gizli`);
                    }
                }
                // Olasılık hesapla
                else if (remainingMines > 0 && hiddenCells.length > remainingMines) {
                    const probability = remainingMines / hiddenCells.length;
                    for (const h of hiddenCells) {
                        const key = `${h.x},${h.y}`;
                        const currentProb = this.knowledge.probabilities.get(key) || 0;
                        this.knowledge.probabilities.set(key, Math.max(currentProb, probability));
                    }
                }
            }
        }
        
        // İkinci geçiş: Çapraz analiz (intersection pattern)
        this.crossReferenceAnalysis();
        
        // Üçüncü geçiş: Olasılık güncelleme
        this.updateProbabilitiesFromAnalysis();
    }
    
    // Çapraz referans analizi - iki sayının kesişimindeki hücreleri analiz et
    crossReferenceAnalysis() {
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell1 = this.board?.grid?.[y]?.[x];
                if (!cell1?.isRevealed || cell1.isMine || cell1.neighborCount === 0) continue;
                
                // Bu sayının komşularını al
                const neighbors1 = this.getNeighbors(x, y);
                const hidden1 = neighbors1.filter(n => {
                    const c = this.board.grid[n.y][n.x];
                    return !c.isRevealed && !c.isFlagged;
                });
                const flagged1 = neighbors1.filter(n => this.board.grid[n.y][n.x].isFlagged).length;
                const remaining1 = cell1.neighborCount - flagged1;
                
                // Komşu sayıları kontrol et
                for (const n of neighbors1) {
                    const cell2 = this.board.grid[n.y][n.x];
                    if (!cell2.isRevealed || cell2.neighborCount === 0) continue;
                    
                    const neighbors2 = this.getNeighbors(n.x, n.y);
                    const hidden2 = neighbors2.filter(n2 => {
                        const c = this.board.grid[n2.y][n2.x];
                        return !c.isRevealed && !c.isFlagged;
                    });
                    const flagged2 = neighbors2.filter(n2 => this.board.grid[n2.y][n2.x].isFlagged).length;
                    const remaining2 = cell2.neighborCount - flagged2;
                    
                    // Kesişen hücreler
                    const intersection = hidden1.filter(h1 => 
                        hidden2.some(h2 => h1.x === h2.x && h1.y === h2.y)
                    );
                    
                    // Sadece birincide olanlar
                    const only1 = hidden1.filter(h1 => 
                        !hidden2.some(h2 => h1.x === h2.x && h1.y === h2.y)
                    );
                    
                    // Analiz: Eğer birinci sayının tüm mayınları kesişimde ise
                    // sadece birincide olanlar güvenli
                    if (remaining1 <= intersection.length && only1.length > 0 && remaining1 > 0) {
                        for (const safe of only1) {
                            this.knowledge.safeCells.add(`${safe.x},${safe.y}`);
                        }
                    }
                    
                    // Analiz: Eğer only1 hücre sayısı = remaining1 - (kesişimdeki max mayın)
                    // ve bu sayı pozitifse, only1'dekiler mayın
                    const maxIntersectionMines = Math.min(remaining1, intersection.length);
                    if (remaining1 - maxIntersectionMines === only1.length && only1.length > 0) {
                        for (const mine of only1) {
                            this.knowledge.mineCells.add(`${mine.x},${mine.y}`);
                        }
                    }
                }
            }
        }
    }
    
    // Analizden olasılıkları güncelle
    updateProbabilitiesFromAnalysis() {
        for (const key of this.knowledge.safeCells) {
            this.knowledge.probabilities.set(key, 0);
            this.knowledge.dangerZones.delete(key);
        }
        
        for (const key of this.knowledge.mineCells) {
            this.knowledge.probabilities.set(key, 1);
            this.knowledge.dangerZones.set(key, 1);
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
            // Global veriden öğrenilmiş stratejiyi HEMEN kullan (1+ oyundan sonra)
            if (this.learning.stats.gamesPlayed >= 1 && this.globalLearningLoaded) {
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
    
    // Mayın hücresini doğrula - gerçekten kesin mi?
    verifyMineCell(x, y) {
        // Bu hücrenin gerçekten mayın olduğunu doğrula
        // Birden fazla komşu sayısı ile çapraz kontrol yap
        
        const neighbors = this.getNeighbors(x, y);
        let confirmationCount = 0;
        
        for (const n of neighbors) {
            const nc = this.board?.grid?.[n.y]?.[n.x];
            if (!nc?.isRevealed || nc.neighborCount === 0) continue;
            
            // Bu komşunun etrafındaki durumu kontrol et
            const nNeighbors = this.getNeighbors(n.x, n.y);
            let flagCount = 0;
            let hiddenCount = 0;
            let targetIsHidden = false;
            
            for (const nn of nNeighbors) {
                const nnc = this.board.grid[nn.y][nn.x];
                if (nnc.isFlagged) flagCount++;
                else if (!nnc.isRevealed) {
                    hiddenCount++;
                    if (nn.x === x && nn.y === y) targetIsHidden = true;
                }
            }
            
            // Eğer hedef hücre gizli ve kalan mayın sayısı = kalan gizli hücre sayısı ise
            if (targetIsHidden) {
                const remainingMines = nc.neighborCount - flagCount;
                if (remainingMines === hiddenCount && hiddenCount === 1) {
                    confirmationCount++;
                }
            }
        }
        
        // En az 1 komşu tarafından onaylanmış olmalı
        return confirmationCount >= 1;
    }
    
    // ==================== 8. KARAR VER ====================
    
    decideAction() {
        const actions = [];
        
        // Her hamlede tahtayı yeniden analiz et - hatları yakala
        this.deepBoardAnalysis();
        this.detectWrongFlags();
        this.applyLearnedPatterns();  // YENİ: Öğrenilmiş pattern'leri uygula
        
        // EN YÜKSEK ÖNCELİK: Yanlış bayrağı düzelt
        if (this.knowledge.wrongFlags.size > 0) {
            for (const key of this.knowledge.wrongFlags) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && cell.isFlagged && !cell.isRevealed) {
                    console.log(`[AI] 🚩➡️ Yanlış bayrak düzeltiliyor: ${key}`);
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
        
        // Kesin mayını bayrakla - analyzeBoard'dan gelen tüm kesin mayınlar
        for (const key of this.knowledge.mineCells) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.board?.grid?.[y]?.[x];
            if (cell && !cell.isFlagged && !cell.isRevealed) {
                // Bayrakla - hem radar hem analiz sonuçları
                const isRadarConfirmed = this.knowledge.radarMines.has(key);
                const priority = isRadarConfirmed ? 95 : 88;
                const reason = isRadarConfirmed ? 'Radar kesin mayın' : 'Analiz kesin mayın';
                
                this.brain.myState.correctFlags++;
                actions.push({ type: 'flag', x, y, priority, reason });
                console.log(`[AI] 🚩 Bayrak planlandı: (${x},${y}) - ${reason}`);
                break; // Bir seferde bir bayrak
            }
        }
        
        // Kesin güvenli hücre - GERÇEKTEN güvenli olanı bul (tehlikeli pattern'leri kontrol et)
        for (const key of this.knowledge.safeCells) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.board?.grid?.[y]?.[x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                // YENİ: Tehlikeli pattern kontrolü - güvenli bile olsa dikkatli ol
                const isDangerous = this.isDangerousPattern(x, y);
                const priority = isDangerous ? 75 : 90;  // Tehlikeliyse önceliği düşür
                actions.push({ type: 'reveal', x, y, priority, reason: isDangerous ? 'Güvenli (dikkat)' : 'Kesin güvenli' });
                break;
            }
        }
        
        // YÜKSEK OLASILIKLI MAYINLARI DA BAYRAKLA (%70+)
        for (const [key, prob] of this.knowledge.probabilities) {
            if (prob >= 0.7) {
                const [x, y] = key.split(',').map(Number);
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isFlagged && !cell.isRevealed && !this.knowledge.safeCells.has(key)) {
                    // Yüksek olasılık var, bayrak koy
                    actions.push({ type: 'flag', x, y, priority: 70, reason: `Yüksek risk: %${(prob * 100).toFixed(0)}` });
                }
            }
        }
        
        // Güç kullan - en yüksek puanlı gücü seç
        const powerAction = this.selectBestPower();
        if (powerAction) {
            actions.push(powerAction);
        }
        
        // Düşük riskli hücre - hatalardan öğrenilmiş riskleri de kontrol et
        const lowRisk = this.findLowRiskCell();
        if (lowRisk) {
            // Öğrenilmiş hatalardan bu hücrenin riski artmış mı kontrol et
            const learnedRisk = this.knowledge.probabilities.get(`${lowRisk.x},${lowRisk.y}`) || 0;
            const dangerZoneRisk = this.knowledge.dangerZones.get(`${lowRisk.x},${lowRisk.y}`) || 0;
            const patternRisk = this.isDangerousPattern(lowRisk.x, lowRisk.y) ? 0.3 : 0;
            
            // Tüm risklerin maksimumunu al
            const adjustedRisk = Math.max(lowRisk.prob, learnedRisk, dangerZoneRisk, patternRisk);
            
            // Çok riskli değilse ekle
            if (adjustedRisk < 0.7) {
                actions.push({
                    type: 'reveal',
                    x: lowRisk.x,
                    y: lowRisk.y,
                    priority: 60 - adjustedRisk * 50,
                    reason: `Risk: %${(adjustedRisk * 100).toFixed(0)}`
                });
            }
        }
        
        // Rastgele hamle - ama öğrenilmiş riskli bölgeleri önle
        const random = this.findSafeRandomCell();
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
    
    // YENİ: Öğrenilmiş pattern'leri mevcut tahtaya uygula
    applyLearnedPatterns() {
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (!cell || cell.isRevealed || cell.isFlagged) continue;
                
                const key = `${x},${y}`;
                
                // Tehlikeli pattern kontrolü
                if (this.isDangerousPattern(x, y)) {
                    const currentRisk = this.knowledge.probabilities.get(key) || 0.5;
                    this.knowledge.probabilities.set(key, Math.max(currentRisk, 0.7));
                    this.knowledge.dangerZones.set(key, 0.7);
                }
            }
        }
    }
    
    // Güvenli rastgele hücre bul - öğrenilmiş riskli bölgeleri önle
    findSafeRandomCell() {
        const candidates = [];
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (!cell || cell.isRevealed || cell.isFlagged) continue;
                
                const key = `${x},${y}`;
                const learnedRisk = this.knowledge.probabilities.get(key) || 0;
                const dangerZoneRisk = this.knowledge.dangerZones.get(key) || 0;
                const totalRisk = Math.max(learnedRisk, dangerZoneRisk);
                
                // Tehlikeli pattern kontrolü
                const hasPatternRisk = this.isDangerousPattern(x, y);
                
                // Öğrenilmiş riskli hücrelerden ve tehlikeli pattern'lerden kaçın
                if (totalRisk < 0.5 && !hasPatternRisk && !this.knowledge.mineCells.has(key)) {
                    candidates.push({ x, y, risk: totalRisk });
                }
            }
        }
        
        if (candidates.length === 0) {
            // Hiç güvenli hücre yoksa, en az riskli olanı bul
            return this.findLowestRiskCell();
        }
        
        // En düşük riskli olanı seç
        candidates.sort((a, b) => a.risk - b.risk);
        return candidates[0];
    }
    
    // En düşük riskli hücreyi bul (fallback)
    findLowestRiskCell() {
        let lowestRisk = 1.0;
        let bestCell = null;
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (!cell || cell.isRevealed || cell.isFlagged) continue;
                
                const key = `${x},${y}`;
                if (this.knowledge.mineCells.has(key)) continue;
                
                const risk = this.knowledge.probabilities.get(key) || 0.5;
                const dangerRisk = this.knowledge.dangerZones.get(key) || 0;
                const totalRisk = Math.max(risk, dangerRisk);
                
                if (totalRisk < lowestRisk) {
                    lowestRisk = totalRisk;
                    bestCell = { x, y, risk: totalRisk };
                }
            }
        }
        
        return bestCell || this.findRandomCell();
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
        console.log('[AI] ACİL EYLEM - Takılma çözülüyor...');
        
        // Önce tahtayı yeniden tara
        this.deepBoardAnalysis();
        
        // 1. Güvenli hücre var mı kontrol et
        for (const key of this.knowledge.safeCells) {
            const [x, y] = key.split(',').map(Number);
            const cell = this.board?.grid?.[y]?.[x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                this.game?.makeBotMove?.(x, y);
                console.log('[AI] Acil: Güvenli hücre açıldı:', x, y);
                return;
            }
        }
        
        // 2. Köşelerden birini dene (genellikle güvenli)
        const corners = [
            { x: 0, y: 0 },
            { x: this.gridSize - 1, y: 0 },
            { x: 0, y: this.gridSize - 1 },
            { x: this.gridSize - 1, y: this.gridSize - 1 }
        ];
        
        for (const corner of corners) {
            const cell = this.board?.grid?.[corner.y]?.[corner.x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                this.game?.makeBotMove?.(corner.x, corner.y);
                console.log('[AI] Acil: Köşe açıldı:', corner.x, corner.y);
                return;
            }
        }
        
        // 3. Kenarlardan birini dene
        for (let i = 0; i < this.gridSize; i++) {
            const edges = [
                { x: i, y: 0 },
                { x: i, y: this.gridSize - 1 },
                { x: 0, y: i },
                { x: this.gridSize - 1, y: i }
            ];
            
            for (const edge of edges) {
                const cell = this.board?.grid?.[edge.y]?.[edge.x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    this.game?.makeBotMove?.(edge.x, edge.y);
                    console.log('[AI] Acil: Kenar açıldı:', edge.x, edge.y);
                    return;
                }
            }
        }
        
        // 4. Son çare: Rastgele hücre
        const random = this.findRandomCell();
        if (random) {
            this.game?.makeBotMove?.(random.x, random.y);
            console.log('[AI] Acil: Rastgele hamle:', random.x, random.y);
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
                // Hamleyi kaydet
                this.recordMove(action);
                break;
                
            case 'reveal':
                const result = this.game?.makeBotMove?.(action.x, action.y);
                this.brain.myState.movesThisGame++;
                
                // HATA ÖĞRENMESİ: Mayına bastıysak kaydet ve öğren
                if (result?.hitMine) {
                    this.brain.myState.minesHit++;
                    this.learnFromMistake(action.x, action.y, 'mine_hit');
                    console.log(`[AI] HATA ÖĞRENMESİ: Mayına basıldı (${action.x},${action.y}) - Bu pattern kaydedildi`);
                }
                
                // Hamleyi kaydet
                this.recordMove(action, result);
                break;
                
            case 'power':
                this.usePower(action.power);
                break;
        }
    }
    
    // Hamleyi kaydet - pattern öğrenme ve deneyim kaydı için
    recordMove(action, result = null) {
        const neighborState = this.getNeighborState(action.x, action.y);
        const probability = this.knowledge.probabilities.get(`${action.x},${action.y}`) || 0.5;
        
        const move = {
            x: action.x,
            y: action.y,
            type: action.type,
            reason: action.reason,
            timestamp: Date.now(),
            success: result ? !result.hitMine : true,
            neighborState,
            probability,
            gamePhase: this.brain.gameState.phase,
            mood: this.brain.mood,
            scoreBefore: this.brain.myState.score
        };
        
        // Brain'e kaydet (pattern öğrenme)
        this.brain.recentMoves.push(move);
        if (this.brain.recentMoves.length > 50) {
            this.brain.recentMoves.shift();
        }
        
        // ⭐ DENEYİM SİSTEMİNE KAYDET
        this.experience.moves.push(move);
        
        // Sonuca göre kategorize et
        if (result?.hitMine) {
            move.result = 'mine';
            this.experience.mistakes.push(move);
            this.experience.gameStats.mineHits++;
        } else if (action.type === 'flag') {
            // Bayrak doğru mu kontrol et
            const cell = this.board?.grid?.[action.y]?.[action.x];
            if (cell?.isMine) {
                move.result = 'flag_correct';
                this.experience.successes.push(move);
                this.experience.gameStats.correctFlags++;
                this.brain.myState.correctFlags++;
            } else {
                move.result = 'flag_wrong';
                this.experience.mistakes.push(move);
                this.experience.gameStats.wrongFlags++;
                this.brain.myState.wrongFlagsPlaced++;
            }
            this.experience.gameStats.flagsPlaced++;
        } else if (action.type === 'reveal' && !result?.hitMine) {
            move.result = 'safe';
            this.experience.successes.push(move);
            this.experience.gameStats.safeMoves++;
        }
        
        this.experience.gameStats.totalMoves++;
        
        // Son 100 hamleyi tut
        if (this.experience.moves.length > 100) {
            this.experience.moves.shift();
        }
    }
    
    // Komşu durumunu al - pattern tanıma için
    getNeighborState(x, y) {
        const neighbors = this.getNeighbors(x, y);
        const state = {
            revealed: 0,
            flagged: 0,
            hidden: 0,
            numbers: []
        };
        
        for (const n of neighbors) {
            const cell = this.board?.grid?.[n.y]?.[n.x];
            if (!cell) continue;
            
            if (cell.isRevealed) {
                state.revealed++;
                if (cell.neighborCount > 0) {
                    state.numbers.push(cell.neighborCount);
                }
            } else if (cell.isFlagged) {
                state.flagged++;
            } else {
                state.hidden++;
            }
        }
        
        return state;
    }
    
    // Hatadan öğren - benzer durumları gelecekte önle
    learnFromMistake(x, y, mistakeType) {
        const neighborState = this.getNeighborState(x, y);
        
        const mistake = {
            x, y,
            type: mistakeType,
            neighborState,
            gamePhase: this.brain.gameState.phase,
            mood: this.brain.mood,
            timestamp: Date.now(),
            // Ek bilgiler - pattern tanıma için
            probability: this.knowledge.probabilities.get(`${x},${y}`) || 0.5,
            wasInDangerZone: this.knowledge.dangerZones.has(`${x},${y}`)
        };
        
        if (mistakeType === 'mine_hit') {
            this.brain.mistakes.mineHits.push(mistake);
            this.brain.myState.minesHit++;
            console.log(`[AI] 💥 HATA ÖĞRENİLDİ: Mayına basıldı (${x},${y}) | Çevre: ${JSON.stringify(neighborState)}`);
        } else if (mistakeType === 'wrong_flag') {
            this.brain.mistakes.wrongFlags.push(mistake);
            this.brain.myState.wrongFlagsPlaced++;
            console.log(`[AI] 🚩❌ HATA ÖĞRENİLDİ: Yanlış bayrak (${x},${y})`);
        }
        
        // Son 30 hatayı tut
        if (this.brain.mistakes.mineHits.length > 30) {
            this.brain.mistakes.mineHits.shift();
        }
        if (this.brain.mistakes.wrongFlags.length > 30) {
            this.brain.mistakes.wrongFlags.shift();
        }
        
        // Bu durumu risk haritasına ekle
        const key = `${x},${y}`;
        this.knowledge.mineCells.add(key);
        
        // Pattern olarak kaydet - gelecekte benzer durumlardan kaçın
        this.learnPattern(mistake);
        
        // Benzer komşu yapısına sahip hücreleri riskli olarak işaretle
        this.markSimilarCellsAsRisky(mistake.neighborState);
        
        // Tehlikeli bölge olarak kaydet
        this.knowledge.dangerZones.set(key, 1.0);
    }
    
    // Pattern öğren - benzer durumları tanı
    learnPattern(mistake) {
        const pattern = {
            neighborState: mistake.neighborState,
            count: 1,
            lastSeen: Date.now()
        };
        
        // Benzer pattern var mı kontrol et
        let found = false;
        for (const existing of this.brain.mistakes.patterns) {
            if (this.isSimilarNeighborState(existing.neighborState, pattern.neighborState)) {
                existing.count++;
                existing.lastSeen = Date.now();
                found = true;
                break;
            }
        }
        
        if (!found) {
            this.brain.mistakes.patterns.push(pattern);
        }
        
        // En fazla 20 pattern tut
        if (this.brain.mistakes.patterns.length > 20) {
            // En eski olanı sil
            this.brain.mistakes.patterns.sort((a, b) => b.lastSeen - a.lastSeen);
            this.brain.mistakes.patterns.pop();
        }
    }
    
    // Bir hücrenin öğrenilmiş tehlikeli pattern'e uyup uymadığını kontrol et
    isDangerousPattern(x, y) {
        const neighborState = this.getNeighborState(x, y);
        
        for (const pattern of this.brain.mistakes.patterns) {
            if (pattern.count >= 2 && this.isSimilarNeighborState(neighborState, pattern.neighborState)) {
                return true;
            }
        }
        
        return false;
    }
    
    // Benzer hücreleri riskli olarak işaretle
    markSimilarCellsAsRisky(mistakeNeighborState) {
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (!cell || cell.isRevealed || cell.isFlagged) continue;
                
                const neighborState = this.getNeighborState(x, y);
                
                // Benzer yapıya sahipse risk olarak işaretle
                if (this.isSimilarNeighborState(neighborState, mistakeNeighborState)) {
                    const key = `${x},${y}`;
                    const currentProb = this.knowledge.probabilities.get(key) || 0.5;
                    const newProb = Math.min(0.95, currentProb + 0.25);
                    this.knowledge.probabilities.set(key, newProb);
                    this.knowledge.dangerZones.set(key, newProb);
                    console.log(`[AI] ⚠️ Benzer riskli hücre: (${x},${y}) - Risk: %${(newProb * 100).toFixed(0)}`);
                }
            }
        }
    }
    
    // Yanlış bayraktan öğren
    learnFromWrongFlag(x, y) {
        this.learnFromMistake(x, y, 'wrong_flag');
        
        // Bu hücreyi güvenli olarak işaretle
        const key = `${x},${y}`;
        this.knowledge.safeCells.add(key);
        this.knowledge.mineCells.delete(key);
        this.knowledge.dangerZones.delete(key);
    }
    
    // Komşu durumları karşılaştır - daha hassas
    isSimilarNeighborState(state1, state2) {
        if (!state1 || !state2) return false;
        
        // Aynı sayıda açık/gizli/bayraklı hücre varsa benzer kabul et
        const revealedDiff = Math.abs(state1.revealed - state2.revealed);
        const hiddenDiff = Math.abs(state1.hidden - state2.hidden);
        const flaggedDiff = Math.abs(state1.flagged - state2.flagged);
        
        // Sayı pattern'i benzerliği
        const hasCommonNumber = state1.numbers.some(n => state2.numbers.includes(n));
        
        return revealedDiff <= 1 && 
               hiddenDiff <= 2 && 
               flaggedDiff <= 1 && 
               (hasCommonNumber || (state1.numbers.length === 0 && state2.numbers.length === 0));
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
