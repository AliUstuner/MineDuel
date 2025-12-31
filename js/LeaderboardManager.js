// MineDuel Leaderboard Manager
// Handles leaderboard UI and data

class LeaderboardManager {
    constructor() {
        this.api = window.api;
        this.currentType = 'rating';
        this.leaderboardData = [];
    }

    createLeaderboardModal() {
        const modal = document.createElement('div');
        modal.id = 'leaderboard-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content leaderboard-modal-content">
                <button class="modal-close" onclick="leaderboardManager.hideModal()">&times;</button>
                
                <h2>🏆 Liderlik Tablosu</h2>
                
                <div class="leaderboard-tabs">
                    <button class="lb-tab active" data-type="rating">Rating</button>
                    <button class="lb-tab" data-type="wins">Galibiyet</button>
                    <button class="lb-tab" data-type="streak">En İyi Seri</button>
                    <button class="lb-tab" data-type="score">Toplam Puan</button>
                </div>

                <div class="leaderboard-container">
                    <div id="leaderboard-loading" class="loading">Yükleniyor...</div>
                    <table id="leaderboard-table" class="hidden">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Oyuncu</th>
                                <th>Rating</th>
                                <th>G</th>
                                <th>M</th>
                                <th>Oran</th>
                            </tr>
                        </thead>
                        <tbody id="leaderboard-body">
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.querySelectorAll('.lb-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchType(tab.dataset.type));
        });

        // Close on outside click
        document.getElementById('leaderboard-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'leaderboard-modal') {
                this.hideModal();
            }
        });
    }

    async switchType(type) {
        this.currentType = type;
        
        // Update tab buttons
        document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.lb-tab[data-type="${type}"]`)?.classList.add('active');

        await this.loadLeaderboard();
    }

    async loadLeaderboard() {
        const loading = document.getElementById('leaderboard-loading');
        const table = document.getElementById('leaderboard-table');
        const tbody = document.getElementById('leaderboard-body');

        try {
            loading?.classList.remove('hidden');
            table?.classList.add('hidden');

            const data = await this.api.getLeaderboard(this.currentType, 50);
            this.leaderboardData = data.leaderboard || [];

            this.renderLeaderboard();

            loading?.classList.add('hidden');
            table?.classList.remove('hidden');
        } catch (error) {
            console.error('Leaderboard error:', error);
            if (loading) {
                loading.textContent = 'Yüklenirken hata oluştu';
            }
        }
    }

    renderLeaderboard() {
        const tbody = document.getElementById('leaderboard-body');
        if (!tbody) return;

        const currentUser = window.api?.getUser();

        tbody.innerHTML = this.leaderboardData.map(entry => {
            const winRate = entry.total_games > 0 
                ? ((entry.wins / entry.total_games) * 100).toFixed(0)
                : 0;
            
            const isCurrentUser = currentUser && entry.user_id === currentUser.id;
            const rankEmoji = entry.rank === 1 ? '🥇' : (entry.rank === 2 ? '🥈' : (entry.rank === 3 ? '🥉' : ''));
            
            return `
                <tr class="${isCurrentUser ? 'current-user' : ''}">
                    <td class="rank">${rankEmoji} ${entry.rank}</td>
                    <td class="player">
                        <span class="player-avatar">👤</span>
                        <span class="player-name">${entry.username}</span>
                    </td>
                    <td class="rating">${entry.rating}</td>
                    <td class="wins">${entry.wins}</td>
                    <td class="losses">${entry.losses}</td>
                    <td class="winrate">${winRate}%</td>
                </tr>
            `;
        }).join('');
    }

    async showModal() {
        if (!document.getElementById('leaderboard-modal')) {
            this.createLeaderboardModal();
        }
        
        document.getElementById('leaderboard-modal').classList.remove('hidden');
        await this.loadLeaderboard();
    }

    hideModal() {
        document.getElementById('leaderboard-modal')?.classList.add('hidden');
    }
}

// Create global instance
window.leaderboardManager = new LeaderboardManager();

export default LeaderboardManager;
