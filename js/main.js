/**
 * main.js - Entry point for MineDuel
 * Initializes the game when the page loads
 */

import { GameManager } from './GameManager.js';

// Global game instance
let game = null;

/**
 * Initialize the game when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 MineDuel - Competitive Minesweeper');
    console.log('Loading game...');
    
    try {
        // Create game instance
        game = new GameManager();
        
        // Make game globally accessible for debugging and audio
        window.mineDuel = game;
        window.game = game;
        
        console.log('✅ Game initialized successfully!');
        console.log('📱 Optimized for mobile - tap to play!');
        console.log('🔊 Sound effects enabled - click speaker icon to toggle');
        
        // Setup audio controls
        setupAudioControls();
        
        // Show initial instructions
        showWelcomeMessage();
        
    } catch (error) {
        console.error('❌ Failed to initialize game:', error);
        showErrorMessage(error.message);
    }
});

/**
 * Setup audio control button
 */
function setupAudioControls() {
    const audioBtn = document.getElementById('toggle-audio');
    if (!audioBtn || !game?.audioManager) return;

    audioBtn.addEventListener('click', () => {
        const currentSettings = game.audioManager.getSettings();
        const newEnabled = !currentSettings.enabled;
        
        game.audioManager.setEnabled(newEnabled);
        
        // Update button appearance
        audioBtn.textContent = newEnabled ? '🔊' : '🔇';
        audioBtn.classList.toggle('muted', !newEnabled);
        
        // Play test sound if enabling
        if (newEnabled) {
            setTimeout(() => {
                game.audioManager.playPowerReady();
            }, 100);
        }
    });
}

/**
 * Show welcome message to player
 */
function showWelcomeMessage() {
    // Create welcome overlay
    const welcome = document.createElement('div');
    welcome.id = 'welcome-overlay';
    welcome.style.position = 'fixed';
    welcome.style.top = '0';
    welcome.style.left = '0';
    welcome.style.width = '100%';
    welcome.style.height = '100%';
    welcome.style.background = 'rgba(0, 0, 0, 0.8)';
    welcome.style.display = 'flex';
    welcome.style.flexDirection = 'column';
    welcome.style.justifyContent = 'center';
    welcome.style.alignItems = 'center';
    welcome.style.zIndex = '1001';
    welcome.style.color = 'white';
    welcome.style.textAlign = 'center';
    welcome.style.padding = '20px';

    welcome.innerHTML = `
        <div style="background: linear-gradient(135deg, #2a5298 0%, #1e3c72 100%); 
                    padding: 30px; border-radius: 15px; border: 3px solid rgba(255, 255, 255, 0.3);
                    max-width: 350px; animation: fadeInScale 0.5s ease-out;">
            <h2 style="color: #ffdd44; margin-bottom: 20px; font-size: 24px;">🎮 MineDuel</h2>
            <p style="margin-bottom: 15px; line-height: 1.4;">
                Competitive Minesweeper with special powers!
            </p>
            <div style="text-align: left; margin: 20px 0; font-size: 14px; line-height: 1.5;">
                <strong>🎯 How to Play:</strong><br>
                • Tap cells to reveal them<br>
                • Avoid mines, collect points<br>
                • Use powers strategically<br>
                • Beat your opponent's score!<br><br>
                
                <strong>⚡ Powers:</strong><br>
                📡 Radar - Reveal mine locations<br>
                💥 Burst - Auto-open safe cells<br>
                🛡️ Shield - Block mine damage<br>
                ❄️ Freeze - Disable opponent
            </div>
            <button id="start-game-btn" style="
                padding: 12px 24px; border: 2px solid #4ecdc4; border-radius: 8px;
                background: #4ecdc4; color: white; font-size: 16px; font-weight: bold;
                cursor: pointer; transition: all 0.3s ease;
            ">Start Playing!</button>
        </div>
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInScale {
            0% { opacity: 0; transform: scale(0.8); }
            100% { opacity: 1; transform: scale(1); }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(welcome);

    // Handle start button click
    const startBtn = document.getElementById('start-game-btn');
    startBtn.addEventListener('click', () => {
        welcome.remove();
    });

    // Handle hover effect for button
    startBtn.addEventListener('mouseenter', () => {
        startBtn.style.background = 'transparent';
        startBtn.style.color = '#4ecdc4';
    });
    
    startBtn.addEventListener('mouseleave', () => {
        startBtn.style.background = '#4ecdc4';
        startBtn.style.color = 'white';
    });
}

/**
 * Show error message if game fails to load
 */
function showErrorMessage(errorMsg) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '50%';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translate(-50%, -50%)';
    errorDiv.style.background = '#ff6b6b';
    errorDiv.style.color = 'white';
    errorDiv.style.padding = '20px';
    errorDiv.style.borderRadius = '10px';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.zIndex = '1000';
    errorDiv.innerHTML = `
        <h3>⚠️ Game Loading Error</h3>
        <p>${errorMsg}</p>
        <button onclick="window.location.reload()" style="
            margin-top: 10px; padding: 8px 16px; background: white; 
            color: #ff6b6b; border: none; border-radius: 5px; cursor: pointer;
        ">Reload Page</button>
    `;
    
    document.body.appendChild(errorDiv);
}

/**
 * Handle window beforeunload (cleanup)
 */
window.addEventListener('beforeunload', () => {
    if (game) {
        game.destroy();
    }
});

/**
 * Handle visibility change (pause/resume)
 */
document.addEventListener('visibilitychange', () => {
    if (game) {
        if (document.hidden) {
            // Page is now hidden - could pause game here
            console.log('Game paused (tab hidden)');
        } else {
            // Page is now visible - could resume game here
            console.log('Game resumed (tab visible)');
        }
    }
});

/**
 * Debug functions for development
 */
if (import.meta.env?.MODE === 'development' || window.location.hostname === 'localhost') {
    // Add some debug helpers
    window.debugMineDuel = {
        getGameStats: () => game?.getMatchStats(),
        addEnergy: (amount) => game?.powerManager?.addEnergy(amount),
        triggerPower: (powerName) => game?.powerManager?.usePower(powerName),
        endGame: () => game?.endMatch(true),
        resetGame: () => game?.startNewGame()
    };
    
    console.log('🔧 Debug mode enabled! Use window.debugMineDuel for testing.');
}

// Export game instance for potential module imports
export { game };