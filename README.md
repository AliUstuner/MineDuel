# MineDuel - Competitive Minesweeper 🎮

A fast-paced 1v1 competitive Minesweeper game with special powers and strategic gameplay. Built for mobile browsers with a clean, modern interface.

## 🎯 Game Overview

MineDuel transforms classic Minesweeper into an exciting competitive experience where two players race to clear their boards while using special powers to gain advantages and sabotage their opponents.

### Core Features
- **Real-time competitive gameplay** - Both players play simultaneously
- **Power system** - Special abilities with energy costs and cooldowns
- **Mobile-optimized** - Vertical layout perfect for phones
- **Strategic depth** - Balance between speed and careful play
- **Clean UI** - Modern design with clear visual feedback

## 🏗️ Architecture

### Project Structure
```
MineDuel/
├── index.html          # Main HTML structure
├── styles.css          # Game styling and responsive design
└── js/
    ├── Cell.js         # Individual cell logic and state
    ├── BoardManager.js # Grid management and Minesweeper logic
    ├── PowerManager.js # Special abilities system
    ├── GameManager.js  # Game coordination and scoring
    └── main.js         # Entry point and initialization
```

### Class Hierarchy

1. **Cell** - Represents a single minesweeper cell
   - State management (mine, revealed, flagged, etc.)
   - Neighbor counting and display logic
   - Highlight effects for powers

2. **BoardManager** - Controls a minesweeper grid
   - Mine placement with first-click safety
   - Flood fill algorithm for empty cells
   - Canvas rendering and click handling
   - Power effects (radar highlights, board disable)

3. **PowerManager** - Special abilities system
   - Energy management and regeneration
   - Cooldown tracking
   - Power effects implementation
   - Visual feedback for power usage

4. **GameManager** - Overall game coordination
   - Two board management (player + opponent)
   - Scoring and match timer
   - AI opponent simulation
   - Win condition checking

## 🎮 Gameplay

### Basic Rules
- **Classic Minesweeper mechanics** - Numbers show adjacent mines, flood fill for zeros
- **First click safety** - First click and its neighbors are always safe
- **Scoring** - Points for revealing safe cells (more points for higher numbers)
- **Mine penalty** - Lose points when hitting mines (not game over)
- **Time limit** - 2-minute matches with highest score winning

### Power System

**Energy** - Gained by opening safe cells and regenerates over time

**Support Powers** (help yourself):
- 📡 **Radar Ping** (25 energy) - Highlights 3 random mine locations for 3 seconds
- 💥 **Safe Burst** (30 energy) - Auto-opens 2-3 guaranteed safe cells
- 🛡️ **Shield** (35 energy) - Blocks the next mine penalty

**Sabotage Powers** (affect opponent):
- ❄️ **Freeze** (40 energy) - Disables opponent's board for 8 seconds

## 🚀 Getting Started

### Running the Game
1. Open `index.html` in a modern web browser
2. The game will initialize automatically
3. Click "Start Playing!" to begin
4. Tap on your board (bottom) to start a match

### Development Setup
```bash
# Serve locally (recommended for development)
python -m http.server 8000
# or
npx serve .
# or use any local server
```

### Browser Compatibility
- Modern browsers with ES6 module support
- Mobile Safari, Chrome, Firefox
- Desktop Chrome, Firefox, Safari, Edge

## 🎨 UI Layout

### Mobile-First Vertical Design
```
┌─────────────────┐
│   Timer & Info  │ ← Match information
├─────────────────┤
│ Opponent Board  │ ← Smaller opponent view
│   (280x280px)   │
├─────────────────┤
│ Power Buttons   │ ← 4 special abilities
│  📡 💥 🛡️ ❄️   │
├─────────────────┤
│  Player Board   │ ← Main play area
│   (320x320px)   │ ← Touch-optimized
└─────────────────┘
```

## 🔧 Technical Implementation

### Canvas Rendering
- Responsive canvas sizing
- Efficient cell-by-cell rendering
- Touch/mouse event handling
- Visual effects for powers

### Game Loop
- RequestAnimationFrame for smooth updates
- Delta time calculations
- State synchronization between systems

### Power System
- Energy regeneration (5 energy/second)
- Cooldown management
- Effect timing and visual feedback
- Balance considerations

### AI Opponent
- Periodic move simulation (every 2 seconds)
- Configurable difficulty
- Random cell selection with bias potential

## 🎯 Balancing

### Energy Economics
- **Income**: 2 energy per point scored + 5 energy/second regen
- **Costs**: 25-40 energy per power
- **Strategy**: Balance offense (opening cells) vs defense (saving for powers)

### Power Balance
- **Radar**: Information advantage without solving the board
- **Safe Burst**: Progress boost but limited impact
- **Shield**: Risk mitigation for aggressive play
- **Freeze**: Tempo advantage but high cost

### Scoring System
- **Safe cells**: 1-9 points based on neighbor count
- **Flood fill**: 1 point per auto-revealed cell
- **Mine penalty**: -10 points (blockable with Shield)

## 🔮 Future Enhancements

### Networking
- Real multiplayer with WebRTC or WebSocket
- Matchmaking and ranked play
- Spectator mode

### Additional Powers
- **Fog** - Hide opponent's numbers temporarily
- **Expand Board** - Add temporary rows/columns
- **Mine Shift** - Relocate mines (balanced cost)
- **Time Warp** - Speed up/slow down timers

### Game Modes
- **Tournament brackets**
- **Custom board sizes**
- **Different time limits**
- **Power draft mode**

### Polish
- **Sound effects** and music
- **Particle effects** for power usage
- **Improved AI** with difficulty levels
- **Statistics tracking** and achievements

## 📱 Mobile Optimization

- Touch-friendly button sizes
- Responsive layout for various screen sizes
- Gesture support (long press for flags)
- Optimized performance for mobile browsers
- PWA potential (offline play, home screen install)

## 🏆 Competitive Aspects

### Skill Expression
- **Risk/reward** decision making
- **Resource management** (energy)
- **Timing** power usage
- **Board reading** efficiency

### Strategic Depth
- **Aggressive** vs **conservative** playstyles
- **Power usage** timing and coordination
- **Adaptation** to opponent behavior
- **End game** optimization for score

---

**Built with vanilla JavaScript, HTML5 Canvas, and CSS3. No frameworks required!**