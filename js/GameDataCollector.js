/**
 * GameDataCollector.js - KAPSAMLI DEEP LEARNING VERİ TOPLAMA SİSTEMİ v2
 * 
 * Her oyunu çok detaylı şekilde kaydeder:
 * - Tam tahta durumları (her önemli hamlede)
 * - Tüm oyuncu hamleleri ve düşünme süreleri
 * - Güç kullanımları ve karar nedenleri
 * - Oyuncu davranış kalıpları
 * - Stratejik analiz verileri
 * 
 * Veriler hem localStorage'da hem de Supabase'de saklanır
 * Gelecekte TensorFlow/PyTorch ile eğitim için kullanılabilir
 */

export class GameDataCollector {
    constructor() {
        this.currentGame = null;
        this.isRecording = false;
        this.storageKey = 'mineduel_training_data_v2';
        this.maxStoredGames = 1000; // Daha fazla oyun sakla
        this.apiEndpoint = '/api/stats';
        
        // Anlık veriler
        this.snapshotInterval = null;
        this.lastBoardHash = null;
        
        // Kalite metrikleri
        this.qualityMetrics = {
            minMovesForQuality: 10,
            snapshotEveryNMoves: 5  // Her 5 hamlede bir snapshot
        };
        
        console.log('[DataCollector v2] Initialized - Deep Learning Ready');
        this.logStats();
    }
    
    logStats() {
        const games = this.getAllGames();
        const humanMoves = games.reduce((sum, g) => 
            sum + (g.moves?.filter(m => m.isHuman)?.length || 0), 0);
        console.log(`[DataCollector] Toplam: ${games.length} oyun, ${humanMoves} insan hamlesi`);
    }
    
    // ==================== OYUN YAŞAM DÖNGÜSÜ ====================
    
    startRecording(gameConfig) {
        this.currentGame = {
            // Meta bilgiler
            id: this.generateGameId(),
            version: 2, // Veri formatı versiyonu
            timestamp: Date.now(),
            date: new Date().toISOString(),
            
            // Oyun konfigürasyonu
            config: {
                gridSize: gameConfig.gridSize || 10,
                mineCount: gameConfig.mineCount || 20,
                difficulty: gameConfig.difficulty || 'medium',
                matchDuration: gameConfig.matchDuration || 120000,
                isVsBot: gameConfig.isVsBot || false,
                botDifficulty: gameConfig.botDifficulty || null
            },
            
            // Oyuncular - detaylı bilgi
            players: {
                player1: {
                    name: gameConfig.playerName || 'Player',
                    type: 'human',
                    isHuman: true,
                    finalScore: 0,
                    // Davranış profili
                    profile: {
                        avgThinkTime: 0,
                        riskLevel: 0,     // 0-1, yüksek = riskli oyuncu
                        powerUsageRate: 0, // Güç kullanım sıklığı
                        accuracy: 0        // Mayına basma oranı (düşük = iyi)
                    }
                },
                player2: {
                    name: gameConfig.opponentName || 'Opponent',
                    type: gameConfig.isVsBot ? `bot_${gameConfig.botDifficulty || 'medium'}` : 'human',
                    isHuman: !gameConfig.isVsBot,
                    finalScore: 0,
                    profile: {
                        avgThinkTime: 0,
                        riskLevel: 0,
                        powerUsageRate: 0,
                        accuracy: 0
                    }
                }
            },
            
            // Mayın pozisyonları (oyun başında veya sonunda doldurulacak)
            minePositions: [],
            
            // Tüm hamleler - çok detaylı
            moves: [],
            
            // Güç kullanımları - strateji analizi için
            powerUsages: [],
            
            // Kritik anların tahta snapshot'ları
            snapshots: [],
            
            // Oyun sonucu
            result: {
                winner: null,
                winReason: null,
                duration: 0,
                player1Score: 0,
                player2Score: 0
            },
            
            // Detaylı istatistikler
            stats: {
                player1: {
                    totalMoves: 0,
                    revealMoves: 0,
                    flagMoves: 0,
                    unflagMoves: 0,
                    correctMoves: 0,
                    mineHits: 0,
                    cascadeCount: 0,      // Cascade tetikleme sayısı
                    totalCellsRevealed: 0,
                    powersUsed: 0,
                    avgMoveTime: 0,
                    moveTimes: [],
                    // Risk analizi
                    riskyMoves: 0,        // Yüksek riskli hamleler
                    safetyMoves: 0        // Düşük riskli hamleler
                },
                player2: {
                    totalMoves: 0,
                    revealMoves: 0,
                    flagMoves: 0,
                    unflagMoves: 0,
                    correctMoves: 0,
                    mineHits: 0,
                    cascadeCount: 0,
                    totalCellsRevealed: 0,
                    powersUsed: 0,
                    avgMoveTime: 0,
                    moveTimes: [],
                    riskyMoves: 0,
                    safetyMoves: 0
                }
            },
            
            // Oyun akış analizi
            flowAnalysis: {
                leadChanges: 0,           // Liderlik değişim sayısı
                maxScoreDiff: 0,          // Maksimum skor farkı
                comebackHappened: false,  // Geri dönüş oldu mu
                dominantPlayer: null      // Kim daha baskındı
            }
        };
        
        this.isRecording = true;
        this.lastMoveTime = Date.now();
        this.moveCounter = 0;
        this.lastLeader = null;
        
        console.log(`[DataCollector] 🎬 Recording started: ${this.currentGame.id}`);
    }
    
    // ==================== HAMLE KAYDI - ÇOK DETAYLI ====================
    
    recordMove(moveData) {
        if (!this.isRecording || !this.currentGame) return;
        
        const now = Date.now();
        const timeSinceLastMove = now - this.lastMoveTime;
        this.moveCounter++;
        
        // Risk değerlendirmesi
        const riskLevel = this.calculateMoveRisk(moveData);
        
        const move = {
            // Sıra numarası
            moveNumber: this.moveCounter,
            
            // Zaman
            timestamp: now,
            gameTime: now - this.currentGame.timestamp,
            timeSinceLastMove: timeSinceLastMove,
            
            // Kim yaptı - detaylı
            player: moveData.player, // 'player1' veya 'player2'
            isHuman: this.currentGame.players[moveData.player]?.isHuman ?? true,
            playerType: this.currentGame.players[moveData.player]?.type || 'human',
            
            // Hamle tipi ve konumu
            type: moveData.type, // 'reveal', 'flag', 'unflag', 'power'
            x: moveData.x,
            y: moveData.y,
            
            // Sonuç - detaylı
            result: moveData.result, // 'safe', 'mine', 'cascade', null
            cellValue: moveData.cellValue, // 0-8 veya 'mine' veya -1
            cellsRevealed: moveData.cellsRevealed || 1,
            wasCascade: moveData.cellsRevealed > 1,
            
            // Skor değişimi
            scoreBefore: moveData.scoreBefore || 0,
            scoreAfter: moveData.currentScore || moveData.scoreBefore || 0,
            scoreChange: moveData.scoreChange || 0,
            opponentScore: moveData.opponentScore || 0,
            scoreDiff: (moveData.currentScore || 0) - (moveData.opponentScore || 0),
            
            // Risk analizi
            riskLevel: riskLevel, // 0-1
            wasRisky: riskLevel > 0.4,
            
            // Karar kalitesi (sonradan hesaplanabilir)
            quality: moveData.result === 'mine' ? 0 : (moveData.cellsRevealed > 5 ? 1 : 0.5),
            
            // Tahta durumu (her N hamlede bir veya önemli anlarda)
            boardState: this.shouldTakeSnapshot(moveData) ? 
                this.createDetailedBoardSnapshot(moveData.board) : null
        };
        
        this.currentGame.moves.push(move);
        this.lastMoveTime = now;
        
        // İstatistikleri güncelle
        this.updateMoveStats(moveData, move, riskLevel);
        
        // Liderlik analizi
        this.updateFlowAnalysis(move);
        
        // Önemli anlarda snapshot al
        if (move.boardState) {
            this.currentGame.snapshots.push({
                moveNumber: this.moveCounter,
                boardData: move.boardState,
                trigger: this.getSnapshotTrigger(moveData),
                scoreDiff: move.scoreDiff,
                gameProgress: this.calculateGameProgress(moveData.board)
            });
        }
    }
    
    calculateMoveRisk(moveData) {
        if (moveData.type !== 'reveal') return 0;
        
        // Bilinen güvenli ise risk yok
        if (moveData.wasKnownSafe) return 0;
        
        // Mayına basıldıysa risk 1
        if (moveData.result === 'mine') return 1;
        
        // Cascade ise düşük risk (iyi hamle)
        if (moveData.cellsRevealed > 3) return 0.1;
        
        // Normal hamle - orta risk
        return 0.3;
    }
    
    shouldTakeSnapshot(moveData) {
        // Her N hamlede bir
        if (this.moveCounter % this.qualityMetrics.snapshotEveryNMoves === 0) return true;
        
        // Mayına basıldığında
        if (moveData.result === 'mine') return true;
        
        // Büyük cascade olduğunda
        if (moveData.cellsRevealed > 5) return true;
        
        // Güç kullanıldığında
        if (moveData.type === 'power') return true;
        
        // Skor farkı çok değiştiyse
        if (Math.abs(moveData.scoreChange || 0) > 30) return true;
        
        return false;
    }
    
    getSnapshotTrigger(moveData) {
        if (moveData.result === 'mine') return 'mine_hit';
        if (moveData.cellsRevealed > 5) return 'big_cascade';
        if (moveData.type === 'power') return 'power_use';
        return 'periodic';
    }
    
    updateMoveStats(moveData, move, riskLevel) {
        const stats = this.currentGame.stats[moveData.player];
        if (!stats) return;
        
        stats.totalMoves++;
        stats.moveTimes.push(move.timeSinceLastMove);
        
        if (moveData.type === 'reveal') {
            stats.revealMoves++;
            if (moveData.result === 'mine') {
                stats.mineHits++;
            } else {
                stats.correctMoves++;
                stats.totalCellsRevealed += moveData.cellsRevealed || 1;
                if (moveData.cellsRevealed > 1) {
                    stats.cascadeCount++;
                }
            }
            
            if (riskLevel > 0.4) {
                stats.riskyMoves++;
            } else {
                stats.safetyMoves++;
            }
        } else if (moveData.type === 'flag') {
            stats.flagMoves++;
        } else if (moveData.type === 'unflag') {
            stats.unflagMoves++;
        }
    }
    
    updateFlowAnalysis(move) {
        const flow = this.currentGame.flowAnalysis;
        
        // Liderlik değişimi kontrolü
        const currentLeader = move.scoreDiff > 0 ? move.player : 
                             move.scoreDiff < 0 ? (move.player === 'player1' ? 'player2' : 'player1') : null;
        
        if (this.lastLeader && currentLeader && this.lastLeader !== currentLeader) {
            flow.leadChanges++;
            
            // Geri dönüş kontrolü (30+ puan fark kapatma)
            if (Math.abs(move.scoreDiff) < 10 && flow.maxScoreDiff > 30) {
                flow.comebackHappened = true;
            }
        }
        this.lastLeader = currentLeader;
        
        // Maksimum skor farkı
        flow.maxScoreDiff = Math.max(flow.maxScoreDiff, Math.abs(move.scoreDiff));
    }
    
    calculateGameProgress(board) {
        if (!board?.grid) return 0;
        
        let revealed = 0;
        const size = board.gridSize || 10;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (board.grid[y][x].isRevealed) revealed++;
            }
        }
        
        const mineCount = board.mines?.length || 15;
        const totalSafe = (size * size) - mineCount;
        return totalSafe > 0 ? (revealed / totalSafe) * 100 : 0;
    }
    
    // ==================== GÜÇ KULLANIMI KAYDI - STRATEJİK ANALİZ ====================
    
    recordPowerUsage(powerData) {
        if (!this.isRecording || !this.currentGame) return;
        
        const gameTime = Date.now() - this.currentGame.timestamp;
        const timeRemaining = this.currentGame.config.matchDuration - gameTime;
        const timePercent = (timeRemaining / this.currentGame.config.matchDuration) * 100;
        
        const power = {
            // Zaman
            timestamp: Date.now(),
            gameTime: gameTime,
            timeRemaining: timeRemaining,
            gamePhase: timePercent > 70 ? 'early' : timePercent > 30 ? 'mid' : 'late',
            
            // Kim kullandı
            player: powerData.player,
            playerType: this.currentGame.players[powerData.player]?.type || 'human',
            isHuman: this.currentGame.players[powerData.player]?.isHuman ?? true,
            
            // Güç bilgisi
            type: powerData.powerType,
            cost: powerData.cost,
            
            // Kullanım anı durumu - STRATEJİK KARAR VERİLERİ
            userScore: powerData.scoreBefore,
            scoreAfterCost: powerData.scoreAfter,
            opponentScore: powerData.opponentScore,
            scoreDiff: (powerData.scoreBefore || 0) - (powerData.opponentScore || 0),
            
            // Oyun durumu analizi
            wasLeading: (powerData.scoreBefore || 0) > (powerData.opponentScore || 0),
            leadAmount: Math.abs((powerData.scoreBefore || 0) - (powerData.opponentScore || 0)),
            
            // Güç sonucu ve etkinliği
            effectData: powerData.effect || null,
            
            // Karar nedeni (bot için)
            reason: powerData.reason || null,
            
            // Etkinlik (oyun sonu hesaplanacak)
            wasEffective: null,
            effectivenessScore: null
        };
        
        this.currentGame.powerUsages.push(power);
        
        // İstatistik güncelle
        const stats = this.currentGame.stats[powerData.player];
        if (stats) {
            stats.powersUsed++;
        }
        
        // Güç kullanımı önemli bir an - snapshot al
        if (powerData.board) {
            this.currentGame.snapshots.push({
                moveNumber: this.moveCounter,
                boardData: this.createDetailedBoardSnapshot(powerData.board),
                trigger: `power_${powerData.powerType}`,
                scoreDiff: power.scoreDiff,
                gameProgress: this.calculateGameProgress(powerData.board)
            });
        }
    }
    
    // ==================== DETAYLI TAHTA SNAPSHOT ====================
    
    createDetailedBoardSnapshot(board) {
        if (!board?.grid) return null;
        
        const gridSize = board.gridSize || 10;
        const snapshot = {
            grid: [],
            metadata: {
                revealedCount: 0,
                flaggedCount: 0,
                mineCount: board.mines?.length || 0,
                gridSize: gridSize
            }
        };
        
        for (let y = 0; y < gridSize; y++) {
            const row = [];
            for (let x = 0; x < gridSize; x++) {
                const cell = board.grid[y][x];
                const cellData = {
                    r: cell.isRevealed ? 1 : 0,  // revealed
                    f: cell.isFlagged ? 1 : 0,   // flagged
                    n: cell.neighborCount || 0   // neighbor count
                };
                
                // Sadece açık hücreler veya oyun bittiyse mayın bilgisini ekle
                if (cell.isRevealed && cell.isMine) {
                    cellData.m = 1;
                }
                
                row.push(cellData);
                
                if (cell.isRevealed) snapshot.metadata.revealedCount++;
                if (cell.isFlagged) snapshot.metadata.flaggedCount++;
            }
            snapshot.grid.push(row);
        }
        
        return snapshot;
    }
    
    // Eski format için uyumluluk
    createBoardSnapshot(board) {
        return this.createDetailedBoardSnapshot(board);
    }
    
    // ==================== OYUN SONU - TAM VERİ ====================
    
    async endRecording(endData) {
        if (!this.isRecording || !this.currentGame) return null;
        
        const game = this.currentGame;
        
        // Sonuç bilgileri
        game.result = {
            winner: endData.winner, // 'player1', 'player2', 'draw'
            winReason: endData.winReason, // 'score', 'completion', 'time', 'disconnect'
            duration: Date.now() - game.timestamp,
            player1Score: endData.player1Score || 0,
            player2Score: endData.player2Score || 0,
            scoreDifference: Math.abs((endData.player1Score || 0) - (endData.player2Score || 0))
        };
        
        // Final skorları
        game.players.player1.finalScore = endData.player1Score || 0;
        game.players.player2.finalScore = endData.player2Score || 0;
        
        // Mayın pozisyonları (eğitim için çok önemli)
        if (endData.minePositions) {
            game.minePositions = endData.minePositions;
        }
        
        // Oyuncu profillerini hesapla
        this.calculatePlayerProfiles();
        
        // Akış analizini tamamla
        this.finalizeFlowAnalysis();
        
        // Güç etkinliğini hesapla
        this.calculatePowerEffectiveness();
        
        // Ortalama hamle süreleri hesapla
        for (const playerKey of ['player1', 'player2']) {
            const stats = game.stats[playerKey];
            if (stats.moveTimes.length > 0) {
                stats.avgMoveTime = Math.round(
                    stats.moveTimes.reduce((a, b) => a + b, 0) / stats.moveTimes.length
                );
            }
            // Hafıza tasarrufu için detaylı zamanları sil
            delete stats.moveTimes;
        }
        
        // Kalite skoru hesapla
        game.qualityScore = this.calculateGameQuality(game);
        
        // LocalStorage'a kaydet
        this.saveGame(game);
        
        // Sunucuya kaydet (async, beklemeden)
        this.saveToServer(game).catch(err => {
            console.warn('[DataCollector] Server save failed:', err);
        });
        
        this.isRecording = false;
        this.currentGame = null;
        
        console.log(`[DataCollector] 🎬 Recording ended | Winner: ${endData.winner} | Quality: ${(game.qualityScore * 100).toFixed(0)}%`);
        
        return game;
    }
    
    calculatePlayerProfiles() {
        const game = this.currentGame;
        
        for (const playerKey of ['player1', 'player2']) {
            const stats = game.stats[playerKey];
            const profile = game.players[playerKey].profile;
            
            // Ortalama düşünme süresi
            if (stats.moveTimes.length > 0) {
                profile.avgThinkTime = Math.round(
                    stats.moveTimes.reduce((a, b) => a + b, 0) / stats.moveTimes.length
                );
            }
            
            // Risk seviyesi (riskli hamle oranı)
            const totalDecisions = stats.riskyMoves + stats.safetyMoves;
            if (totalDecisions > 0) {
                profile.riskLevel = stats.riskyMoves / totalDecisions;
            }
            
            // Güç kullanım oranı
            const totalMoves = stats.totalMoves;
            if (totalMoves > 0) {
                profile.powerUsageRate = stats.powersUsed / totalMoves;
            }
            
            // Doğruluk (düşük mayın oranı = yüksek doğruluk)
            if (stats.revealMoves > 0) {
                profile.accuracy = 1 - (stats.mineHits / stats.revealMoves);
            }
        }
    }
    
    finalizeFlowAnalysis() {
        const game = this.currentGame;
        const flow = game.flowAnalysis;
        
        // Baskın oyuncuyu belirle
        const p1Score = game.result.player1Score;
        const p2Score = game.result.player2Score;
        
        if (p1Score > p2Score + 20) {
            flow.dominantPlayer = 'player1';
        } else if (p2Score > p1Score + 20) {
            flow.dominantPlayer = 'player2';
        } else {
            flow.dominantPlayer = 'balanced';
        }
    }
    
    calculatePowerEffectiveness() {
        const game = this.currentGame;
        const winner = game.result.winner;
        
        for (const power of game.powerUsages) {
            // Basit etkinlik: Kullanan oyuncu kazandıysa etkili
            power.wasEffective = power.player === winner;
            
            // Detaylı etkinlik skoru
            let score = 0.5; // Temel skor
            
            // Kazanana bonus
            if (power.wasEffective) score += 0.3;
            
            // Geride iken kullanıma bonus (geri dönüş stratejisi)
            if (!power.wasLeading) score += 0.1;
            
            // Late game kullanımına bonus
            if (power.gamePhase === 'late') score += 0.1;
            
            power.effectivenessScore = Math.min(score, 1);
        }
    }
    
    calculateGameQuality(game) {
        let quality = 0;
        
        // 1. Hamle sayısı (0.3 max)
        const moveCount = game.moves.length;
        quality += Math.min(moveCount / 100, 0.3);
        
        // 2. İnsan oyuncu oranı (0.3 max)
        const humanMoves = game.moves.filter(m => m.isHuman).length;
        quality += Math.min((humanMoves / Math.max(moveCount, 1)) * 0.3, 0.3);
        
        // 3. Oyun süresi uygunluğu (0.2 max)
        const duration = game.result.duration;
        if (duration >= 30000 && duration <= 120000) {
            quality += 0.2;
        } else if (duration >= 15000 && duration <= 180000) {
            quality += 0.1;
        }
        
        // 4. Güç kullanımı çeşitliliği (0.1 max)
        const powerTypes = new Set(game.powerUsages.map(p => p.type));
        quality += Math.min(powerTypes.size * 0.025, 0.1);
        
        // 5. Tamamlanmış oyun (0.1 max)
        if (game.result.winner && game.result.winReason) {
            quality += 0.1;
        }
        
        return Math.min(quality, 1);
    }
    
    // ==================== VERİ SAKLAMA ====================
    
    saveGame(game) {
        try {
            let allGames = this.getAllGames();
            
            // Yeni oyunu ekle
            allGames.push(game);
            
            // Maksimum sınırı aş
            if (allGames.length > this.maxStoredGames) {
                // En eski oyunları sil, ama kaliteli olanları koru
                allGames.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
                const highQuality = allGames.slice(0, Math.floor(this.maxStoredGames * 0.3));
                const recent = allGames.slice(-Math.floor(this.maxStoredGames * 0.7));
                allGames = [...new Set([...highQuality, ...recent])];
            }
            
            localStorage.setItem(this.storageKey, JSON.stringify(allGames));
            
            console.log(`[DataCollector] 💾 Saved locally | Total: ${allGames.length} games`);
        } catch (e) {
            console.error('[DataCollector] Save error:', e);
            // Yer yoksa eski verileri temizle
            this.pruneOldData();
        }
    }
    
    async saveToServer(game) {
        try {
            // API endpoint'e gönder
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game: {
                        id: game.id,
                        gridSize: game.config.gridSize,
                        mineCount: game.config.mineCount,
                        difficulty: game.config.difficulty,
                        matchDuration: game.config.matchDuration,
                        player1Type: game.players.player1.type,
                        player2Type: game.players.player2.type,
                        player1Name: game.players.player1.name,
                        player2Name: game.players.player2.name,
                        winner: game.result.winner,
                        winReason: game.result.winReason,
                        player1Score: game.result.player1Score,
                        player2Score: game.result.player2Score,
                        duration: game.result.duration,
                        minePositions: game.minePositions
                    },
                    moves: game.moves.map(m => ({
                        player: m.player,
                        playerType: m.playerType,
                        type: m.type,
                        x: m.x,
                        y: m.y,
                        result: m.result,
                        cellValue: m.cellValue,
                        cellsRevealed: m.cellsRevealed,
                        scoreBefore: m.scoreBefore,
                        scoreAfter: m.scoreAfter,
                        scoreChange: m.scoreChange,
                        opponentScore: m.opponentScore,
                        gameTime: m.gameTime,
                        thinkTime: m.timeSinceLastMove,
                        boardState: m.boardState
                    })),
                    powers: game.powerUsages.map(p => ({
                        player: p.player,
                        playerType: p.playerType,
                        type: p.type,
                        cost: p.cost,
                        gameTime: p.gameTime,
                        timeRemaining: p.timeRemaining,
                        userScore: p.userScore,
                        opponentScore: p.opponentScore,
                        effectData: p.effectData,
                        reason: p.reason
                    })),
                    snapshots: game.snapshots?.slice(0, 20) // Max 20 snapshot
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log(`[DataCollector] ☁️ Saved to server: ${result.gameId}`);
            } else {
                console.warn('[DataCollector] Server save failed:', response.status);
            }
        } catch (error) {
            // Sunucu erişilemez - sessizce başarısız ol
            console.warn('[DataCollector] Server unreachable, local save only');
        }
    }
    
    getAllGames() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }
    
    pruneOldData() {
        try {
            let allGames = this.getAllGames();
            // Yarısını sil, kalitelileri koru
            allGames.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
            allGames = allGames.slice(0, Math.floor(this.maxStoredGames / 2));
            localStorage.setItem(this.storageKey, JSON.stringify(allGames));
            console.log('[DataCollector] Old data pruned');
        } catch (e) {
            // Hala yer yoksa hepsini sil
            localStorage.removeItem(this.storageKey);
        }
    }
    
    // ==================== VERİ EXPORT - DEEP LEARNING İÇİN ====================
    
    exportData(format = 'json') {
        const games = this.getAllGames();
        
        if (format === 'json') {
            return JSON.stringify(games, null, 2);
        } else if (format === 'csv') {
            return this.convertToCSV(games);
        } else if (format === 'training') {
            return this.convertToTrainingFormat(games);
        } else if (format === 'tensorflow') {
            return this.convertToTensorFlowFormat(games);
        }
        
        return null;
    }
    
    convertToCSV(games) {
        const headers = [
            'game_id', 'timestamp', 'grid_size', 'mine_count', 'difficulty',
            'is_vs_bot', 'winner', 'duration_ms', 'player1_score', 'player2_score',
            'player1_moves', 'player1_mine_hits', 'player1_powers_used', 'player1_accuracy',
            'player2_moves', 'player2_mine_hits', 'player2_powers_used', 'player2_accuracy',
            'quality_score', 'lead_changes', 'comeback'
        ];
        
        const rows = games.map(game => [
            game.id,
            game.timestamp,
            game.config.gridSize,
            game.config.mineCount,
            game.config.difficulty,
            game.config.isVsBot ? 1 : 0,
            game.result.winner,
            game.result.duration,
            game.result.player1Score,
            game.result.player2Score,
            game.stats.player1.totalMoves,
            game.stats.player1.mineHits,
            game.stats.player1.powersUsed,
            (game.players.player1.profile?.accuracy || 0).toFixed(2),
            game.stats.player2.totalMoves,
            game.stats.player2.mineHits,
            game.stats.player2.powersUsed,
            (game.players.player2.profile?.accuracy || 0).toFixed(2),
            (game.qualityScore || 0).toFixed(2),
            game.flowAnalysis?.leadChanges || 0,
            game.flowAnalysis?.comebackHappened ? 1 : 0
        ].join(','));
        
        return [headers.join(','), ...rows].join('\n');
    }
    
    convertToTrainingFormat(games) {
        // Deep Learning için özel format
        // Her hamle bir training örneği olacak
        const trainingData = [];
        
        for (const game of games) {
            // Sadece kaliteli oyunları kullan
            if ((game.qualityScore || 0) < 0.3) continue;
            
            for (const move of game.moves) {
                if (move.type === 'reveal' && move.boardState) {
                    trainingData.push({
                        // Input: Tahta durumu (flattened)
                        input: {
                            board: move.boardState,
                            scoreDiff: move.scoreDiff || 0,
                            timeRemaining: game.config.matchDuration - move.gameTime,
                            gameProgress: move.boardState?.metadata?.revealedCount || 0,
                            mineCount: game.config.mineCount
                        },
                        // Output: Yapılan hamle ve sonucu
                        output: {
                            x: move.x,
                            y: move.y,
                            wasGood: move.result !== 'mine' ? 1 : 0,
                            scoreGain: move.scoreChange || 0
                        },
                        // Meta
                        meta: {
                            gameId: game.id,
                            player: move.player,
                            playerType: move.playerType,
                            wasHuman: move.isHuman,
                            moveNumber: move.moveNumber,
                            gameQuality: game.qualityScore
                        }
                    });
                }
            }
        }
        
        return JSON.stringify(trainingData);
    }
    
    convertToTensorFlowFormat(games) {
        // TensorFlow.js için hazır format
        const features = [];
        const labels = [];
        
        for (const game of games) {
            if ((game.qualityScore || 0) < 0.3) continue;
            
            for (const move of game.moves) {
                if (move.type !== 'reveal' || !move.boardState?.grid) continue;
                
                // Feature: Flatten board state (10x10 = 100 cells, 3 features each)
                const boardFeatures = [];
                for (const row of move.boardState.grid) {
                    for (const cell of row) {
                        boardFeatures.push(cell.r); // revealed
                        boardFeatures.push(cell.f); // flagged
                        boardFeatures.push(cell.n / 8); // normalized neighbor count
                    }
                }
                
                // Ek özellikler
                boardFeatures.push(move.scoreDiff / 100); // normalized score diff
                boardFeatures.push(move.gameTime / game.config.matchDuration); // time progress
                
                features.push(boardFeatures);
                
                // Label: Hücre pozisyonu (one-hot olabilir) ve sonuç
                labels.push({
                    position: move.y * 10 + move.x, // 0-99
                    result: move.result !== 'mine' ? 1 : 0
                });
            }
        }
        
        return JSON.stringify({ features, labels });
    }
    
    // ==================== İSTATİSTİKLER ====================
    
    getStats() {
        const games = this.getAllGames();
        
        // Detaylı istatistikler
        let totalMoves = 0;
        let totalHumanMoves = 0;
        let totalBotMoves = 0;
        let totalPowerUses = 0;
        let totalQuality = 0;
        
        for (const game of games) {
            totalMoves += game.moves?.length || 0;
            totalHumanMoves += game.moves?.filter(m => m.isHuman)?.length || 0;
            totalBotMoves += game.moves?.filter(m => !m.isHuman)?.length || 0;
            totalPowerUses += game.powerUsages?.length || 0;
            totalQuality += game.qualityScore || 0;
        }
        
        return {
            totalGames: games.length,
            vsBot: games.filter(g => g.config.isVsBot).length,
            vsHuman: games.filter(g => !g.config.isVsBot).length,
            totalMoves: totalMoves,
            totalHumanMoves: totalHumanMoves,
            totalBotMoves: totalBotMoves,
            totalPowerUses: totalPowerUses,
            avgGameDuration: games.length > 0 
                ? Math.round(games.reduce((sum, g) => sum + (g.result?.duration || 0), 0) / games.length)
                : 0,
            avgQuality: games.length > 0 
                ? (totalQuality / games.length).toFixed(2)
                : 0,
            storageUsedKB: this.getStorageSize(),
            highQualityGames: games.filter(g => (g.qualityScore || 0) >= 0.6).length
        };
    }
    
    getStorageSize() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? Math.round((data.length * 2) / 1024) : 0; // KB cinsinden
        } catch (e) {
            return 0;
        }
    }
    
    // ==================== GÜÇ ANALİZİ ====================
    
    getPowerAnalysis() {
        const games = this.getAllGames();
        const analysis = {
            freeze: { uses: 0, humanUses: 0, botUses: 0, winRate: 0, wins: 0 },
            shield: { uses: 0, humanUses: 0, botUses: 0, winRate: 0, wins: 0 },
            radar: { uses: 0, humanUses: 0, botUses: 0, winRate: 0, wins: 0 },
            safeburst: { uses: 0, humanUses: 0, botUses: 0, winRate: 0, wins: 0 }
        };
        
        for (const game of games) {
            for (const power of (game.powerUsages || [])) {
                const type = power.type;
                if (!analysis[type]) continue;
                
                analysis[type].uses++;
                if (power.isHuman) {
                    analysis[type].humanUses++;
                } else {
                    analysis[type].botUses++;
                }
                
                if (power.wasEffective) {
                    analysis[type].wins++;
                }
            }
        }
        
        // Win rate hesapla
        for (const type of Object.keys(analysis)) {
            const data = analysis[type];
            data.winRate = data.uses > 0 ? ((data.wins / data.uses) * 100).toFixed(1) : 0;
        }
        
        return analysis;
    }
    
    // ==================== YARDIMCI ====================
    
    generateGameId() {
        return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    clearAllData() {
        localStorage.removeItem(this.storageKey);
        console.log('[DataCollector] All data cleared');
    }
    
    downloadData(filename = 'mineduel_training_data.json') {
        const data = this.exportData('json');
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        
        URL.revokeObjectURL(url);
        console.log('[DataCollector] 📥 Data downloaded:', filename);
    }
    
    downloadTrainingData(filename = 'mineduel_ml_training.json') {
        const data = this.exportData('training');
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        
        URL.revokeObjectURL(url);
        console.log('[DataCollector] 📥 Training data downloaded:', filename);
    }
    
    downloadTensorFlowData(filename = 'mineduel_tensorflow.json') {
        const data = this.exportData('tensorflow');
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        
        URL.revokeObjectURL(url);
        console.log('[DataCollector] 📥 TensorFlow data downloaded:', filename);
    }
}

// Singleton instance
export const dataCollector = new GameDataCollector();

// Global erişim için window'a ekle (konsol kullanımı için)
if (typeof window !== 'undefined') {
    window.dataCollector = dataCollector;
}
