/**
 * PowerManager.js - Special powers system for MineDuel
 * Manages support and sabotage powers with energy costs and cooldowns
 */

export class PowerManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.audioManager = null; // Will be set by GameManager
        
        // Energy system
        this.maxEnergy = 100;
        this.energy = this.maxEnergy;
        this.energyRegenRate = 5; // Energy per second
        this.energyRegenInterval = null;

        // Power definitions
        this.powers = {
            // Support Powers (help yourself)
            radar: {
                name: 'Radar Ping',
                cost: 25,
                cooldown: 15000, // 15 seconds
                lastUsed: 0,
                description: 'Reveals 3 random mine locations for 3 seconds'
            },
            safeburst: {
                name: 'Safe Burst',
                cost: 30,
                cooldown: 20000, // 20 seconds
                lastUsed: 0,
                description: 'Auto-opens 2-3 safe cells'
            },
            shield: {
                name: 'Shield',
                cost: 35,
                cooldown: 30000, // 30 seconds
                lastUsed: 0,
                description: 'Ignore the next mine penalty'
            },
            
            // Sabotage Powers (affect opponent)
            freeze: {
                name: 'Freeze',
                cost: 40,
                cooldown: 25000, // 25 seconds
                lastUsed: 0,
                description: 'Freeze opponent board for 8 seconds'
            }
        };

        // Active effects
        this.activeShield = false;
        
        this.setupPowerButtons();
        this.startEnergyRegen();
    }

    /**
     * Setup power button event listeners
     */
    setupPowerButtons() {
        Object.keys(this.powers).forEach(powerKey => {
            const button = document.getElementById(powerKey.replace('burst', '-burst'));
            if (button) {
                button.addEventListener('click', () => this.usePower(powerKey));
            }
        });
    }

    /**
     * Start energy regeneration
     */
    startEnergyRegen() {
        this.energyRegenInterval = setInterval(() => {
            this.addEnergy(this.energyRegenRate);
            this.updateEnergyDisplay();
        }, 1000);
    }

    /**
     * Stop energy regeneration (for cleanup)
     */
    stopEnergyRegen() {
        if (this.energyRegenInterval) {
            clearInterval(this.energyRegenInterval);
            this.energyRegenInterval = null;
        }
    }

    /**
     * Add energy with bounds checking
     * @param {number} amount - Energy to add
     */
    addEnergy(amount) {
        this.energy = Math.min(this.maxEnergy, this.energy + amount);
    }

    /**
     * Use energy with bounds checking
     * @param {number} amount - Energy to consume
     * @returns {boolean} true if enough energy was available
     */
    useEnergy(amount) {
        if (this.energy >= amount) {
            this.energy -= amount;
            return true;
        }
        return false;
    }

    /**
     * Check if a power can be used
     * @param {string} powerKey - Power identifier
     * @returns {object} Object with canUse boolean and reason string
     */
    canUsePower(powerKey) {
        const power = this.powers[powerKey];
        if (!power) {
            return { canUse: false, reason: 'Unknown power' };
        }

        // Check energy
        if (this.energy < power.cost) {
            return { canUse: false, reason: `Need ${power.cost} energy` };
        }

        // Check cooldown
        const timeSinceLastUse = Date.now() - power.lastUsed;
        if (timeSinceLastUse < power.cooldown) {
            const remainingCooldown = Math.ceil((power.cooldown - timeSinceLastUse) / 1000);
            return { canUse: false, reason: `Cooldown: ${remainingCooldown}s` };
        }

        return { canUse: true, reason: 'Ready' };
    }

    /**
     * Use a power
     * @param {string} powerKey - Power identifier
     * @returns {boolean} true if power was successfully used
     */
    usePower(powerKey) {
        const canUse = this.canUsePower(powerKey);
        if (!canUse.canUse) {
            this.showPowerFeedback(powerKey, false, canUse.reason);
            return false;
        }

        const power = this.powers[powerKey];
        
        // Consume energy
        if (!this.useEnergy(power.cost)) {
            return false;
        }

        // Set cooldown
        power.lastUsed = Date.now();

        // Execute power effect
        let success = false;
        switch (powerKey) {
            case 'radar':
                success = this.useRadarPing();
                break;
            case 'safeburst':
                success = this.useSafeBurst();
                break;
            case 'shield':
                success = this.useShield();
                break;
            case 'freeze':
                success = this.useFreeze();
                break;
        }

        if (success) {
            this.showPowerFeedback(powerKey, true, 'Activated!');
            this.updatePowerButtons();
            this.updateEnergyDisplay();
            
            // Play power activation sound
            if (this.gameManager.audioManager) {
                this.gameManager.audioManager.playPowerActivate(powerKey);
            }
        }

        return success;
    }

    /**
     * Radar Ping Power - Highlight random mines
     */
    useRadarPing() {
        const playerBoard = this.gameManager.playerBoard;
        if (!playerBoard) return false;

        playerBoard.highlightRandomMines(3);
        
        // Add visual effect
        this.createPowerEffect('radar', '📡 Mines detected!');
        
        return true;
    }

    /**
     * Safe Burst Power - Auto-open safe cells
     */
    useSafeBurst() {
        const playerBoard = this.gameManager.playerBoard;
        if (!playerBoard) return false;

        const result = playerBoard.autoRevealSafeCells(3);
        
        if (result.cellsRevealed > 0) {
            // Award points to player
            this.gameManager.addPlayerScore(result.points);
            
            // Add visual effect
            this.createPowerEffect('safeburst', `💥 +${result.points} points!`);
            
            return true;
        }
        
        return false;
    }

    /**
     * Shield Power - Protect from next mine
     */
    useShield() {
        this.activeShield = true;
        
        // Add visual effect
        this.createPowerEffect('shield', '🛡️ Protected!');
        
        // Visual indicator on UI
        const playerSection = document.getElementById('player-section');
        playerSection.classList.add('shielded');
        
        return true;
    }

    /**
     * Freeze Power - Disable opponent board
     */
    useFreeze() {
        const opponentBoard = this.gameManager.opponentBoard;
        if (!opponentBoard) return false;

        opponentBoard.disableBoard(8000); // 8 seconds
        
        // Add visual effect
        this.createPowerEffect('freeze', '❄️ Opponent frozen!');
        
        return true;
    }

    /**
     * Check if shield protects from mine damage
     * @returns {boolean} true if shield absorbed the damage
     */
    useShield() {
        if (this.activeShield) {
            this.activeShield = false;
            
            // Remove visual indicator
            const playerSection = document.getElementById('player-section');
            playerSection.classList.remove('shielded');
            
            // Show shield break effect
            this.createPowerEffect('shield-break', '🛡️ Shield absorbed damage!');
            
            return true;
        }
        return false;
    }

    /**
     * Handle mine hit with potential shield protection
     * @param {number} damage - Damage amount
     * @returns {number} Actual damage after shield
     */
    handleMineHit(damage) {
        if (this.activeShield) {
            this.consumeShield();
            return 0; // Shield absorbed all damage
        }
        return damage;
    }

    /**
     * Consume active shield
     */
    consumeShield() {
        this.activeShield = false;
        
        // Remove visual indicator
        const playerSection = document.getElementById('player-section');
        if (playerSection) {
            playerSection.classList.remove('shielded');
        }
        
        // Show shield break effect
        this.createPowerEffect('shield-break', '🛡️ Shield absorbed damage!');
    }

    /**
     * Award energy for actions (opening safe cells)
     * @param {number} points - Points scored
     */
    awardEnergyForAction(points) {
        // Award energy based on points: 1 point = 2 energy
        const energyGained = Math.floor(points * 2);
        this.addEnergy(energyGained);
        this.updateEnergyDisplay();
    }

    /**
     * Update power button states
     */
    updatePowerButtons() {
        Object.keys(this.powers).forEach(powerKey => {
            const buttonId = powerKey === 'safeburst' ? 'safe-burst' : powerKey;
            const button = document.getElementById(buttonId);
            if (!button) return;

            const canUse = this.canUsePower(powerKey);
            const cooldownSpan = button.querySelector('.cooldown');
            
            if (canUse.canUse) {
                button.classList.remove('disabled');
                if (cooldownSpan) cooldownSpan.textContent = 'Ready';
            } else {
                button.classList.add('disabled');
                if (cooldownSpan) cooldownSpan.textContent = canUse.reason;
            }
        });
    }

    /**
     * Update energy display
     */
    updateEnergyDisplay() {
        const playerEnergyFill = document.getElementById('player-energy');
        if (playerEnergyFill) {
            const percentage = (this.energy / this.maxEnergy) * 100;
            playerEnergyFill.style.width = `${percentage}%`;
        }
    }

    /**
     * Create visual effect for power usage
     * @param {string} powerType - Type of power used
     * @param {string} message - Message to display
     */
    createPowerEffect(powerType, message) {
        const effect = document.createElement('div');
        effect.className = `power-effect ${powerType}`;
        effect.textContent = message;
        effect.style.position = 'fixed';
        effect.style.top = '50%';
        effect.style.left = '50%';
        effect.style.transform = 'translate(-50%, -50%)';
        effect.style.background = 'rgba(0, 0, 0, 0.8)';
        effect.style.color = 'white';
        effect.style.padding = '10px 20px';
        effect.style.borderRadius = '5px';
        effect.style.fontSize = '18px';
        effect.style.fontWeight = 'bold';
        effect.style.zIndex = '1000';
        effect.style.pointerEvents = 'none';
        effect.style.animation = 'powerEffect 2s ease-out forwards';

        // Add animation keyframes if not already added
        if (!document.querySelector('#power-effect-styles')) {
            const style = document.createElement('style');
            style.id = 'power-effect-styles';
            style.textContent = `
                @keyframes powerEffect {
                    0% { 
                        opacity: 0; 
                        transform: translate(-50%, -50%) scale(0.5); 
                    }
                    20% { 
                        opacity: 1; 
                        transform: translate(-50%, -50%) scale(1.1); 
                    }
                    100% { 
                        opacity: 0; 
                        transform: translate(-50%, -50%) scale(1) translateY(-30px); 
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(effect);

        // Remove effect after animation
        setTimeout(() => {
            if (effect.parentNode) {
                effect.parentNode.removeChild(effect);
            }
        }, 2000);
    }

    /**
     * Show feedback for power button press
     * @param {string} powerKey - Power identifier
     * @param {boolean} success - Whether power was successfully used
     * @param {string} message - Feedback message
     */
    showPowerFeedback(powerKey, success, message) {
        // This could trigger button animations, sounds, etc.
        console.log(`Power ${powerKey}: ${success ? 'SUCCESS' : 'FAILED'} - ${message}`);
    }

    /**
     * Update cooldown displays (call periodically)
     */
    updateCooldowns() {
        this.updatePowerButtons();
    }

    /**
     * Reset all powers and energy for new game
     */
    reset() {
        this.energy = this.maxEnergy;
        this.activeShield = false;
        
        // Reset all cooldowns
        Object.keys(this.powers).forEach(powerKey => {
            this.powers[powerKey].lastUsed = 0;
        });
        
        // Remove shield visual if present
        const playerSection = document.getElementById('player-section');
        if (playerSection) {
            playerSection.classList.remove('shielded');
        }
        
        this.updatePowerButtons();
        this.updateEnergyDisplay();
    }

    /**
     * Cleanup (call when destroying)
     */
    destroy() {
        this.stopEnergyRegen();
    }
}