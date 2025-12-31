/**
 * AudioManager.js - Sound effects and audio management for MineDuel
 * Handles all game audio including click sounds, power effects, and background music
 */

export class AudioManager {
    constructor() {
        this.enabled = true;
        this.volume = 0.5;
        
        // Audio context for web audio API
        this.audioContext = null;
        this.sounds = {};
        
        // Initialize audio system
        this.initializeAudio();
        this.createSounds();
    }

    /**
     * Initialize audio context
     */
    initializeAudio() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Handle audio context suspension (required by browsers)
            if (this.audioContext.state === 'suspended') {
                // Resume audio context on first user interaction
                const resumeAudio = () => {
                    if (this.audioContext.state === 'suspended') {
                        this.audioContext.resume();
                    }
                    document.removeEventListener('click', resumeAudio);
                    document.removeEventListener('touchstart', resumeAudio);
                };
                
                document.addEventListener('click', resumeAudio);
                document.addEventListener('touchstart', resumeAudio);
            }
        } catch (error) {
            console.warn('Audio not supported:', error);
            this.enabled = false;
        }
    }

    /**
     * Create sound effects using Web Audio API
     */
    createSounds() {
        if (!this.enabled || !this.audioContext) return;

        // Define sound parameters
        this.soundDefinitions = {
            cellClick: {
                frequency: 800,
                type: 'sine',
                duration: 0.1,
                volume: 0.3
            },
            cellReveal: {
                frequency: 1200,
                type: 'triangle',
                duration: 0.15,
                volume: 0.4
            },
            mineHit: {
                frequency: 150,
                type: 'sawtooth',
                duration: 0.3,
                volume: 0.6
            },
            powerActivate: {
                frequency: 1500,
                type: 'sine',
                duration: 0.2,
                volume: 0.5
            },
            scoreGain: {
                frequency: 1000,
                type: 'triangle',
                duration: 0.25,
                volume: 0.4
            },
            gameWin: {
                frequency: [523, 659, 783, 1046], // C, E, G, C (major chord)
                type: 'sine',
                duration: 0.8,
                volume: 0.5
            },
            gameLose: {
                frequency: [523, 494, 466, 440], // Descending notes
                type: 'triangle',
                duration: 0.6,
                volume: 0.4
            },
            energyRecharge: {
                frequency: 600,
                type: 'sine',
                duration: 0.1,
                volume: 0.2
            },
            powerReady: {
                frequency: 880,
                type: 'sine',
                duration: 0.15,
                volume: 0.3
            }
        };
    }

    /**
     * Play a sound effect
     * @param {string} soundName - Name of the sound to play
     * @param {number} volumeMultiplier - Optional volume multiplier
     */
    playSound(soundName, volumeMultiplier = 1) {
        if (!this.enabled || !this.audioContext || !this.soundDefinitions[soundName]) {
            return;
        }

        const soundDef = this.soundDefinitions[soundName];
        const now = this.audioContext.currentTime;

        try {
            if (Array.isArray(soundDef.frequency)) {
                // Play chord (multiple frequencies)
                soundDef.frequency.forEach((freq, index) => {
                    this.createAndPlayTone(freq, soundDef, now + index * 0.1, volumeMultiplier);
                });
            } else {
                // Play single tone
                this.createAndPlayTone(soundDef.frequency, soundDef, now, volumeMultiplier);
            }
        } catch (error) {
            console.warn('Error playing sound:', error);
        }
    }

    /**
     * Create and play a single tone
     * @param {number} frequency - Frequency in Hz
     * @param {object} soundDef - Sound definition object
     * @param {number} startTime - When to start the sound
     * @param {number} volumeMultiplier - Volume multiplier
     */
    createAndPlayTone(frequency, soundDef, startTime, volumeMultiplier) {
        // Create oscillator
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        // Configure oscillator
        oscillator.type = soundDef.type;
        oscillator.frequency.setValueAtTime(frequency, startTime);

        // Configure volume with envelope
        const volume = soundDef.volume * this.volume * volumeMultiplier;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01); // Quick attack
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + soundDef.duration); // Exponential decay

        // Connect audio nodes
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Start and stop
        oscillator.start(startTime);
        oscillator.stop(startTime + soundDef.duration);
    }

    /**
     * Play cell click sound
     */
    playCellClick() {
        this.playSound('cellClick');
    }

    /**
     * Play cell reveal sound
     * @param {number} neighborCount - Number of neighbors (affects pitch)
     */
    playCellReveal(neighborCount = 0) {
        // Higher pitch for higher numbers
        const pitchMultiplier = 1 + (neighborCount * 0.1);
        const soundDef = { ...this.soundDefinitions.cellReveal };
        soundDef.frequency *= pitchMultiplier;
        
        this.createAndPlayTone(soundDef.frequency, soundDef, this.audioContext.currentTime, 1);
    }

    /**
     * Play mine hit sound
     */
    playMineHit() {
        this.playSound('mineHit');
    }

    /**
     * Play power activation sound
     * @param {string} powerType - Type of power activated
     */
    playPowerActivate(powerType) {
        // Different pitches for different powers
        const powerPitches = {
            radar: 1.5,
            safeburst: 1.2,
            shield: 0.8,
            freeze: 0.6
        };
        
        const pitchMultiplier = powerPitches[powerType] || 1;
        const soundDef = { ...this.soundDefinitions.powerActivate };
        soundDef.frequency *= pitchMultiplier;
        
        this.createAndPlayTone(soundDef.frequency, soundDef, this.audioContext.currentTime, 1);
    }

    /**
     * Play score gain sound
     * @param {number} points - Points gained (affects volume)
     */
    playScoreGain(points) {
        const volumeMultiplier = Math.min(1.5, 0.5 + (points * 0.1));
        this.playSound('scoreGain', volumeMultiplier);
    }

    /**
     * Play game win/lose sound
     * @param {boolean} won - Whether the player won
     */
    playGameEnd(won) {
        this.playSound(won ? 'gameWin' : 'gameLose');
    }

    /**
     * Play energy recharge sound (subtle)
     */
    playEnergyRecharge() {
        this.playSound('energyRecharge');
    }

    /**
     * Play power ready sound
     */
    playPowerReady() {
        this.playSound('powerReady');
    }

    /**
     * Set master volume
     * @param {number} volume - Volume level (0-1)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Enable/disable audio
     * @param {boolean} enabled - Whether audio is enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        
        if (enabled && this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    /**
     * Get audio settings
     */
    getSettings() {
        return {
            enabled: this.enabled,
            volume: this.volume,
            contextState: this.audioContext ? this.audioContext.state : 'unavailable'
        };
    }

    /**
     * Play a sequence of sounds (for more complex effects)
     * @param {Array} sequence - Array of {sound, delay} objects
     */
    playSequence(sequence) {
        if (!this.enabled) return;

        let totalDelay = 0;
        sequence.forEach(({ sound, delay = 0, volume = 1 }) => {
            setTimeout(() => {
                this.playSound(sound, volume);
            }, totalDelay);
            totalDelay += delay;
        });
    }

    /**
     * Play combo effect for multiple reveals
     * @param {number} count - Number of cells revealed
     */
    playComboEffect(count) {
        if (count <= 1) return;

        const sequence = [];
        for (let i = 0; i < Math.min(count, 5); i++) {
            sequence.push({
                sound: 'cellReveal',
                delay: i * 50,
                volume: 0.3 + (i * 0.1)
            });
        }
        this.playSequence(sequence);
    }

    /**
     * Cleanup audio resources
     */
    destroy() {
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}