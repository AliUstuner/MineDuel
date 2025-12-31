/**
 * MineDuel Server - Real-Time Multiplayer WebSocket Server
 * Handles matchmaking, game state sync, and player communication
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game configuration per difficulty - different grid sizes!
const DIFFICULTY_CONFIG = {
    easy: { gridSize: 8, mineCount: 12, name: 'Easy' },
    medium: { gridSize: 10, mineCount: 20, name: 'Medium' },
    hard: { gridSize: 12, mineCount: 35, name: 'Hard' }
};

const MATCH_DURATION = 120000; // 2 minutes

// Store active games and waiting players per difficulty
const waitingPlayers = {
    easy: [],
    medium: [],
    hard: []
};
const activeGames = new Map();
const playerConnections = new Map();

// Power costs (in points)
const POWER_COSTS = {
    radar: 30,
    safeburst: 40,
    shield: 50,
    freeze: 60
};

// Scoring
const MINE_PENALTY = 30; // Points lost when hitting a mine

/**
 * Generate a minesweeper board
 */
function generateBoard(gridSize, mineCount, firstClickX = -1, firstClickY = -1) {
    const grid = [];
    
    // Initialize empty grid
    for (let y = 0; y < gridSize; y++) {
        grid[y] = [];
        for (let x = 0; x < gridSize; x++) {
            grid[y][x] = {
                x, y,
                isMine: false,
                isRevealed: false,
                isFlagged: false,
                neighborCount: 0
            };
        }
    }
    
    // Create safe positions (first click area)
    const safePositions = new Set();
    if (firstClickX >= 0 && firstClickY >= 0) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = firstClickX + dx;
                const ny = firstClickY + dy;
                if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                    safePositions.add(`${nx},${ny}`);
                }
            }
        }
    }
    
    // Place mines randomly
    let minesPlaced = 0;
    while (minesPlaced < mineCount) {
        const x = Math.floor(Math.random() * gridSize);
        const y = Math.floor(Math.random() * gridSize);
        
        if (!grid[y][x].isMine && !safePositions.has(`${x},${y}`)) {
            grid[y][x].isMine = true;
            minesPlaced++;
        }
    }
    
    // Calculate neighbor counts
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            if (!grid[y][x].isMine) {
                let count = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                            if (grid[ny][nx].isMine) count++;
                        }
                    }
                }
                grid[y][x].neighborCount = count;
            }
        }
    }
    
    return grid;
}

/**
 * Reveal cell with flood fill
 */
function revealCell(grid, gridSize, x, y) {
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) {
        return { hitMine: false, points: 0, cellsRevealed: 0, revealedCells: [] };
    }
    
    const cell = grid[y][x];
    if (cell.isRevealed || cell.isFlagged) {
        return { hitMine: false, points: 0, cellsRevealed: 0, revealedCells: [] };
    }
    
    cell.isRevealed = true;
    const revealedCells = [{ x, y, neighborCount: cell.neighborCount, isMine: cell.isMine }];
    
    if (cell.isMine) {
        return { hitMine: true, points: 0, cellsRevealed: 1, revealedCells };
    }
    
    // Simple scoring: Each cell = 5 points (same for empty or numbered)
    let points = 5;
    let cellsRevealed = 1;
    
    // Flood fill for empty cells
    if (cell.neighborCount === 0) {
        const queue = [{ x, y }];
        const visited = new Set([`${x},${y}`]);
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    const nx = current.x + dx;
                    const ny = current.y + dy;
                    const key = `${nx},${ny}`;
                    
                    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && !visited.has(key)) {
                        visited.add(key);
                        const neighbor = grid[ny][nx];
                        
                        if (!neighbor.isRevealed && !neighbor.isFlagged && !neighbor.isMine) {
                            neighbor.isRevealed = true;
                            cellsRevealed++;
                            // Each revealed cell = 5 points
                            points += 5;
                            revealedCells.push({ x: nx, y: ny, neighborCount: neighbor.neighborCount, isMine: false });
                            
                            if (neighbor.neighborCount === 0) {
                                queue.push({ x: nx, y: ny });
                            }
                        }
                    }
                }
            }
        }
    }
    
    return { hitMine: false, points, cellsRevealed, revealedCells };
}

/**
 * Calculate board completion percentage
 */
function getBoardCompletion(grid, gridSize) {
    let revealed = 0;
    let totalSafe = 0;
    
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            if (!grid[y][x].isMine) {
                totalSafe++;
                if (grid[y][x].isRevealed) revealed++;
            }
        }
    }
    
    return (revealed / totalSafe) * 100;
}

/**
 * Create a new game between two players
 */
function createGame(player1, player2, difficulty) {
    const gameId = uuidv4();
    const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
    
    const game = {
        id: gameId,
        difficulty,
        gridSize: config.gridSize,
        mineCount: config.mineCount,
        players: {
            [player1.id]: {
                id: player1.id,
                name: player1.name,
                ws: player1.ws,
                board: null, // Board created on first click
                score: 0,
                hasShield: false,
                isFrozen: false,
                frozenUntil: 0,
                boardInitialized: false
            },
            [player2.id]: {
                id: player2.id,
                name: player2.name,
                ws: player2.ws,
                board: null,
                score: 0,
                hasShield: false,
                isFrozen: false,
                frozenUntil: 0,
                boardInitialized: false
            }
        },
        playerIds: [player1.id, player2.id],
        startTime: Date.now(),
        duration: MATCH_DURATION,
        isActive: true,
        winner: null
    };
    
    activeGames.set(gameId, game);
    playerConnections.set(player1.id, { gameId, ws: player1.ws });
    playerConnections.set(player2.id, { gameId, ws: player2.ws });
    
    return game;
}

/**
 * End a game
 */
function endGame(gameId, reason = 'time') {
    const game = activeGames.get(gameId);
    if (!game || !game.isActive) return;
    
    game.isActive = false;
    
    // Determine winner
    const [p1Id, p2Id] = game.playerIds;
    const p1 = game.players[p1Id];
    const p2 = game.players[p2Id];
    
    let winner = null;
    let loser = null;
    
    if (p1.score > p2.score) {
        winner = p1;
        loser = p2;
    } else if (p2.score > p1.score) {
        winner = p2;
        loser = p1;
    }
    
    // Notify both players
    const endMessage = {
        type: 'gameEnd',
        reason,
        winner: winner ? { id: winner.id, name: winner.name, score: winner.score } : null,
        players: {
            [p1Id]: { name: p1.name, score: p1.score },
            [p2Id]: { name: p2.name, score: p2.score }
        },
        isDraw: winner === null
    };
    
    sendToPlayer(p1.ws, endMessage);
    sendToPlayer(p2.ws, endMessage);
    
    // Cleanup
    setTimeout(() => {
        activeGames.delete(gameId);
        playerConnections.delete(p1Id);
        playerConnections.delete(p2Id);
    }, 5000);
}

/**
 * Send message to player
 */
function sendToPlayer(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

/**
 * Get opponent ID
 */
function getOpponentId(game, playerId) {
    return game.playerIds.find(id => id !== playerId);
}

/**
 * Handle WebSocket connections
 */
wss.on('connection', (ws) => {
    const playerId = uuidv4();
    let playerName = 'Player';
    
    console.log(`Player connected: ${playerId}`);
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'findGame':
                    playerName = message.name || `Player${Math.floor(Math.random() * 1000)}`;
                    const difficulty = message.difficulty || 'medium';
                    handleFindGame(ws, playerId, playerName, difficulty);
                    break;
                    
                case 'cancelSearch':
                    handleCancelSearch(playerId);
                    break;
                    
                case 'cellClick':
                    handleCellClick(playerId, message.x, message.y);
                    break;
                    
                case 'toggleFlag':
                    handleToggleFlag(playerId, message.x, message.y);
                    break;
                    
                case 'usePower':
                    handleUsePower(playerId, message.power);
                    break;
                    
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log(`Player disconnected: ${playerId}`);
        
        // Remove from all waiting lists
        for (const diff of ['easy', 'medium', 'hard']) {
            const waitingIndex = waitingPlayers[diff].findIndex(p => p.id === playerId);
            if (waitingIndex !== -1) {
                waitingPlayers[diff].splice(waitingIndex, 1);
            }
        }
        
        // Handle disconnect during game
        const connection = playerConnections.get(playerId);
        if (connection) {
            const game = activeGames.get(connection.gameId);
            if (game && game.isActive) {
                const opponentId = getOpponentId(game, playerId);
                const opponent = game.players[opponentId];
                
                game.isActive = false;
                sendToPlayer(opponent.ws, {
                    type: 'opponentDisconnected',
                    message: 'Opponent disconnected. You win!'
                });
                
                endGame(connection.gameId, 'disconnect');
            }
        }
    });
    
    // Send connection confirmation
    ws.send(JSON.stringify({
        type: 'connected',
        playerId
    }));
});

/**
 * Handle find game request
 */
function handleFindGame(ws, playerId, playerName, difficulty) {
    // Check if already in a game
    if (playerConnections.has(playerId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Already in a game' }));
        return;
    }
    
    // Validate difficulty
    if (!DIFFICULTY_CONFIG[difficulty]) {
        difficulty = 'medium';
    }
    
    // Check if already waiting
    for (const diff of ['easy', 'medium', 'hard']) {
        const alreadyWaiting = waitingPlayers[diff].find(p => p.id === playerId);
        if (alreadyWaiting) return;
    }
    
    // If there's a waiting player with same difficulty, match them
    if (waitingPlayers[difficulty].length > 0) {
        const opponent = waitingPlayers[difficulty].shift();
        
        // Create game with difficulty
        const game = createGame(
            { id: opponent.id, name: opponent.name, ws: opponent.ws },
            { id: playerId, name: playerName, ws },
            difficulty
        );
        
        // Notify both players
        const gameStartMessage = (forPlayerId) => ({
            type: 'gameStart',
            gameId: game.id,
            playerId: forPlayerId,
            opponent: forPlayerId === playerId ? opponent.name : playerName,
            duration: MATCH_DURATION,
            gridSize: game.gridSize,
            mineCount: game.mineCount,
            difficulty: difficulty
        });
        
        sendToPlayer(opponent.ws, gameStartMessage(opponent.id));
        sendToPlayer(ws, gameStartMessage(playerId));
        
        // Start game timer
        setTimeout(() => {
            if (activeGames.has(game.id) && activeGames.get(game.id).isActive) {
                endGame(game.id, 'time');
            }
        }, MATCH_DURATION);
        
        console.log(`Game started: ${game.id} - ${opponent.name} vs ${playerName} [${difficulty.toUpperCase()}]`);
    } else {
        // Add to waiting list for this difficulty
        waitingPlayers[difficulty].push({ id: playerId, name: playerName, ws, joinedAt: Date.now() });
        
        ws.send(JSON.stringify({
            type: 'searching',
            message: 'Searching for opponent...',
            difficulty: difficulty,
            position: waitingPlayers[difficulty].length
        }));
        
        console.log(`Player waiting: ${playerName} (${playerId}) [${difficulty.toUpperCase()}]`);
    }
}

/**
 * Handle cancel search
 */
function handleCancelSearch(playerId) {
    for (const diff of ['easy', 'medium', 'hard']) {
        const index = waitingPlayers[diff].findIndex(p => p.id === playerId);
        if (index !== -1) {
            waitingPlayers[diff].splice(index, 1);
            console.log(`Player cancelled search: ${playerId}`);
            return;
        }
    }
}

/**
 * Handle toggle flag (right-click)
 */
function handleToggleFlag(playerId, x, y) {
    const connection = playerConnections.get(playerId);
    if (!connection) return;
    
    const game = activeGames.get(connection.gameId);
    if (!game || !game.isActive) return;
    
    const player = game.players[playerId];
    
    // Check if frozen
    if (player.isFrozen && Date.now() < player.frozenUntil) {
        sendToPlayer(player.ws, { type: 'frozen', remainingTime: player.frozenUntil - Date.now() });
        return;
    }
    
    // Initialize board if not initialized
    if (!player.boardInitialized) {
        player.board = generateBoard(game.gridSize, game.mineCount, -1, -1);
        player.boardInitialized = true;
    }
    
    // Check bounds
    if (x < 0 || x >= game.gridSize || y < 0 || y >= game.gridSize) return;
    
    const cell = player.board[y][x];
    
    // Can't flag revealed cells
    if (cell.isRevealed) return;
    
    // Toggle flag
    cell.isFlagged = !cell.isFlagged;
    
    // Confirm flag update to player
    sendToPlayer(player.ws, {
        type: 'flagUpdate',
        x,
        y,
        isFlagged: cell.isFlagged
    });
    
    // Send flag update to opponent so they can see the flag
    const opponentId = getOpponentId(game, playerId);
    const opponent = game.players[opponentId];
    sendToPlayer(opponent.ws, {
        type: 'opponentFlagUpdate',
        x,
        y,
        isFlagged: cell.isFlagged
    });
}

/**
 * Handle cell click
 */
function handleCellClick(playerId, x, y) {
    const connection = playerConnections.get(playerId);
    if (!connection) return;
    
    const game = activeGames.get(connection.gameId);
    if (!game || !game.isActive) return;
    
    const player = game.players[playerId];
    const opponentId = getOpponentId(game, playerId);
    const opponent = game.players[opponentId];
    
    // Check if frozen
    if (player.isFrozen && Date.now() < player.frozenUntil) {
        sendToPlayer(player.ws, { type: 'frozen', remainingTime: player.frozenUntil - Date.now() });
        return;
    }
    player.isFrozen = false;
    
    // Initialize board on first click
    if (!player.boardInitialized) {
        player.board = generateBoard(game.gridSize, game.mineCount, x, y);
        player.boardInitialized = true;
    }
    
    // Reveal cell
    const result = revealCell(player.board, game.gridSize, x, y);
    
    if (result.cellsRevealed === 0) return;
    
    if (result.hitMine) {
        // Mine hit - big penalty!
        let damage = MINE_PENALTY;
        if (player.hasShield) {
            damage = 0;
            player.hasShield = false;
            sendToPlayer(player.ws, { type: 'shieldUsed' });
        }
        player.score = Math.max(0, player.score - damage);
        
        sendToPlayer(player.ws, {
            type: 'cellResult',
            hitMine: true,
            damage,
            score: player.score,
            revealedCells: result.revealedCells
        });
    } else {
        // Safe cell - gain points!
        player.score += result.points;
        
        sendToPlayer(player.ws, {
            type: 'cellResult',
            hitMine: false,
            points: result.points,
            score: player.score,
            cellsRevealed: result.cellsRevealed,
            revealedCells: result.revealedCells
        });
    }
    
    // Send opponent update with revealed cells so opponent can see the board
    sendToPlayer(opponent.ws, {
        type: 'opponentUpdate',
        score: player.score,
        cellsRevealed: result.cellsRevealed,
        completion: getBoardCompletion(player.board, game.gridSize),
        revealedCells: result.revealedCells,
        hitMine: result.hitMine
    });
    
    // Check win condition (85% cleared - harder to finish)
    const completion = getBoardCompletion(player.board, game.gridSize);
    if (completion >= 85) {
        endGame(game.id, 'completion');
    }
}

/**
 * Handle power usage - NOW USES POINTS INSTEAD OF ENERGY
 */
function handleUsePower(playerId, power) {
    const connection = playerConnections.get(playerId);
    if (!connection) return;
    
    const game = activeGames.get(connection.gameId);
    if (!game || !game.isActive) return;
    
    const player = game.players[playerId];
    const opponentId = getOpponentId(game, playerId);
    const opponent = game.players[opponentId];
    
    // Power costs in POINTS
    const cost = POWER_COSTS[power];
    if (!cost || player.score < cost) {
        sendToPlayer(player.ws, { type: 'powerFailed', reason: 'Not enough points!' });
        return;
    }
    
    // Deduct points for using power
    player.score -= cost;
    
    switch (power) {
        case 'radar':
            // Find unrevealed AND unflagged mines only
            if (!player.board) {
                player.board = generateBoard(game.gridSize, game.mineCount);
                player.boardInitialized = true;
            }
            const mines = [];
            for (let y = 0; y < game.gridSize; y++) {
                for (let x = 0; x < game.gridSize; x++) {
                    // Only show mines that are NOT revealed AND NOT flagged
                    if (player.board[y][x].isMine && !player.board[y][x].isRevealed && !player.board[y][x].isFlagged) {
                        mines.push({ x, y });
                    }
                }
            }
            const highlightMines = mines.sort(() => Math.random() - 0.5).slice(0, 3);
            sendToPlayer(player.ws, {
                type: 'powerActivated',
                power: 'radar',
                score: player.score,
                mines: highlightMines
            });
            break;
            
        case 'safeburst':
            // Find safe cells and reveal them
            if (!player.board) {
                player.board = generateBoard(game.gridSize, game.mineCount);
                player.boardInitialized = true;
            }
            const safeCells = [];
            for (let y = 0; y < game.gridSize; y++) {
                for (let x = 0; x < game.gridSize; x++) {
                    const cell = player.board[y][x];
                    if (!cell.isMine && !cell.isRevealed && !cell.isFlagged) {
                        safeCells.push({ x, y });
                    }
                }
            }
            const cellsToReveal = safeCells.sort(() => Math.random() - 0.5).slice(0, 3);
            let totalPoints = 0;
            const revealed = [];
            
            for (const pos of cellsToReveal) {
                const result = revealCell(player.board, game.gridSize, pos.x, pos.y);
                totalPoints += result.points;
                revealed.push(...result.revealedCells);
            }
            
            player.score += totalPoints;
            sendToPlayer(player.ws, {
                type: 'powerActivated',
                power: 'safeburst',
                points: totalPoints,
                score: player.score,
                revealedCells: revealed
            });
            
            sendToPlayer(opponent.ws, {
                type: 'opponentUpdate',
                score: player.score
            });
            break;
            
        case 'shield':
            player.hasShield = true;
            sendToPlayer(player.ws, {
                type: 'powerActivated',
                power: 'shield',
                score: player.score
            });
            break;
            
        case 'freeze':
            opponent.isFrozen = true;
            opponent.frozenUntil = Date.now() + 5000; // 5 seconds freeze
            sendToPlayer(player.ws, {
                type: 'powerActivated',
                power: 'freeze',
                score: player.score
            });
            sendToPlayer(opponent.ws, {
                type: 'frozen',
                duration: 5000
            });
            break;
    }
    
    // Always send score update to opponent
    sendToPlayer(opponent.ws, {
        type: 'opponentUpdate',
        score: player.score
    });
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║     MineDuel Server Running!             ║
║     http://localhost:${PORT}               ║
║     Ready for multiplayer battles!       ║
╚══════════════════════════════════════════╝
    `);
});