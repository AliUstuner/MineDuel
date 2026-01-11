/**
 * BotCore.js - Advanced Minesweeper AI Core
 * 
 * Three-layer AI architecture for fair, competitive gameplay:
 * 1. Deterministic Layer - Guaranteed Minesweeper rules (CSP-based)
 * 2. Probabilistic Layer - Risk estimation when no safe moves exist
 * 3. Strategic Layer - Speed, power usage, PvP decisions
 * 
 * CRITICAL FAIRNESS RULES:
 * - Bot NEVER accesses hidden mine locations
 * - Bot only uses information visible to a human player
 * - Bot has configurable reaction delays (human-like)
 * 
 * @version 9.0 - Complete Rewrite
 * @author MineDuel AI System
 */

import { DeterministicLayer } from './DeterministicLayer.js';
import { ProbabilisticLayer } from './ProbabilisticLayer.js';
import { StrategicLayer } from './StrategicLayer.js';
import { BotDifficultyConfig } from './BotDifficultyConfig.js';
import { BotLearningSystem } from './BotLearningSystem.js';

export class BotCore {
    constructor(game, difficulty = 'medium') {
        this.game = game;
        this.difficulty = difficulty;
        
        // Grid reference (set by start())
        this.board = null;
        this.gridSize = 10;
        
        // State flags
        this.isActive = false;
        this.isThinking = false;
        this.isFrozen = false;
        this.frozenUntil = 0;
        
        // Think timer
        this.thinkTimer = null;
        
        // Load difficulty configuration
        this.config = new BotDifficultyConfig(difficulty);
        
        // Initialize three AI layers
        this.deterministicLayer = new DeterministicLayer(this);
        this.probabilisticLayer = new ProbabilisticLayer(this);
        this.strategicLayer = new StrategicLayer(this);
        
        // Initialize learning system
        this.learningSystem = new BotLearningSystem(this);
        
        // Game state perception
        this.gameState = {
            myScore: 0,
            opponentScore: 0,
            scoreDiff: 0,
            timeRemaining: 100,
            phase: 'early',       // early, mid, late, critical
            urgency: 0,           // 0-100
            movesThisGame: 0,
            minesHit: 0,
            correctFlags: 0,
            wrongFlags: 0
        };
        
        // Move history for pattern learning
        this.moveHistory = [];
        
        // Power usage tracking
        this.powerUsage = {
            freeze: 0,
            shield: 0,
            radar: 0,
            safeburst: 0,
            lastUseTime: 0
        };
        
        // Known information (visible state only!)
        this.visibleState = {
            revealedCells: new Map(),    // key -> {neighborCount, x, y}
            flaggedCells: new Set(),     // cells we've flagged
            radarMines: new Set(),       // mines revealed by radar
            pendingRadarFlags: []        // radar mines to be flagged
        };
        
        console.log(`[BotCore v9] Initialized | Difficulty: ${difficulty} | Config: ${JSON.stringify(this.config.getParams())}`);
    }
    
    // ==================== LIFECYCLE ====================
    
    /**
     * Start the bot for a new game
     */
    start(board, gridSize) {
        this.stop(); // Clean up any previous game
        
        this.board = board;
        this.gridSize = gridSize;
        this.isActive = true;
        this.isThinking = false;
        this.isFrozen = false;
        this.frozenUntil = 0;
        
        // Debug: Board referansını kontrol et
        console.log(`[BotCore] Board received:`, {
            isOpponent: board?.isOpponent,
            gridSize: board?.gridSize,
            hasMines: board?.mines?.length > 0,
            canvas: board?.canvas?.id
        });
        
        // Reset state
        this.resetState();
        
        // Notify learning system
        this.learningSystem.startGame({
            gridSize,
            difficulty: this.difficulty,
            timestamp: Date.now()
        });
        
        console.log(`[BotCore] Started | Grid: ${gridSize}x${gridSize}`);
        
        // Begin thinking loop
        this.scheduleThink();
    }
    
    /**
     * Stop the bot
     */
    stop() {
        this.isActive = false;
        this.isThinking = false;
        
        if (this.thinkTimer) {
            clearTimeout(this.thinkTimer);
            this.thinkTimer = null;
        }
        
        console.log('[BotCore] Stopped');
    }
    
    /**
     * Reset all state for a new game
     */
    resetState() {
        this.gameState = {
            myScore: 0,
            opponentScore: 0,
            scoreDiff: 0,
            timeRemaining: 100,
            phase: 'early',
            urgency: 0,
            movesThisGame: 0,
            minesHit: 0,
            correctFlags: 0,
            wrongFlags: 0
        };
        
        this.moveHistory = [];
        this.powerUsage = {
            freeze: 0,
            shield: 0,
            radar: 0,
            safeburst: 0,
            lastUseTime: 0
        };
        
        this.visibleState = {
            revealedCells: new Map(),
            flaggedCells: new Set(),
            radarMines: new Set(),
            pendingRadarFlags: [],
            recentlyUnflagged: new Set(),  // Yakın zamanda bayrak kaldırılan hücreler
            unflagCooldown: new Map()      // Unflag cooldown - döngüyü kırmak için
        };
        
        // Reset layers
        this.deterministicLayer.reset();
        this.probabilisticLayer.reset();
        this.strategicLayer.reset();
    }
    
    /**
     * Freeze the bot temporarily (opponent power)
     * @param {number} durationMs - Duration in milliseconds
     */
    freeze(durationMs) {
        this.isFrozen = true;
        this.frozenUntil = Date.now() + durationMs;
        console.log(`[BotCore] Frozen for ${durationMs}ms`);
    }
    
    /**
     * Legacy compatibility: endGameLearning wrapper
     * Called by gameSupabase.js
     * @param {boolean} botWon - Did the bot win?
     * @param {number} playerScore - Player's final score
     * @param {number} botScore - Bot's final score
     * @param {boolean} isDraw - Was it a draw?
     */
    endGameLearning(botWon, playerScore, botScore, isDraw = false) {
        this.endGame({
            botWon,
            draw: isDraw,
            botScore,
            playerScore
        });
    }
    
    // ==================== MAIN THINKING LOOP ====================
    
    /**
     * Schedule next think cycle with human-like delay
     */
    scheduleThink() {
        if (!this.isActive || this.game?.gameEnded) return;
        
        const delay = this.config.getThinkDelay();
        this.thinkTimer = setTimeout(() => this.think(), delay);
    }
    
    /**
     * Main think cycle - the brain of the bot
     */
    async think() {
        if (!this.isActive || this.isThinking || this.game?.gameEnded) return;
        
        // Check if frozen
        if (this.isFrozen && Date.now() < this.frozenUntil) {
            this.scheduleThink();
            return;
        }
        this.isFrozen = false;
        
        this.isThinking = true;
        this.game?.showBotThinking?.();
        
        try {
            // STEP 1: Perceive the game state
            this.perceive();
            
            // STEP 2: Rastgele güç kullanımını dene (her 5-10 saniyede bir)
            const randomPowerUsed = this.tryRandomPowerUsage();
            if (randomPowerUsed) {
                // Güç kullandıysak bu turda başka hamle yapma
                this.isThinking = false;
                this.game?.hideBotThinking?.();
                this.scheduleThink();
                return;
            }
            
            // STEP 3: Analyze visible board (never access hidden info!)
            this.analyzeVisibleBoard();
            
            // STEP 4: Run three-layer decision process
            const action = this.decide();
            
            // STEP 5: Execute the chosen action
            if (action) {
                this.execute(action);
            } else {
                // No valid action found - take emergency action
                this.emergencyAction();
            }
            
        } catch (error) {
            console.error('[BotCore] Think error:', error);
            this.emergencyAction();
        }
        
        this.isThinking = false;
        this.game?.hideBotThinking?.();
        
        // Continue thinking loop
        if (this.isActive && !this.game?.gameEnded) {
            this.scheduleThink();
        }
    }
    
    // ==================== PERCEPTION ====================
    
    /**
     * Perceive the current game state from visible information
     */
    perceive() {
        const gs = this.gameState;
        
        // Scores
        gs.myScore = this.game?.opponentScore || 0;
        gs.opponentScore = this.game?.score || 0;
        gs.scoreDiff = gs.myScore - gs.opponentScore;
        
        // Time
        const elapsed = Date.now() - (this.game?.matchStartTime || Date.now());
        const total = this.game?.matchDuration || 120000;
        gs.timeRemaining = Math.max(0, 100 - (elapsed / total) * 100);
        
        // Game phase
        if (gs.timeRemaining > 70) gs.phase = 'early';
        else if (gs.timeRemaining > 40) gs.phase = 'mid';
        else if (gs.timeRemaining > 15) gs.phase = 'late';
        else gs.phase = 'critical';
        
        // Urgency calculation
        const timePressure = (100 - gs.timeRemaining) / 2;
        const scorePressure = Math.max(0, -gs.scoreDiff) / 2;
        gs.urgency = Math.min(100, timePressure + scorePressure);
    }
    
    /**
     * Analyze the visible board state (cells that are revealed)
     * NEVER access hidden mine positions!
     */
    analyzeVisibleBoard() {
        if (!this.board?.grid) return;
        
        const revealed = this.visibleState.revealedCells;
        revealed.clear();
        
        // Scan the board for visible (revealed) cells only
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board.grid[y][x];
                
                if (cell.isRevealed) {
                    // We can only see revealed cells' neighbor counts
                    // We CANNOT see if unrevealed cells are mines!
                    revealed.set(`${x},${y}`, {
                        x, y,
                        neighborCount: cell.neighborCount,
                        isMine: cell.isMine // Only visible because it was revealed (game over)
                    });
                }
                
                // Track our own flags
                if (cell.isFlagged) {
                    this.visibleState.flaggedCells.add(`${x},${y}`);
                } else {
                    this.visibleState.flaggedCells.delete(`${x},${y}`);
                }
            }
        }
    }
    
    // ==================== THREE-LAYER DECISION PROCESS ====================
    
    /**
     * Main decision function - uses three layers
     * @returns {Object|null} The chosen action
     */
    decide() {
        const candidates = [];
        
        // Cooldown temizliği (10 saniyeden eski olanları sil)
        const now = Date.now();
        for (const [key, time] of this.visibleState.unflagCooldown) {
            if (now - time > 10000) {
                this.visibleState.unflagCooldown.delete(key);
                this.visibleState.recentlyUnflagged.delete(key);
            }
        }
        
        // LAYER 1: Deterministic (guaranteed moves)
        const safeCells = this.deterministicLayer.findSafeCells();
        const mineCells = this.deterministicLayer.findMineCells();
        const suspiciousFlags = this.deterministicLayer.getSuspiciousFlags();
        
        console.log(`[BotCore] Deterministic found: ${safeCells.length} safe, ${mineCells.length} mines, ${suspiciousFlags.length} suspicious flags`);
        
        // ======================================================================
        // YENİ ÖNCELİK SİSTEMİ: BAYRAK > REVEAL > GÜÇ
        // ======================================================================
        
        // ÖNCELİK 1: Kesin mayınları bayrakla (EN ÖNEMLİ!)
        for (const cell of mineCells) {
            const key = `${cell.x},${cell.y}`;
            // Yakın zamanda unflag edilen hücreyi tekrar bayraklama
            if (this.visibleState.recentlyUnflagged.has(key)) continue;
            if (!this.visibleState.flaggedCells.has(key)) {
                candidates.push({
                    type: 'flag',
                    x: cell.x,
                    y: cell.y,
                    priority: 110,  // En yüksek - power'dan bile yüksek
                    reason: 'Deterministic: Confirmed mine - FLAG!',
                    layer: 'deterministic'
                });
            }
        }
        
        // Radar mayınlarını bayrakla
        for (const pos of this.visibleState.pendingRadarFlags) {
            const key = `${pos.x},${pos.y}`;
            if (!this.visibleState.flaggedCells.has(key)) {
                candidates.push({
                    type: 'flag',
                    x: pos.x,
                    y: pos.y,
                    priority: 110,  // En yüksek - power'dan bile yüksek
                    reason: 'Radar: Revealed mine - FLAG!',
                    layer: 'deterministic'
                });
            }
        }
        
        // ÖNCELİK 2: Güvenli hücreleri aç
        for (const cell of safeCells) {
            candidates.push({
                type: 'reveal',
                x: cell.x,
                y: cell.y,
                priority: 88,  // Reveal priority - power bazen önce gelebilsin
                reason: 'Deterministic: Guaranteed safe',
                layer: 'deterministic'
            });
        }
        
        // NOT: Şüpheli bayrak kaldırma devre dışı - sorun çıkarıyordu
        // Bot artık sadece kesin bildiği mayınları bayraklıyor
        
        // Eğer deterministic hamle varsa, güç kullanımını da değerlendir
        if (candidates.length > 0) {
            const powerAction = this.strategicLayer.evaluatePowerUsage();
            if (powerAction) {
                // Güç score'u yüksekse bazen reveal'dan önce kullan
                // Power score 60+ ise priority reveal'ı geçebilir
                console.log(`[BotCore] Power candidate: ${powerAction.power} priority=${powerAction.priority}`);
                candidates.push(powerAction);
            }
            
            candidates.sort((a, b) => b.priority - a.priority);
            return this.selectActionByDifficulty(candidates);
        }
        
        // LAYER 2: Probabilistic (when no deterministic moves)
        if (candidates.filter(c => c.type === 'reveal').length === 0) {
            const riskyMoves = this.probabilisticLayer.findLowRiskCells();
            
            for (const move of riskyMoves) {
                candidates.push({
                    type: 'reveal',
                    x: move.x,
                    y: move.y,
                    priority: 60 - (move.risk * 50), // Lower risk = higher priority
                    reason: `Probabilistic: ${(move.risk * 100).toFixed(1)}% risk`,
                    layer: 'probabilistic',
                    risk: move.risk
                });
            }
        }
        
        // LAYER 3: Strategic (power usage, timing)
        const powerAction = this.strategicLayer.evaluatePowerUsage();
        if (powerAction) {
            candidates.push(powerAction);
        }
        
        // No candidates? Return null for emergency action
        if (candidates.length === 0) return null;
        
        // Sort by priority
        candidates.sort((a, b) => b.priority - a.priority);
        
        // Apply difficulty-based selection
        return this.selectActionByDifficulty(candidates);
    }
    
    /**
     * Select action based on difficulty (accuracy, mistakes)
     */
    selectActionByDifficulty(candidates) {
        const accuracy = this.config.getAccuracy();
        
        // Check for intentional mistake (human-like imperfection)
        if (Math.random() > accuracy) {
            // Make a suboptimal choice
            const suboptimalIndex = Math.min(
                Math.floor(Math.random() * 3),
                candidates.length - 1
            );
            const chosen = candidates[suboptimalIndex];
            console.log(`[BotCore] Suboptimal choice (difficulty): ${chosen.reason}`);
            return chosen;
        }
        
        // Optimal choice
        return candidates[0];
    }
    
    // ==================== ACTION EXECUTION ====================
    
    /**
     * Execute an action
     */
    execute(action) {
        const logPrefix = `[BotCore] ${action.layer?.toUpperCase() || 'ACTION'}`;
        
        if (action.type === 'power') {
            console.log(`${logPrefix}: POWER ${action.power} (priority: ${action.priority}) - ${action.reason}`);
        } else {
            console.log(`${logPrefix}: ${action.type} (${action.x},${action.y}) - ${action.reason}`);
        }
        
        switch (action.type) {
            case 'reveal':
                this.executeReveal(action);
                break;
                
            case 'flag':
                this.executeFlag(action);
                break;
                
            case 'unflag':
                this.executeUnflag(action);
                break;
                
            case 'power':
                this.executePower(action);
                break;
        }
        
        // Record move for learning
        this.recordMove(action);
    }
    
    /**
     * Execute a reveal action
     */
    executeReveal(action) {
        const result = this.game?.makeBotMove?.(action.x, action.y);
        this.gameState.movesThisGame++;
        
        if (result?.hitMine) {
            this.gameState.minesHit++;
            this.learningSystem.recordMistake({
                type: 'mine_hit',
                x: action.x,
                y: action.y,
                risk: action.risk || 0,
                layer: action.layer
            });
        } else {
            this.learningSystem.recordSuccess({
                type: 'safe_reveal',
                x: action.x,
                y: action.y,
                layer: action.layer
            });
        }
    }
    
    /**
     * Execute a flag action
     */
    executeFlag(action) {
        this.game?.makeBotFlag?.(action.x, action.y);
        this.visibleState.flaggedCells.add(`${action.x},${action.y}`);
        
        // Remove from pending radar flags
        this.visibleState.pendingRadarFlags = 
            this.visibleState.pendingRadarFlags.filter(
                p => !(p.x === action.x && p.y === action.y)
            );
        
        this.gameState.correctFlags++; // Assume correct, validate later
    }
    
    /**
     * Execute an unflag action
     */
    executeUnflag(action) {
        const key = `${action.x},${action.y}`;
        
        this.game?.makeBotUnflag?.(action.x, action.y);
        this.visibleState.flaggedCells.delete(key);
        
        // Cooldown ekle - bu hücreyi bir süre tekrar bayraklama
        this.visibleState.recentlyUnflagged.add(key);
        this.visibleState.unflagCooldown.set(key, Date.now());
        
        this.gameState.wrongFlags++; // Yanlış bayrak sayacı
        console.log(`[BotCore] Unflagged (${action.x},${action.y}) - added to cooldown`);
    }
    
    /**
     * Execute a power usage
     */
    executePower(action) {
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        const result = this.game?.useBotPower?.(action.power, costs[action.power]);
        
        if (result) {
            this.powerUsage[action.power]++;
            this.powerUsage.lastUseTime = Date.now();
            
            this.learningSystem.recordPowerUsage({
                power: action.power,
                gameState: { ...this.gameState },
                reason: action.reason
            });
            
            console.log(`[BotCore] Power used: ${action.power.toUpperCase()}`);
        } else {
            console.log(`[BotCore] Power FAILED: ${action.power} - useBotPower returned:`, result);
        }
    }
    
    /**
     * Try to use a smart power (called every think cycle)
     * FELSEFE: "En çok puanı alan kazanır - güçleri tasarruflu kullan!"
     * Returns true if power was used
     */
    tryRandomPowerUsage() {
        const costs = { freeze: 60, shield: 50, radar: 30, safeburst: 40 };
        
        // Cooldown kontrolü - son güç kullanımından beri geçen süre
        const timeSinceLastPower = Date.now() - this.powerUsage.lastUseTime;
        
        // Uzun cooldown - güçler arası en az 15 saniye
        const effectiveCooldown = this.powerUsage.lastUseTime === 0 ? 15000 : 15000;
        
        if (timeSinceLastPower < effectiveCooldown) {
            return false;
        }
        
        // Mevcut puanı al
        const myScore = this.game?.opponentScore || 0;
        const opponentScore = this.game?.score || 0;
        const scoreDiff = myScore - opponentScore;
        
        // Toplam güç kullanım limiti - maç başına max 2-3 güç
        const totalPowerUsed = (this.powerUsage.freeze || 0) + 
                               (this.powerUsage.shield || 0) + 
                               (this.powerUsage.radar || 0) + 
                               (this.powerUsage.safeburst || 0);
        if (totalPowerUsed >= 3) {
            return false;
        }
        
        // AKILLI KARAR: Sadece gerçekten gerektiğinde güç kullan
        // Puan kaybetmek istemiyoruz - güç kullanmak puan kaybettirir!
        
        // Durum 1: Çok gerideyiz ve kritik/late faz - FREEZE veya SAFEBURST mantıklı
        const isBehind = scoreDiff < -30;
        const isCriticalPhase = this.gameState.phase === 'critical' || this.gameState.phase === 'late';
        
        // Durum 2: Çok öndeyiz ve oyun sonuna yaklaşıyor - SHIELD mantıklı
        const isAhead = scoreDiff > 50;
        
        // Durum 3: Güvenli hamle yok ve sıkıştık - RADAR mantıklı
        const safeCells = this.deterministicLayer.findSafeCells();
        const isStuck = safeCells.length === 0;
        
        // Sadece bu durumlardan biri varsa güç kullanmayı düşün
        const shouldConsiderPower = (isBehind && isCriticalPhase) || 
                                    (isAhead && isCriticalPhase) || 
                                    (isStuck && this.gameState.phase !== 'early');
        
        if (!shouldConsiderPower) {
            return false;
        }
        
        // Bu durumda bile sadece %30 şansla güç kullan
        if (Math.random() > 0.30) {
            return false;
        }
        
        // Minimum puan eşiği - güç kullandıktan sonra yeterli puan kalmalı
        const minScoreForPower = 100; // En az 100 puan olmalı
        if (myScore < minScoreForPower) {
            return false;
        }
        
        // Son kullanılan gücü takip et - aynı gücü üst üste kullanma
        const lastPower = this.powerUsage.lastPowerUsed || null;
        
        // Duruma göre en mantıklı gücü seç
        let selectedPower = null;
        
        if (isBehind && isCriticalPhase) {
            // Gerideyiz - rakibi durdur veya hızlı puan al
            if (scoreDiff < -50) {
                selectedPower = lastPower !== 'safeburst' ? 'safeburst' : 'freeze';
            } else {
                selectedPower = lastPower !== 'freeze' ? 'freeze' : 'safeburst';
            }
        } else if (isAhead && isCriticalPhase) {
            // Öndeyiz - kendimizi koru
            selectedPower = 'shield';
        } else if (isStuck) {
            // Sıkıştık - mayın bul
            selectedPower = 'radar';
        }
        
        if (!selectedPower) {
            return false;
        }
        
        // Seçilen gücü kullanabilir miyiz kontrol et
        const cost = costs[selectedPower];
        const limit = this.config.getPowerLimit(selectedPower);
        const used = this.powerUsage[selectedPower] || 0;
        
        if (myScore < cost || used >= limit) {
            return false;
        }
        
        console.log(`[BotCore] 🎯 STRATEGIC POWER: ${selectedPower} (cost: ${cost}, score: ${myScore}, diff: ${scoreDiff}, reason: ${isBehind ? 'behind' : isAhead ? 'ahead' : 'stuck'})`);
        
        // Gücü kullan
        const result = this.game?.useBotPower?.(selectedPower, cost);
        
        if (result) {
            this.powerUsage[selectedPower]++;
            this.powerUsage.lastUseTime = Date.now();
            this.powerUsage.lastPowerUsed = selectedPower;
            console.log(`[BotCore] ✅ POWER SUCCESS: ${selectedPower.toUpperCase()}`);
            return true;
        } else {
            console.log(`[BotCore] ❌ POWER FAILED: ${selectedPower}`);
            return false;
        }
    }
    
    /**
     * Select the best power based on game situation
     */
    selectSmartPower(myScore, scoreDiff, lastPower, costs) {
        const availablePowers = [];
        
        // Her güç için uygunluk ve öncelik hesapla
        const powerPriorities = {
            freeze: 0,
            shield: 0,
            radar: 0,
            safeburst: 0
        };
        
        // Kullanılabilir güçleri kontrol et
        for (const power of Object.keys(costs)) {
            const cost = costs[power];
            const limit = this.config.getPowerLimit(power);
            const used = this.powerUsage[power] || 0;
            
            // Yeterli puan ve limit kontrolü
            if (myScore >= cost && used < limit) {
                availablePowers.push(power);
            }
        }
        
        if (availablePowers.length === 0) {
            return null;
        }
        
        // Son kullanılan gücü listeden çıkar (aynı gücü üst üste kullanma)
        const filteredPowers = availablePowers.filter(p => p !== lastPower);
        const powersToChoose = filteredPowers.length > 0 ? filteredPowers : availablePowers;
        
        // Duruma göre öncelik belirle
        for (const power of powersToChoose) {
            let priority = 10; // Base priority
            
            if (power === 'freeze') {
                // FREEZE: Çok güçlü - rakibi durdurmak için
                priority += 25; // Base bonus - freeze güçlü
                if (scoreDiff < -20) priority += 35;      // Çok gerideyiz - rakibi durdur
                else if (scoreDiff < 0) priority += 25;   // Biraz gerideyiz
                else if (scoreDiff < 30) priority += 20;  // Yakın veya biraz önde
                else priority += 15;                       // Çok öndeyiz - yine de faydalı
                // Oyun ortası/sonu daha değerli
                if (this.gameState.phase === 'mid') priority += 15;
                if (this.gameState.phase === 'late') priority += 25;
                if (this.gameState.phase === 'critical') priority += 35;
            }
            
            else if (power === 'shield') {
                // SHIELD: Öndeyken koruma, gerideyken risk alırken
                if (scoreDiff > 30) priority += 40;       // Çok öndeyiz - koru
                else if (scoreDiff > 10) priority += 25;  // Öndeyiz
                else if (scoreDiff < -20) priority += 20; // Gerideyiz, risk alacağız
                // Oyun sonu daha değerli
                if (this.gameState.phase === 'late') priority += 15;
                if (this.gameState.phase === 'critical') priority += 25;
            }
            
            else if (power === 'radar') {
                // RADAR: Sadece gerektiğinde - çok fazla kullanma
                priority += 5; // Düşük base bonus
                if (this.gameState.phase === 'early') priority += 15;
                // Güvenli hamle yoksa değerli
                const safeCells = this.deterministicLayer.findSafeCells();
                if (safeCells.length === 0) priority += 25;
                // Zaten çok radar kullandıysa önceliği düşür
                const radarUsed = this.powerUsage.radar || 0;
                if (radarUsed >= 2) priority -= 20;
            }
            
            else if (power === 'safeburst') {
                // SAFEBURST: Gerideyken puan kapmak için
                if (scoreDiff < -30) priority += 45;      // Çok gerideyiz
                else if (scoreDiff < -10) priority += 30; // Gerideyiz
                else if (scoreDiff < 10) priority += 15;  // Yakın maç
                // Oyun sonu acil puan lazım
                if (this.gameState.phase === 'late') priority += 20;
                if (this.gameState.phase === 'critical') priority += 35;
            }
            
            powerPriorities[power] = priority;
        }
        
        // En yüksek öncelikli gücü seç
        let bestPower = null;
        let bestPriority = 0;
        
        for (const power of powersToChoose) {
            if (powerPriorities[power] > bestPriority) {
                bestPriority = powerPriorities[power];
                bestPower = power;
            }
        }
        
        console.log(`[BotCore] Power priorities:`, powerPriorities);
        return bestPower;
    }
    
    /**
     * Record a move for learning
     */
    recordMove(action) {
        this.moveHistory.push({
            ...action,
            timestamp: Date.now(),
            gameState: { ...this.gameState }
        });
        
        // Keep last 100 moves
        if (this.moveHistory.length > 100) {
            this.moveHistory.shift();
        }
    }
    
    /**
     * Emergency action when stuck
     */
    emergencyAction() {
        console.log('[BotCore] Emergency action - finding any valid move');
        
        // Try corners first (statistically safer in Minesweeper)
        const corners = [
            { x: 0, y: 0 },
            { x: this.gridSize - 1, y: 0 },
            { x: 0, y: this.gridSize - 1 },
            { x: this.gridSize - 1, y: this.gridSize - 1 }
        ];
        
        for (const pos of corners) {
            const cell = this.board?.grid?.[pos.y]?.[pos.x];
            if (cell && !cell.isRevealed && !cell.isFlagged) {
                this.game?.makeBotMove?.(pos.x, pos.y);
                return;
            }
        }
        
        // Try edges
        for (let i = 0; i < this.gridSize; i++) {
            const edges = [
                { x: i, y: 0 },
                { x: i, y: this.gridSize - 1 },
                { x: 0, y: i },
                { x: this.gridSize - 1, y: i }
            ];
            
            for (const pos of edges) {
                const cell = this.board?.grid?.[pos.y]?.[pos.x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    this.game?.makeBotMove?.(pos.x, pos.y);
                    return;
                }
            }
        }
        
        // Last resort: any unrevealed cell
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const cell = this.board?.grid?.[y]?.[x];
                if (cell && !cell.isRevealed && !cell.isFlagged) {
                    this.game?.makeBotMove?.(x, y);
                    return;
                }
            }
        }
    }
    
    // ==================== EXTERNAL EVENTS ====================
    
    /**
     * Receive radar results (mines revealed by power)
     * This is FAIR because radar is a game mechanic
     */
    receiveRadarResults(mines) {
        if (!mines || mines.length === 0) return;
        
        console.log(`[BotCore] Radar revealed ${mines.length} mines`);
        
        for (const mine of mines) {
            const key = `${mine.x},${mine.y}`;
            this.visibleState.radarMines.add(key);
            
            // Add to pending flags
            const cell = this.board?.grid?.[mine.y]?.[mine.x];
            if (cell && !cell.isFlagged && !cell.isRevealed) {
                this.visibleState.pendingRadarFlags.push({ x: mine.x, y: mine.y });
            }
        }
    }
    
    /**
     * Watch player moves for learning
     */
    watchPlayerMove(moveData) {
        this.learningSystem.observePlayerMove(moveData);
        this.strategicLayer.updateOpponentAnalysis(moveData);
    }
    
    /**
     * Update player score for strategic decisions
     */
    updatePlayerScore(score) {
        this.gameState.opponentScore = score;
        this.gameState.scoreDiff = this.gameState.myScore - score;
        this.strategicLayer.updateOpponentScore(score);
    }
    
    /**
     * End game learning
     */
    endGame(result) {
        const gameData = {
            won: result.botWon,
            draw: result.draw,
            myScore: result.botScore,
            opponentScore: result.playerScore,
            moves: this.moveHistory,
            powerUsage: { ...this.powerUsage },
            duration: Date.now() - (this.game?.matchStartTime || Date.now()),
            difficulty: this.difficulty
        };
        
        this.learningSystem.endGame(gameData);
        
        const emoji = result.botWon ? '🏆' : (result.draw ? '🤝' : '💔');
        console.log(`[BotCore] Game ended ${emoji} | Score: ${result.botScore} vs ${result.playerScore}`);
    }
    
    // ==================== UTILITY ====================
    
    /**
     * Get neighbors of a cell
     */
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
}
