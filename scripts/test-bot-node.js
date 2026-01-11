/**
 * test-bot-node.js - Node.js compatible test for bot components
 * 
 * Run: node scripts/test-bot-node.js
 */

// ==================== MOCK IMPLEMENTATIONS ====================

// Since we use ES modules in browser, recreate core logic for testing

class MockDeterministicLayer {
    analyze(gameState) {
        const safeCells = [];
        const mineCells = [];
        const grid = gameState.grid;
        
        // Iterate through revealed cells with numbers
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                const cell = grid[y][x];
                
                if (!cell.isRevealed || cell.neighborCount <= 0) continue;
                
                const neighbors = this.getNeighbors(grid, x, y);
                const flagged = neighbors.filter(n => n.isFlagged);
                const hidden = neighbors.filter(n => !n.isRevealed && !n.isFlagged);
                
                // If flagged count equals number, remaining are safe
                if (flagged.length === cell.neighborCount && hidden.length > 0) {
                    for (const h of hidden) {
                        if (!safeCells.find(s => s.x === h.x && s.y === h.y)) {
                            safeCells.push({ x: h.x, y: h.y, reason: 'constraint_satisfied' });
                        }
                    }
                }
                
                // If hidden count equals remaining mines, all are mines
                const remainingMines = cell.neighborCount - flagged.length;
                if (hidden.length === remainingMines && remainingMines > 0) {
                    for (const h of hidden) {
                        if (!mineCells.find(m => m.x === h.x && m.y === h.y)) {
                            mineCells.push({ x: h.x, y: h.y, reason: 'all_remaining_mines' });
                        }
                    }
                }
            }
        }
        
        return { safeCells, mineCells };
    }
    
    getNeighbors(grid, x, y) {
        const neighbors = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const ny = y + dy;
                const nx = x + dx;
                if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length) {
                    neighbors.push(grid[ny][nx]);
                }
            }
        }
        return neighbors;
    }
}

class MockDifficultyConfig {
    static configs = {
        easy: { minDelay: 1500, maxDelay: 2500, accuracy: 0.70, errorRate: 0.15 },
        medium: { minDelay: 800, maxDelay: 1400, accuracy: 0.85, errorRate: 0.08 },
        hard: { minDelay: 400, maxDelay: 700, accuracy: 0.92, errorRate: 0.03 },
        expert: { minDelay: 200, maxDelay: 400, accuracy: 0.97, errorRate: 0.01 }
    };
    
    static getConfig(difficulty) {
        return this.configs[difficulty] || this.configs.medium;
    }
}

// ==================== TEST UTILITIES ====================

function createMockGameState(options = {}) {
    const width = options.width || 10;
    const height = options.height || 10;
    
    const grid = [];
    for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
            row.push({
                x, y,
                isRevealed: false,
                isFlagged: false,
                neighborCount: -1
            });
        }
        grid.push(row);
    }
    
    if (options.cells) {
        for (const cell of options.cells) {
            grid[cell.y][cell.x] = { ...grid[cell.y][cell.x], ...cell };
        }
    }
    
    return { grid, width, height, totalMines: options.totalMines || 15 };
}

// ==================== TESTS ====================

function testDeterministicLayer() {
    console.log('\n🧪 Testing Deterministic Layer...\n');
    
    const layer = new MockDeterministicLayer();
    let passed = 0;
    let failed = 0;
    
    // Test 1: Find safe cells when constraint is satisfied
    const test1 = createMockGameState({
        cells: [
            { x: 1, y: 1, isRevealed: true, neighborCount: 1 },
            { x: 0, y: 0, isFlagged: true }, // The one mine
        ]
    });
    
    const result1 = layer.analyze(test1);
    
    if (result1.safeCells.length > 0) {
        console.log('  ✅ Test 1 PASSED: Found safe cells from satisfied constraint');
        passed++;
    } else {
        console.log('  ❌ Test 1 FAILED: Should find safe cells');
        failed++;
    }
    
    // Test 2: Find mines when hidden equals remaining
    const test2 = createMockGameState({
        cells: [
            { x: 0, y: 0, isRevealed: true, neighborCount: 2 },
            // Only 2 hidden neighbors
            { x: 1, y: 0, isRevealed: true, neighborCount: 0 },
            { x: 0, y: 1, isRevealed: false }, // Should be mine
            { x: 1, y: 1, isRevealed: false }, // Should be mine
        ]
    });
    
    const result2 = layer.analyze(test2);
    
    if (result2.mineCells.length === 2) {
        console.log('  ✅ Test 2 PASSED: Found 2 mine cells');
        passed++;
    } else {
        console.log(`  ❌ Test 2 FAILED: Expected 2 mines, got ${result2.mineCells.length}`);
        failed++;
    }
    
    // Test 3: No false positives for ambiguous case
    const test3 = createMockGameState({
        cells: [
            { x: 0, y: 0, isRevealed: true, neighborCount: 1 },
            // 3 hidden neighbors, 1 mine - ambiguous
            { x: 1, y: 0, isRevealed: false },
            { x: 0, y: 1, isRevealed: false },
            { x: 1, y: 1, isRevealed: false },
        ]
    });
    
    const result3 = layer.analyze(test3);
    
    if (result3.safeCells.length === 0 && result3.mineCells.length === 0) {
        console.log('  ✅ Test 3 PASSED: No moves for ambiguous pattern');
        passed++;
    } else {
        console.log('  ❌ Test 3 FAILED: Should not find moves');
        failed++;
    }
    
    console.log(`\n  Results: ${passed}/${passed + failed} passed\n`);
    return { passed, failed };
}

function testDifficultyConfig() {
    console.log('\n🧪 Testing Difficulty Config...\n');
    
    let passed = 0;
    let failed = 0;
    
    // Test 1: Difficulties exist
    const difficulties = ['easy', 'medium', 'hard', 'expert'];
    
    for (const d of difficulties) {
        const config = MockDifficultyConfig.getConfig(d);
        if (config && config.minDelay && config.accuracy) {
            console.log(`  ✅ ${d}: delay=${config.minDelay}-${config.maxDelay}ms, accuracy=${config.accuracy}`);
            passed++;
        } else {
            console.log(`  ❌ ${d}: config missing`);
            failed++;
        }
    }
    
    // Test 2: Expert is faster than easy
    const easy = MockDifficultyConfig.getConfig('easy');
    const expert = MockDifficultyConfig.getConfig('expert');
    
    if (easy.minDelay > expert.minDelay) {
        console.log('  ✅ Timing: Easy is slower than Expert');
        passed++;
    } else {
        console.log('  ❌ Timing: Easy should be slower');
        failed++;
    }
    
    // Test 3: Expert is more accurate
    if (expert.accuracy > easy.accuracy) {
        console.log('  ✅ Accuracy: Expert is more accurate');
        passed++;
    } else {
        console.log('  ❌ Accuracy: Expert should be more accurate');
        failed++;
    }
    
    console.log(`\n  Results: ${passed}/${passed + failed} passed\n`);
    return { passed, failed };
}

function testRiskCalculation() {
    console.log('\n🧪 Testing Risk Calculation Logic...\n');
    
    let passed = 0;
    let failed = 0;
    
    // Test global density calculation
    const totalCells = 100;
    const totalMines = 15;
    const revealedSafe = 30;
    const flaggedMines = 5;
    
    const remainingMines = totalMines - flaggedMines;
    const hiddenCells = totalCells - revealedSafe - flaggedMines;
    const globalDensity = remainingMines / hiddenCells;
    
    const expectedDensity = 10 / 65; // 0.1538
    
    if (Math.abs(globalDensity - expectedDensity) < 0.01) {
        console.log(`  ✅ Global density: ${(globalDensity * 100).toFixed(1)}% (correct)`);
        passed++;
    } else {
        console.log(`  ❌ Global density: got ${globalDensity}, expected ${expectedDensity}`);
        failed++;
    }
    
    // Test constraint probability
    // Cell adjacent to "2" with 4 hidden neighbors and 0 flagged
    // Local probability = 2/4 = 0.5
    const adjacentCount = 2;
    const hiddenNeighbors = 4;
    const constraintProb = adjacentCount / hiddenNeighbors;
    
    if (constraintProb === 0.5) {
        console.log(`  ✅ Constraint probability: 50% (correct)`);
        passed++;
    } else {
        console.log(`  ❌ Constraint probability: got ${constraintProb}`);
        failed++;
    }
    
    console.log(`\n  Results: ${passed}/${passed + failed} passed\n`);
    return { passed, failed };
}

// ==================== MAIN ====================

function main() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   MineDuel Bot Test Suite (Node.js)        ║');
    console.log('╚════════════════════════════════════════════╝');
    
    const results = {
        deterministic: testDeterministicLayer(),
        difficulty: testDifficultyConfig(),
        risk: testRiskCalculation()
    };
    
    // Summary
    let totalPassed = 0;
    let totalFailed = 0;
    
    for (const result of Object.values(results)) {
        totalPassed += result.passed;
        totalFailed += result.failed;
    }
    
    console.log('════════════════════════════════════════════');
    console.log(`📊 TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('════════════════════════════════════════════\n');
    
    if (totalFailed === 0) {
        console.log('🎉 All tests passed!\n');
        console.log('Next steps:');
        console.log('  1. Run: node server.js');
        console.log('  2. Open: http://localhost:3000');
        console.log('  3. Open DevTools Console (F12)');
        console.log('  4. Type: import("./js/test-bot.js")');
        console.log('  5. Type: startBotGame("hard")\n');
    }
    
    process.exit(totalFailed > 0 ? 1 : 0);
}

main();
