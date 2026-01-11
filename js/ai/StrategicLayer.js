/**
 * StrategicLayer.js - PvP Strategy and Power Management
 * 
 * This layer handles high-level strategic decisions:
 * - When to play fast vs safe
 * - When and how to use powers
 * - Adapting strategy based on opponent behavior
 * - Managing game phases (early, mid, late, critical)
 * 
 * @version 1.0
 */

export class StrategicLayer {
    constructor(botCore) {
        this.bot = botCore;
        
        // Current strategic mood
        this.mood = 'balanced'; // balanced, aggressive, defensive, desperate
        
        // Power scoring (0-100)
        this.powerScores = {
            freeze: 0,
            shield: 0,
            radar: 0,
            safeburst: 0
        };
        
        // Power costs
        this.powerCosts = {
            freeze: 60,
            shield: 50,
            radar: 30,
            safeburst: 40
        };
        
        // Opponent analysis
        this.opponentAnalysis = {
            scoreHistory: [],
            moveSpeed: 0,           // Average points per second
            isAggressive: false,
            isOnStreak: false,
            lastScore: 0,
            estimatedProgress: 0,
            skillLevel: 'unknown'   // beginner, intermediate, advanced, expert
        };
        
        // Strategy learning
        this.strategyStats = {
            aggressive: { used: 0, won: 0 },
            defensive: { used: 0, won: 0 },
            balanced: { used: 0, won: 0 }
        };
    }
    
    /**
     * Reset layer state
     */
    reset() {
        this.mood = 'balanced';
        this.powerScores = { freeze: 0, shield: 0, radar: 0, safeburst: 0 };
        this.opponentAnalysis = {
            scoreHistory: [],
            moveSpeed: 0,
            isAggressive: false,
            isOnStreak: false,
            lastScore: 0,
            estimatedProgress: 0,
            skillLevel: 'unknown'
        };
    }
    
    /**
     * Evaluate whether to use a power and which one
     * @returns {Object|null} Power action or null
     */
    evaluatePowerUsage() {
        const gs = this.bot.gameState;
        const config = this.bot.config;
        
        // Update mood based on game state
        this.updateMood();
        
        // Calculate power scores
        this.calculatePowerScores();
        
        // Check cooldown
        const timeSinceLastPower = Date.now() - this.bot.powerUsage.lastUseTime;
        if (timeSinceLastPower < config.getPowerCooldown()) {
            return null;
        }
        
        // Find best power
        let bestPower = null;
        let bestScore = 40; // Minimum threshold
        
        for (const [power, score] of Object.entries(this.powerScores)) {
            // Check usage limits
            if (this.bot.powerUsage[power] >= config.getPowerLimit(power)) {
                continue;
            }
            
            // Check if we have enough points
            if (gs.myScore < this.powerCosts[power]) {
                continue;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestPower = power;
            }
        }
        
        if (!bestPower) return null;
        
        // Power priority düşük olmalı - sadece başka seçenek yokken kullan
        // Reveal (100) ve Flag (90-95) her zaman önce gelmeli
        return {
            type: 'power',
            power: bestPower,
            priority: 50 + bestScore / 10,  // Max 60, reveal/flag'den düşük
            reason: `Strategic: ${bestPower} (score: ${bestScore.toFixed(0)})`,
            layer: 'strategic'
        };
    }
    
    /**
     * Update strategic mood based on game state
     */
    updateMood() {
        const gs = this.bot.gameState;
        const oa = this.opponentAnalysis;
        
        // Get learned best strategy
        const learnedStrategy = this.getLearnedBestStrategy();
        
        // Desperation: far behind in late game
        if (gs.scoreDiff < -60 && (gs.phase === 'late' || gs.phase === 'critical')) {
            this.mood = 'desperate';
            return;
        }
        
        // Aggressive: behind or opponent is fast
        if (gs.scoreDiff < -30 || oa.moveSpeed > 8 || oa.isOnStreak) {
            this.mood = 'aggressive';
            return;
        }
        
        // Defensive: ahead in late game
        if (gs.scoreDiff > 40 && gs.phase !== 'early') {
            this.mood = 'defensive';
            return;
        }
        
        // Use learned strategy if available
        if (learnedStrategy && this.strategyStats[learnedStrategy].used >= 3) {
            this.mood = learnedStrategy;
            return;
        }
        
        this.mood = 'balanced';
    }
    
    /**
     * Calculate scores for each power
     */
    calculatePowerScores() {
        const gs = this.bot.gameState;
        const oa = this.opponentAnalysis;
        const scores = this.powerScores;
        
        // Get learned power effectiveness
        const powerEff = this.bot.learningSystem.getPowerEffectiveness();
        
        // FREEZE: Stop opponent when they're doing well
        scores.freeze = 0;
        if (oa.moveSpeed > 5) scores.freeze += 40;
        if (gs.scoreDiff < -20) scores.freeze += 30;
        if (oa.isOnStreak) scores.freeze += 25;
        if (gs.phase === 'critical' && gs.scoreDiff < 0) scores.freeze += 25;
        scores.freeze += (powerEff.freeze - 0.5) * 40;
        
        // RADAR: Find mines when stuck
        scores.radar = 0;
        const hasSafeMoves = this.bot.deterministicLayer.findSafeCells().length > 0;
        if (!hasSafeMoves) scores.radar += 50;
        if (gs.phase === 'early') scores.radar += 25; // Good for early game setup
        if (gs.phase === 'mid') scores.radar += 15;
        scores.radar += (powerEff.radar - 0.5) * 40;
        
        // SAFEBURST: Quick points when behind
        scores.safeburst = 0;
        if (gs.scoreDiff < -25) scores.safeburst += 40;
        if (gs.urgency > 50) scores.safeburst += 30;
        if (gs.phase === 'late' || gs.phase === 'critical') scores.safeburst += 20;
        scores.safeburst += (powerEff.safeburst - 0.5) * 40;
        
        // SHIELD: Protection when ahead
        scores.shield = 0;
        if (gs.scoreDiff > 20) scores.shield += 35;
        if (gs.phase === 'late' || gs.phase === 'critical') scores.shield += 30;
        if (this.mood === 'aggressive') scores.shield += 20; // Taking risks, need protection
        scores.shield += (powerEff.shield - 0.5) * 40;
        
        // Cap all scores at 100
        for (const power of Object.keys(scores)) {
            scores[power] = Math.max(0, Math.min(100, scores[power]));
        }
    }
    
    /**
     * Update opponent analysis with new score
     */
    updateOpponentScore(score) {
        const oa = this.opponentAnalysis;
        const now = Date.now();
        
        // Track score history
        oa.scoreHistory.push({ score, time: now });
        if (oa.scoreHistory.length > 20) {
            oa.scoreHistory.shift();
        }
        
        // Calculate speed
        if (oa.scoreHistory.length >= 2) {
            const first = oa.scoreHistory[0];
            const last = oa.scoreHistory[oa.scoreHistory.length - 1];
            const timeDiff = (last.time - first.time) / 1000;
            if (timeDiff > 0) {
                oa.moveSpeed = last.score / timeDiff;
            }
        }
        
        // Check for streak
        const scoreGain = score - oa.lastScore;
        oa.isOnStreak = scoreGain > 20;
        oa.lastScore = score;
        
        // Estimate progress
        const mineCount = this.bot.game?.mineCount || 15;
        const totalSafe = (this.bot.gridSize * this.bot.gridSize) - mineCount;
        const avgPointsPerCell = 5;
        const estimatedCells = score / avgPointsPerCell;
        oa.estimatedProgress = Math.min(100, (estimatedCells / totalSafe) * 100);
    }
    
    /**
     * Update opponent analysis from watching their moves
     */
    updateOpponentAnalysis(moveData) {
        const oa = this.opponentAnalysis;
        
        // Analyze move speed
        if (moveData.moveTime) {
            // Fast moves indicate aggressive play
            if (moveData.moveTime < 1000) {
                oa.isAggressive = true;
            }
        }
        
        // Analyze move quality
        if (moveData.result === 'mine') {
            // Opponent hit a mine - they might be taking risks
            oa.isAggressive = true;
        }
        
        // Evaluate skill level over time
        this.evaluateOpponentSkill(moveData);
    }
    
    /**
     * Evaluate opponent skill level
     */
    evaluateOpponentSkill(moveData) {
        const oa = this.opponentAnalysis;
        
        // Simple skill assessment based on cascade frequency and mine hits
        let skillScore = 50;
        
        // Fast players are usually better
        if (oa.moveSpeed > 10) skillScore += 20;
        else if (oa.moveSpeed > 5) skillScore += 10;
        
        // Cascades indicate good opening choices
        if (moveData.cellsRevealed > 5) skillScore += 10;
        
        // Mine hits indicate risk-taking or inexperience
        if (moveData.result === 'mine') skillScore -= 10;
        
        // Update skill level
        if (skillScore >= 70) oa.skillLevel = 'expert';
        else if (skillScore >= 55) oa.skillLevel = 'advanced';
        else if (skillScore >= 40) oa.skillLevel = 'intermediate';
        else oa.skillLevel = 'beginner';
    }
    
    /**
     * Get the best strategy based on learning
     */
    getLearnedBestStrategy() {
        const stats = this.strategyStats;
        let best = null;
        let bestRate = 0;
        
        for (const [strategy, data] of Object.entries(stats)) {
            if (data.used >= 2) {
                const rate = data.won / data.used;
                if (rate > bestRate) {
                    bestRate = rate;
                    best = strategy;
                }
            }
        }
        
        return best;
    }
    
    /**
     * Record strategy used at game end
     */
    recordStrategyResult(won) {
        const strategy = this.mood === 'desperate' ? 'aggressive' : this.mood;
        
        if (this.strategyStats[strategy]) {
            this.strategyStats[strategy].used++;
            if (won) {
                this.strategyStats[strategy].won++;
            }
        }
    }
    
    /**
     * Get risk tolerance based on mood
     */
    getRiskTolerance() {
        switch (this.mood) {
            case 'desperate': return 0.55;
            case 'aggressive': return 0.45;
            case 'balanced': return 0.35;
            case 'defensive': return 0.25;
            default: return 0.35;
        }
    }
    
    /**
     * Decide whether to play faster or slower
     */
    getSpeedModifier() {
        const gs = this.bot.gameState;
        
        // Speed up when behind or in critical phase
        if (this.mood === 'desperate') return 0.6;
        if (this.mood === 'aggressive') return 0.8;
        if (gs.phase === 'critical' && gs.scoreDiff < 0) return 0.7;
        
        // Slow down when ahead
        if (this.mood === 'defensive') return 1.2;
        
        return 1.0;
    }
    
    /**
     * Get strategic report for debugging
     */
    getStrategicReport() {
        return {
            mood: this.mood,
            powerScores: { ...this.powerScores },
            opponent: { ...this.opponentAnalysis },
            riskTolerance: this.getRiskTolerance(),
            speedModifier: this.getSpeedModifier(),
            strategyStats: { ...this.strategyStats }
        };
    }
}
