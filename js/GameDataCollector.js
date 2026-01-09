/**
 * GameDataCollector.js - DEEP LEARNING VERİ TOPLAMA SİSTEMİ
 * 
 * Her oyunu detaylı şekilde kaydeder:
 * - Tahta durumları
 * - Oyuncu hamleleri
 * - Zaman bilgileri
 * - Güç kullanımları
 * - Sonuçlar
 * 
 * Bu veriler gelecekte bir yapay zeka eğitmek için kullanılabilir.
 */

export class GameDataCollector {
    constructor() {
        this.currentGame = null;
        this.isRecording = false;
        this.storageKey = 'mineduel_training_data';
        this.maxStoredGames = 500; // Maksimum saklanan oyun sayısı
        
        console.log('[DataCollector] Initialized');
    }
    
    // ==================== OYUN YAŞAM DÖNGÜSÜ ====================
    
    startRecording(gameConfig) {
        this.currentGame = {
            // Meta bilgiler
            id: this.generateGameId(),
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
            
            // Oyuncular
            players: {
                player1: {
                    name: gameConfig.playerName || 'Player',
                    isHuman: true,
                    finalScore: 0
                },
                player2: {
                    name: gameConfig.opponentName || 'Opponent',
                    isHuman: !gameConfig.isVsBot,
                    finalScore: 0
                }
            },
            
            // Mayın pozisyonları (oyun sonunda doldurulacak)
            minePositions: [],
            
            // Tüm hamleler
            moves: [],
            
            // Güç kullanımları
            powerUsages: [],
            
            // Oyun sonucu
            result: {
                winner: null,
                winReason: null,
                duration: 0,
                player1Score: 0,
                player2Score: 0
            },
            
            // İstatistikler
            stats: {
                player1: {
                    totalMoves: 0,
                    correctMoves: 0,
                    mineHits: 0,
                    flagsPlaced: 0,
                    flagsRemoved: 0,
                    powersUsed: 0,
                    avgMoveTime: 0,
                    moveTimes: []
                },
                player2: {
                    totalMoves: 0,
                    correctMoves: 0,
                    mineHits: 0,
                    flagsPlaced: 0,
                    flagsRemoved: 0,
                    powersUsed: 0,
                    avgMoveTime: 0,
                    moveTimes: []
                }
            }
        };
        
        this.isRecording = true;
        this.lastMoveTime = Date.now();
        
        console.log(`[DataCollector] Recording started: ${this.currentGame.id}`);
    }
    
    // ==================== HAMLE KAYDI ====================
    
    recordMove(moveData) {
        if (!this.isRecording || !this.currentGame) return;
        
        const now = Date.now();
        const timeSinceLastMove = now - this.lastMoveTime;
        
        const move = {
            // Zaman
            timestamp: now,
            gameTime: now - this.currentGame.timestamp,
            timeSinceLastMove: timeSinceLastMove,
            
            // Kim yaptı
            player: moveData.player, // 'player1' veya 'player2'
            
            // Hamle tipi
            type: moveData.type, // 'reveal', 'flag', 'unflag', 'power'
            
            // Pozisyon
            x: moveData.x,
            y: moveData.y,
            
            // Sonuç
            result: moveData.result, // 'safe', 'mine', 'cascade', null
            cellValue: moveData.cellValue, // 0-8 veya 'mine'
            cellsRevealed: moveData.cellsRevealed || 1,
            
            // Skor değişimi
            scoreChange: moveData.scoreChange || 0,
            currentScore: moveData.currentScore || 0,
            opponentScore: moveData.opponentScore || 0,
            
            // Tahta durumu (önemli hamleler için)
            boardSnapshot: moveData.includeSnapshot ? this.createBoardSnapshot(moveData.board) : null
        };
        
        this.currentGame.moves.push(move);
        this.lastMoveTime = now;
        
        // İstatistikleri güncelle
        const stats = this.currentGame.stats[moveData.player];
        if (stats) {
            stats.totalMoves++;
            stats.moveTimes.push(timeSinceLastMove);
            
            if (moveData.type === 'reveal') {
                if (moveData.result === 'mine') {
                    stats.mineHits++;
                } else {
                    stats.correctMoves++;
                }
            } else if (moveData.type === 'flag') {
                stats.flagsPlaced++;
            } else if (moveData.type === 'unflag') {
                stats.flagsRemoved++;
            }
        }
    }
    
    // ==================== GÜÇ KULLANIMI KAYDI ====================
    
    recordPowerUsage(powerData) {
        if (!this.isRecording || !this.currentGame) return;
        
        const power = {
            timestamp: Date.now(),
            gameTime: Date.now() - this.currentGame.timestamp,
            player: powerData.player,
            powerType: powerData.powerType, // 'freeze', 'shield', 'radar', 'safeburst'
            cost: powerData.cost,
            scoreBefore: powerData.scoreBefore,
            scoreAfter: powerData.scoreAfter,
            opponentScore: powerData.opponentScore,
            effect: powerData.effect || null // Özel efekt bilgisi
        };
        
        this.currentGame.powerUsages.push(power);
        
        // İstatistik güncelle
        const stats = this.currentGame.stats[powerData.player];
        if (stats) {
            stats.powersUsed++;
        }
    }
    
    // ==================== TAHTA SNAPSHOT ====================
    
    createBoardSnapshot(board) {
        if (!board?.grid) return null;
        
        const snapshot = [];
        const gridSize = board.gridSize || 10;
        
        for (let y = 0; y < gridSize; y++) {
            const row = [];
            for (let x = 0; x < gridSize; x++) {
                const cell = board.grid[y][x];
                row.push({
                    r: cell.isRevealed ? 1 : 0,  // revealed
                    f: cell.isFlagged ? 1 : 0,   // flagged
                    m: cell.isMine ? 1 : 0,      // mine (sadece açıksa veya oyun bittiyse)
                    n: cell.neighborCount || 0   // neighbor count
                });
            }
            snapshot.push(row);
        }
        
        return snapshot;
    }
    
    // ==================== OYUN SONU ====================
    
    endRecording(endData) {
        if (!this.isRecording || !this.currentGame) return null;
        
        const game = this.currentGame;
        
        // Sonuç bilgileri
        game.result = {
            winner: endData.winner, // 'player1', 'player2', 'draw'
            winReason: endData.winReason, // 'score', 'completion', 'time', 'disconnect'
            duration: Date.now() - game.timestamp,
            player1Score: endData.player1Score || 0,
            player2Score: endData.player2Score || 0
        };
        
        // Final skorları
        game.players.player1.finalScore = endData.player1Score || 0;
        game.players.player2.finalScore = endData.player2Score || 0;
        
        // Mayın pozisyonları
        if (endData.minePositions) {
            game.minePositions = endData.minePositions;
        }
        
        // Ortalama hamle süreleri hesapla
        for (const playerKey of ['player1', 'player2']) {
            const stats = game.stats[playerKey];
            if (stats.moveTimes.length > 0) {
                stats.avgMoveTime = stats.moveTimes.reduce((a, b) => a + b, 0) / stats.moveTimes.length;
            }
            // Hafıza tasarrufu için detaylı zamanları sil
            delete stats.moveTimes;
        }
        
        // Kaydet
        this.saveGame(game);
        
        this.isRecording = false;
        this.currentGame = null;
        
        console.log(`[DataCollector] Recording ended. Winner: ${endData.winner}`);
        
        return game;
    }
    
    // ==================== VERİ SAKLAMA ====================
    
    saveGame(game) {
        try {
            let allGames = this.getAllGames();
            
            // Yeni oyunu ekle
            allGames.push(game);
            
            // Maksimum sınırı aş
            if (allGames.length > this.maxStoredGames) {
                // En eski oyunları sil
                allGames = allGames.slice(-this.maxStoredGames);
            }
            
            localStorage.setItem(this.storageKey, JSON.stringify(allGames));
            
            console.log(`[DataCollector] Game saved. Total: ${allGames.length}`);
        } catch (e) {
            console.error('[DataCollector] Save error:', e);
            // Yer yoksa eski verileri temizle
            this.pruneOldData();
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
            // Yarısını sil
            allGames = allGames.slice(-Math.floor(this.maxStoredGames / 2));
            localStorage.setItem(this.storageKey, JSON.stringify(allGames));
            console.log('[DataCollector] Old data pruned');
        } catch (e) {
            // Hala yer yoksa hepsini sil
            localStorage.removeItem(this.storageKey);
        }
    }
    
    // ==================== VERİ EXPORT ====================
    
    exportData(format = 'json') {
        const games = this.getAllGames();
        
        if (format === 'json') {
            return JSON.stringify(games, null, 2);
        } else if (format === 'csv') {
            return this.convertToCSV(games);
        } else if (format === 'training') {
            return this.convertToTrainingFormat(games);
        }
        
        return null;
    }
    
    convertToCSV(games) {
        const headers = [
            'game_id', 'timestamp', 'grid_size', 'mine_count', 'difficulty',
            'is_vs_bot', 'winner', 'duration_ms', 'player1_score', 'player2_score',
            'player1_moves', 'player1_mine_hits', 'player1_powers_used',
            'player2_moves', 'player2_mine_hits', 'player2_powers_used'
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
            game.stats.player2.totalMoves,
            game.stats.player2.mineHits,
            game.stats.player2.powersUsed
        ].join(','));
        
        return [headers.join(','), ...rows].join('\n');
    }
    
    convertToTrainingFormat(games) {
        // Deep Learning için özel format
        // Her hamle bir training örneği olacak
        const trainingData = [];
        
        for (const game of games) {
            for (const move of game.moves) {
                if (move.type === 'reveal' && move.boardSnapshot) {
                    trainingData.push({
                        // Input: Tahta durumu
                        input: {
                            board: move.boardSnapshot,
                            scoreDiff: move.currentScore - move.opponentScore,
                            timeRemaining: game.config.matchDuration - move.gameTime,
                            mineCount: game.config.mineCount
                        },
                        // Output: Yapılan hamle ve sonucu
                        output: {
                            x: move.x,
                            y: move.y,
                            result: move.result === 'mine' ? 0 : 1, // 0: kötü, 1: iyi
                            scoreGain: move.scoreChange
                        },
                        // Meta
                        meta: {
                            gameId: game.id,
                            player: move.player,
                            wasHuman: game.players[move.player].isHuman
                        }
                    });
                }
            }
        }
        
        return JSON.stringify(trainingData);
    }
    
    // ==================== İSTATİSTİKLER ====================
    
    getStats() {
        const games = this.getAllGames();
        
        return {
            totalGames: games.length,
            vsBot: games.filter(g => g.config.isVsBot).length,
            vsHuman: games.filter(g => !g.config.isVsBot).length,
            totalMoves: games.reduce((sum, g) => sum + g.moves.length, 0),
            avgGameDuration: games.length > 0 
                ? games.reduce((sum, g) => sum + g.result.duration, 0) / games.length 
                : 0,
            storageUsed: this.getStorageSize()
        };
    }
    
    getStorageSize() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? (data.length * 2) / 1024 : 0; // KB cinsinden
        } catch (e) {
            return 0;
        }
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
        console.log('[DataCollector] Data downloaded');
    }
}

// Singleton instance
export const dataCollector = new GameDataCollector();
