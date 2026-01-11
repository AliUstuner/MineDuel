/**
 * BotDifficultyConfig.js - Difficulty Scaling System
 * 
 * Configures bot behavior based on difficulty level:
 * - Reaction time (human-like delays)
 * - Accuracy (intentional mistakes)
 * - Power usage limits
 * - Risk tolerance
 * 
 * Human-like Behavior:
 * - Natural variation in timing
 * - Occasional suboptimal moves
 * - Realistic power cooldowns
 * 
 * @version 1.0
 */

export class BotDifficultyConfig {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.params = this.getDifficultyParams(difficulty);
    }
    
    /**
     * Get difficulty parameters
     */
    getDifficultyParams(difficulty) {
        const configs = {
            // EASY: Beginner-friendly bot
            // - Slow reactions
            // - Makes noticeable mistakes
            // - Limited power usage
            easy: {
                // Timing
                thinkTimeMin: 1500,    // Minimum delay between moves (ms)
                thinkTimeMax: 2500,    // Maximum delay between moves (ms)
                
                // Accuracy
                accuracy: 0.70,         // 70% chance of optimal move
                errorBias: 0.15,        // Extra probability of bad moves
                
                // Power limits
                powerCooldown: 30000,   // 30 seconds between powers
                powerLimits: {
                    freeze: 0,          // Can't freeze on easy
                    shield: 0,
                    radar: 1,
                    safeburst: 0
                },
                
                // Risk behavior
                riskTolerance: 0.25,    // Will take 25% risk moves
                
                // Strategy
                watchOpponent: 0.3,     // Only watches opponent 30% of time
                useLearning: false      // Doesn't use learned strategies
            },
            
            // MEDIUM: Balanced challenge
            // - Moderate speed
            // - Occasional mistakes
            // - Standard power usage
            medium: {
                thinkTimeMin: 800,
                thinkTimeMax: 1400,
                
                accuracy: 0.85,
                errorBias: 0.08,
                
                powerCooldown: 18000,
                powerLimits: {
                    freeze: 1,
                    shield: 1,
                    radar: 2,
                    safeburst: 1
                },
                
                riskTolerance: 0.32,
                
                watchOpponent: 0.6,
                useLearning: true
            },
            
            // HARD: Skilled opponent
            // - Fast reactions
            // - Rare mistakes
            // - Strategic power usage
            hard: {
                thinkTimeMin: 400,
                thinkTimeMax: 700,
                
                accuracy: 0.92,
                errorBias: 0.03,
                
                powerCooldown: 12000,
                powerLimits: {
                    freeze: 2,
                    shield: 2,
                    radar: 3,
                    safeburst: 2
                },
                
                riskTolerance: 0.38,
                
                watchOpponent: 0.9,
                useLearning: true
            },
            
            // EXPERT: Near-optimal play
            // - Very fast
            // - Almost no mistakes
            // - Full strategic power usage
            expert: {
                thinkTimeMin: 150,
                thinkTimeMax: 350,
                
                accuracy: 0.98,
                errorBias: 0.005,
                
                powerCooldown: 6000,
                powerLimits: {
                    freeze: 4,
                    shield: 4,
                    radar: 5,
                    safeburst: 4
                },
                
                riskTolerance: 0.50,
                
                watchOpponent: 1.0,
                useLearning: true,
                
                // Expert için ekstra özellikler
                useAdvancedPatterns: true,
                useGlobalAnalysis: true,
                preferCascades: true
            }
        };
        
        return configs[difficulty] || configs.medium;
    }
    
    /**
     * Get the full params object
     */
    getParams() {
        return { ...this.params };
    }
    
    /**
     * Get think delay with natural variation
     */
    getThinkDelay() {
        const { thinkTimeMin, thinkTimeMax } = this.params;
        
        // Add natural human-like variation
        // Use gaussian-like distribution (sum of uniforms)
        const r1 = Math.random();
        const r2 = Math.random();
        const normalish = (r1 + r2) / 2; // Tends toward middle
        
        const base = thinkTimeMin + normalish * (thinkTimeMax - thinkTimeMin);
        
        // Occasional pause (thinking hard)
        if (Math.random() < 0.1) {
            return base * 1.5;
        }
        
        // Occasional quick move (pattern recognition)
        if (Math.random() < 0.15) {
            return base * 0.7;
        }
        
        return base;
    }
    
    /**
     * Get accuracy (probability of optimal move)
     */
    getAccuracy() {
        return this.params.accuracy;
    }
    
    /**
     * Get error bias (extra probability of mistakes)
     */
    getErrorBias() {
        return this.params.errorBias;
    }
    
    /**
     * Get power cooldown
     */
    getPowerCooldown() {
        return this.params.powerCooldown;
    }
    
    /**
     * Get power usage limit
     */
    getPowerLimit(power) {
        return this.params.powerLimits[power] || 0;
    }
    
    /**
     * Get risk tolerance
     */
    getRiskTolerance() {
        return this.params.riskTolerance;
    }
    
    /**
     * Should watch opponent?
     */
    shouldWatchOpponent() {
        return Math.random() < this.params.watchOpponent;
    }
    
    /**
     * Should use learning?
     */
    shouldUseLearning() {
        return this.params.useLearning;
    }
    
    /**
     * Should make intentional error?
     * Used to simulate human imperfection
     */
    shouldMakeError() {
        return Math.random() < this.params.errorBias;
    }
    
    /**
     * Get a human-like score based on difficulty
     * Used to estimate expected performance
     */
    getExpectedScoreMultiplier() {
        switch (this.difficulty) {
            case 'easy': return 0.6;
            case 'medium': return 0.8;
            case 'hard': return 0.95;
            case 'expert': return 1.05;
            default: return 0.8;
        }
    }
    
    /**
     * Adjust parameters based on learning
     * @param {Object} learningData Learning data from global stats
     */
    adjustFromLearning(learningData) {
        if (!learningData || !this.params.useLearning) return;
        
        // Adjust risk tolerance based on win rate
        if (learningData.winRate !== undefined) {
            if (learningData.winRate < 0.3) {
                // Losing too much - play safer
                this.params.riskTolerance = Math.max(0.15, this.params.riskTolerance - 0.05);
            } else if (learningData.winRate > 0.7) {
                // Winning too much - can take more risks
                this.params.riskTolerance = Math.min(0.5, this.params.riskTolerance + 0.03);
            }
        }
        
        // Could adjust other params based on patterns
        // This creates a gradual improvement over time
    }
    
    /**
     * Get difficulty description
     */
    getDescription() {
        const descriptions = {
            easy: 'Beginner-friendly bot with slow reactions and occasional mistakes',
            medium: 'Balanced challenge with moderate speed and strategy',
            hard: 'Skilled opponent with fast reactions and strategic play',
            expert: 'Near-optimal play with advanced pattern recognition'
        };
        
        return descriptions[this.difficulty] || descriptions.medium;
    }
    
    /**
     * Compare to another difficulty
     */
    isHarderThan(otherDifficulty) {
        const order = ['easy', 'medium', 'hard', 'expert'];
        return order.indexOf(this.difficulty) > order.indexOf(otherDifficulty);
    }
}

/**
 * Factory function to create config
 */
export function createDifficultyConfig(difficulty) {
    return new BotDifficultyConfig(difficulty);
}
