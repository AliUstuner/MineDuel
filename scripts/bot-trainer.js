/**
 * bot-trainer.js - Offline Bot Training System
 * 
 * This script performs offline training of the bot by:
 * 1. Fetching recorded game data from the database
 * 2. Analyzing player decisions to learn patterns
 * 3. Updating pattern risk scores based on outcomes
 * 4. Generating improved decision weights
 * 
 * Usage:
 *   node scripts/bot-trainer.js
 *   node scripts/bot-trainer.js --analyze-only
 *   node scripts/bot-trainer.js --update-patterns
 * 
 * @version 1.0
 */

const https = require('https');
const http = require('http');

// Configuration
const CONFIG = {
    API_BASE: process.env.API_URL || 'http://localhost:3000',
    MIN_QUALITY: 0.5,
    BATCH_SIZE: 100,
    LEARNING_RATE: 0.1
};

// ==================== DATA FETCHING ====================

/**
 * Fetch training data from API
 */
async function fetchTrainingData() {
    console.log('📥 Fetching training data...');
    
    try {
        const response = await fetch(
            `${CONFIG.API_BASE}/api/ai-learning?training_data=true&min_quality=${CONFIG.MIN_QUALITY}&limit=${CONFIG.BATCH_SIZE}`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✅ Fetched ${data.count} game sessions`);
        return data.sessions;
        
    } catch (error) {
        console.error('❌ Failed to fetch training data:', error.message);
        return [];
    }
}

/**
 * Fetch current learning stats
 */
async function fetchLearningStats() {
    console.log('📊 Fetching learning stats...');
    
    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/ai-learning?stats=true`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
        
    } catch (error) {
        console.error('❌ Failed to fetch stats:', error.message);
        return null;
    }
}

// ==================== ANALYSIS ====================

/**
 * Analyze game sessions for patterns
 */
function analyzeGameSessions(sessions) {
    console.log('\n🔍 Analyzing game sessions...');
    
    const analysis = {
        totalGames: sessions.length,
        totalMoves: 0,
        botWins: 0,
        playerWins: 0,
        draws: 0,
        
        // Move layer distribution
        layers: {
            deterministic: 0,
            probabilistic: 0,
            strategic: 0,
            emergency: 0
        },
        
        // Outcome by layer
        layerSuccess: {
            deterministic: { total: 0, safe: 0 },
            probabilistic: { total: 0, safe: 0 },
            strategic: { total: 0, success: 0 },
            emergency: { total: 0, safe: 0 }
        },
        
        // Patterns
        patterns: new Map(), // neighborStateHash -> {mines, safe, total}
        
        // Phase performance
        phasePerformance: {
            early: { moves: 0, mines: 0 },
            mid: { moves: 0, mines: 0 },
            late: { moves: 0, mines: 0 },
            critical: { moves: 0, mines: 0 }
        },
        
        // Risk analysis
        riskBuckets: {} // 0.0-0.1, 0.1-0.2, etc.
    };
    
    // Initialize risk buckets
    for (let i = 0; i < 10; i++) {
        const key = `${(i/10).toFixed(1)}-${((i+1)/10).toFixed(1)}`;
        analysis.riskBuckets[key] = { total: 0, mines: 0 };
    }
    
    // Process each session
    for (const session of sessions) {
        // Count outcomes
        if (session.winner === 'bot') analysis.botWins++;
        else if (session.winner === 'player') analysis.playerWins++;
        else analysis.draws++;
        
        // Process moves
        const moves = session.ai_move_records || [];
        
        for (const move of moves) {
            if (move.player !== 'bot') continue;
            
            analysis.totalMoves++;
            
            // Layer distribution
            if (move.decision_layer) {
                analysis.layers[move.decision_layer] = 
                    (analysis.layers[move.decision_layer] || 0) + 1;
                
                // Track success by layer
                if (analysis.layerSuccess[move.decision_layer]) {
                    analysis.layerSuccess[move.decision_layer].total++;
                    if (move.result === 'safe' || move.result === 'cascade') {
                        analysis.layerSuccess[move.decision_layer].safe++;
                    } else if (move.move_type === 'power' && move.result === 'success') {
                        analysis.layerSuccess[move.decision_layer].success++;
                    }
                }
            }
            
            // Phase performance
            if (move.game_phase && analysis.phasePerformance[move.game_phase]) {
                analysis.phasePerformance[move.game_phase].moves++;
                if (move.result === 'mine') {
                    analysis.phasePerformance[move.game_phase].mines++;
                }
            }
            
            // Risk analysis
            if (move.risk_score !== null && move.risk_score !== undefined) {
                const bucket = Math.min(9, Math.floor(move.risk_score * 10));
                const key = `${(bucket/10).toFixed(1)}-${((bucket+1)/10).toFixed(1)}`;
                
                analysis.riskBuckets[key].total++;
                if (move.result === 'mine') {
                    analysis.riskBuckets[key].mines++;
                }
            }
        }
    }
    
    return analysis;
}

/**
 * Print analysis report
 */
function printAnalysisReport(analysis) {
    console.log('\n' + '='.repeat(60));
    console.log('📈 TRAINING ANALYSIS REPORT');
    console.log('='.repeat(60));
    
    // Overview
    console.log('\n📊 OVERVIEW');
    console.log(`   Total Games: ${analysis.totalGames}`);
    console.log(`   Total Bot Moves: ${analysis.totalMoves}`);
    console.log(`   Bot Wins: ${analysis.botWins} (${(analysis.botWins/analysis.totalGames*100).toFixed(1)}%)`);
    console.log(`   Player Wins: ${analysis.playerWins} (${(analysis.playerWins/analysis.totalGames*100).toFixed(1)}%)`);
    console.log(`   Draws: ${analysis.draws}`);
    
    // Layer distribution
    console.log('\n🎯 DECISION LAYER DISTRIBUTION');
    const totalLayerMoves = Object.values(analysis.layers).reduce((a, b) => a + b, 0);
    for (const [layer, count] of Object.entries(analysis.layers)) {
        const pct = totalLayerMoves > 0 ? (count / totalLayerMoves * 100).toFixed(1) : 0;
        console.log(`   ${layer}: ${count} moves (${pct}%)`);
    }
    
    // Layer success rates
    console.log('\n✅ LAYER SUCCESS RATES');
    for (const [layer, data] of Object.entries(analysis.layerSuccess)) {
        if (data.total > 0) {
            const successKey = layer === 'strategic' ? 'success' : 'safe';
            const successCount = data[successKey] || data.safe || 0;
            const rate = (successCount / data.total * 100).toFixed(1);
            console.log(`   ${layer}: ${rate}% (${successCount}/${data.total})`);
        }
    }
    
    // Phase performance
    console.log('\n⏱️ PHASE PERFORMANCE');
    for (const [phase, data] of Object.entries(analysis.phasePerformance)) {
        if (data.moves > 0) {
            const mineRate = (data.mines / data.moves * 100).toFixed(1);
            console.log(`   ${phase}: ${data.mines}/${data.moves} mine hits (${mineRate}%)`);
        }
    }
    
    // Risk calibration
    console.log('\n📉 RISK SCORE CALIBRATION');
    console.log('   (Predicted Risk → Actual Mine Rate)');
    for (const [bucket, data] of Object.entries(analysis.riskBuckets)) {
        if (data.total >= 5) { // Only show buckets with enough data
            const actualRate = (data.mines / data.total * 100).toFixed(1);
            const predicted = parseFloat(bucket.split('-')[0]) * 100;
            const diff = actualRate - predicted;
            const calibration = diff > 5 ? '⬆️ under' : diff < -5 ? '⬇️ over' : '✅';
            console.log(`   ${bucket}: ${actualRate}% actual (${calibration}estimated)`);
        }
    }
    
    console.log('\n' + '='.repeat(60));
}

// ==================== PATTERN LEARNING ====================

/**
 * Extract patterns from moves
 */
function extractPatterns(sessions) {
    console.log('\n🧠 Extracting patterns from moves...');
    
    const patterns = new Map();
    
    for (const session of sessions) {
        const moves = session.ai_move_records || [];
        
        for (const move of moves) {
            if (move.player !== 'bot' || !move.neighbor_state) continue;
            
            // Create pattern hash
            const hash = createPatternHash(move.neighbor_state);
            
            if (!patterns.has(hash)) {
                patterns.set(hash, {
                    hash,
                    neighborState: move.neighbor_state,
                    totalSeen: 0,
                    wasMine: 0,
                    wasSafe: 0
                });
            }
            
            const pattern = patterns.get(hash);
            pattern.totalSeen++;
            
            if (move.result === 'mine') {
                pattern.wasMine++;
            } else if (move.result === 'safe' || move.result === 'cascade') {
                pattern.wasSafe++;
            }
        }
    }
    
    // Calculate risk scores
    for (const pattern of patterns.values()) {
        if (pattern.totalSeen > 0) {
            pattern.riskScore = pattern.wasMine / pattern.totalSeen;
        }
    }
    
    console.log(`   Extracted ${patterns.size} unique patterns`);
    
    return patterns;
}

/**
 * Create a hash from neighbor state
 */
function createPatternHash(neighborState) {
    if (!neighborState) return 'unknown';
    
    const { revealedCount, flaggedCount, hiddenCount, numbers } = neighborState;
    const sortedNumbers = (numbers || []).sort().join(',');
    
    return `r${revealedCount || 0}_f${flaggedCount || 0}_h${hiddenCount || 0}_n${sortedNumbers}`;
}

/**
 * Update patterns in database
 */
async function updatePatterns(patterns) {
    console.log('\n📤 Updating patterns in database...');
    
    let updated = 0;
    let failed = 0;
    
    for (const pattern of patterns.values()) {
        if (pattern.totalSeen < 3) continue; // Skip rare patterns
        
        try {
            const response = await fetch(`${CONFIG.API_BASE}/api/ai-learning`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'pattern',
                    patternHash: pattern.hash,
                    neighborState: pattern.neighborState,
                    wasMine: pattern.wasMine > pattern.wasSafe
                })
            });
            
            if (response.ok) {
                updated++;
            } else {
                failed++;
            }
            
        } catch (error) {
            failed++;
        }
    }
    
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
}

// ==================== RECOMMENDATIONS ====================

/**
 * Generate training recommendations
 */
function generateRecommendations(analysis) {
    console.log('\n💡 RECOMMENDATIONS');
    console.log('-'.repeat(40));
    
    const recommendations = [];
    
    // Check layer balance
    const deterministicRatio = analysis.layers.deterministic / 
        Math.max(1, Object.values(analysis.layers).reduce((a, b) => a + b, 0));
    
    if (deterministicRatio < 0.5) {
        recommendations.push({
            type: 'improve',
            message: 'Increase deterministic layer usage - CSP solver may be missing patterns',
            priority: 'high'
        });
    }
    
    // Check emergency action rate
    const emergencyRatio = analysis.layers.emergency / analysis.totalMoves;
    if (emergencyRatio > 0.1) {
        recommendations.push({
            type: 'warning',
            message: `High emergency action rate (${(emergencyRatio*100).toFixed(1)}%) - bot is getting stuck often`,
            priority: 'high'
        });
    }
    
    // Check risk calibration
    for (const [bucket, data] of Object.entries(analysis.riskBuckets)) {
        if (data.total >= 10) {
            const predicted = parseFloat(bucket.split('-')[0]) + 0.05; // midpoint
            const actual = data.mines / data.total;
            
            if (actual > predicted * 1.5) {
                recommendations.push({
                    type: 'calibration',
                    message: `Risk bucket ${bucket} is underestimating danger (${(actual*100).toFixed(0)}% actual vs ${(predicted*100).toFixed(0)}% predicted)`,
                    priority: 'medium'
                });
            }
        }
    }
    
    // Check phase-specific performance
    const criticalMineRate = analysis.phasePerformance.critical.moves > 0 ?
        analysis.phasePerformance.critical.mines / analysis.phasePerformance.critical.moves : 0;
    
    if (criticalMineRate > 0.2) {
        recommendations.push({
            type: 'improve',
            message: 'High mine hit rate in critical phase - consider more defensive play when time is low',
            priority: 'medium'
        });
    }
    
    // Print recommendations
    if (recommendations.length === 0) {
        console.log('   ✅ No major issues detected!');
    } else {
        for (const rec of recommendations) {
            const icon = rec.priority === 'high' ? '🔴' : '🟡';
            console.log(`   ${icon} [${rec.type.toUpperCase()}] ${rec.message}`);
        }
    }
    
    return recommendations;
}

// ==================== MAIN ====================

async function main() {
    console.log('🤖 MineDuel Bot Trainer v1.0');
    console.log('='.repeat(60));
    
    const args = process.argv.slice(2);
    const analyzeOnly = args.includes('--analyze-only');
    const updatePatternsFlag = args.includes('--update-patterns');
    
    // Fetch current stats
    const stats = await fetchLearningStats();
    if (stats) {
        console.log(`\n📊 Current Global Stats:`);
        console.log(`   Total Games: ${stats.global?.totalGames || 0}`);
        console.log(`   Win Rate: ${stats.global?.winRate || 0}%`);
        console.log(`   Learned Patterns: ${stats.learning?.learnedPatterns || 0}`);
    }
    
    // Fetch training data
    const sessions = await fetchTrainingData();
    
    if (sessions.length === 0) {
        console.log('\n⚠️ No training data available. Play some games first!');
        return;
    }
    
    // Analyze sessions
    const analysis = analyzeGameSessions(sessions);
    printAnalysisReport(analysis);
    
    // Generate recommendations
    generateRecommendations(analysis);
    
    if (analyzeOnly) {
        console.log('\n📝 Analysis complete (--analyze-only mode)');
        return;
    }
    
    // Extract and update patterns
    if (updatePatternsFlag || !analyzeOnly) {
        const patterns = extractPatterns(sessions);
        
        // Show top dangerous patterns
        const dangerousPatterns = [...patterns.values()]
            .filter(p => p.totalSeen >= 5)
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 10);
        
        console.log('\n⚠️ TOP DANGEROUS PATTERNS');
        for (const p of dangerousPatterns) {
            console.log(`   ${p.hash}: ${(p.riskScore*100).toFixed(0)}% mine rate (${p.totalSeen} samples)`);
        }
        
        if (updatePatternsFlag) {
            await updatePatterns(patterns);
        }
    }
    
    console.log('\n✅ Training complete!');
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    fetchTrainingData,
    analyzeGameSessions,
    extractPatterns,
    generateRecommendations
};
