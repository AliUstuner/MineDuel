// MineDuel Auth Manager
// Handles authentication UI and state

class AuthManager {
    constructor() {
        this.api = window.api;
        this.currentUser = null;
        this.authListeners = [];
        this.init();
    }

    init() {
        // Check if user is already logged in
        if (this.api.isLoggedIn()) {
            this.currentUser = this.api.getUser();
            this.notifyListeners();
        }
        
        this.createAuthModal();
        this.updateAuthUI();
    }

    // Add listener for auth state changes
    onAuthChange(callback) {
        this.authListeners.push(callback);
        // Immediately call with current state
        callback(this.currentUser);
    }

    // Notify all listeners
    notifyListeners() {
        this.authListeners.forEach(callback => callback(this.currentUser));
    }

    // Create auth modal HTML
    createAuthModal() {
        const modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content auth-modal-content">
                <button class="modal-close" onclick="authManager.hideModal()">&times;</button>
                
                <div class="auth-tabs">
                    <button class="auth-tab active" data-tab="login">Giriş Yap</button>
                    <button class="auth-tab" data-tab="register">Kayıt Ol</button>
                </div>

                <!-- Login Form -->
                <form id="login-form" class="auth-form">
                    <h2>🎮 MineDuel'e Hoş Geldin!</h2>
                    <div class="form-group">
                        <label for="login-email">E-posta</label>
                        <input type="email" id="login-email" required placeholder="ornek@email.com">
                    </div>
                    <div class="form-group">
                        <label for="login-password">Şifre</label>
                        <input type="password" id="login-password" required placeholder="••••••••">
                    </div>
                    <div class="form-error hidden" id="login-error"></div>
                    <button type="submit" class="auth-btn primary">Giriş Yap</button>
                </form>

                <!-- Register Form -->
                <form id="register-form" class="auth-form hidden">
                    <h2>🚀 Yeni Hesap Oluştur</h2>
                    <div class="form-group">
                        <label for="register-username">Kullanıcı Adı</label>
                        <input type="text" id="register-username" required minlength="3" maxlength="20" placeholder="OyuncuAdi">
                    </div>
                    <div class="form-group">
                        <label for="register-email">E-posta</label>
                        <input type="email" id="register-email" required placeholder="ornek@email.com">
                    </div>
                    <div class="form-group">
                        <label for="register-password">Şifre</label>
                        <input type="password" id="register-password" required minlength="6" placeholder="En az 6 karakter">
                    </div>
                    <div class="form-group">
                        <label for="register-password-confirm">Şifre Tekrar</label>
                        <input type="password" id="register-password-confirm" required placeholder="Şifreyi tekrar girin">
                    </div>
                    <div class="form-error hidden" id="register-error"></div>
                    <button type="submit" class="auth-btn primary">Kayıt Ol</button>
                </form>

                <div class="auth-footer">
                    <p>Misafir olarak devam etmek için <button class="link-btn" onclick="authManager.hideModal()">buraya tıklayın</button></p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Login form
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // Register form
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });

        // Close on outside click
        document.getElementById('auth-modal').addEventListener('click', (e) => {
            if (e.target.id === 'auth-modal') {
                this.hideModal();
            }
        });
    }

    switchTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');

        // Update forms
        document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
        document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');

        // Clear errors
        document.querySelectorAll('.form-error').forEach(e => e.classList.add('hidden'));
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        const submitBtn = document.querySelector('#login-form button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Giriş yapılıyor...';
            errorDiv.classList.add('hidden');

            const data = await this.api.login(email, password);
            
            if (data.success) {
                this.currentUser = data.user;
                this.notifyListeners();
                this.hideModal();
                this.updateAuthUI();
                this.showNotification('Başarıyla giriş yapıldı! 🎉', 'success');
            }
        } catch (error) {
            errorDiv.textContent = error.message || 'Giriş başarısız!';
            errorDiv.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Giriş Yap';
        }
    }

    async handleRegister() {
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const passwordConfirm = document.getElementById('register-password-confirm').value;
        const errorDiv = document.getElementById('register-error');
        const submitBtn = document.querySelector('#register-form button[type="submit"]');

        // Validate passwords match
        if (password !== passwordConfirm) {
            errorDiv.textContent = 'Şifreler eşleşmiyor!';
            errorDiv.classList.remove('hidden');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Kayıt oluşturuluyor...';
            errorDiv.classList.add('hidden');

            const data = await this.api.register(email, password, username);
            
            if (data.success) {
                this.showNotification('Hesap oluşturuldu! Şimdi giriş yapın. 🎉', 'success');
                this.switchTab('login');
                document.getElementById('login-email').value = email;
            }
        } catch (error) {
            errorDiv.textContent = error.message || 'Kayıt başarısız!';
            errorDiv.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Kayıt Ol';
        }
    }

    async logout() {
        try {
            await this.api.logout();
            this.currentUser = null;
            this.notifyListeners();
            this.updateAuthUI();
            this.showNotification('Çıkış yapıldı', 'info');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    showModal() {
        document.getElementById('auth-modal').classList.remove('hidden');
    }

    hideModal() {
        document.getElementById('auth-modal').classList.add('hidden');
    }

    updateAuthUI() {
        const userSection = document.getElementById('user-section');
        if (!userSection) return;

        if (this.currentUser) {
            userSection.innerHTML = `
                <div class="user-info">
                    <span class="user-avatar">👤</span>
                    <span class="user-name">${this.currentUser.username}</span>
                    <button class="btn-small" onclick="authManager.showProfile()">Profil</button>
                    <button class="btn-small secondary" onclick="authManager.logout()">Çıkış</button>
                </div>
            `;
        } else {
            userSection.innerHTML = `
                <button class="btn-primary" onclick="authManager.showModal()">Giriş Yap / Kayıt Ol</button>
            `;
        }
    }

    async showProfile() {
        if (!this.currentUser) return;
        
        try {
            const data = await this.api.getProfile();
            this.showProfileModal(data);
        } catch (error) {
            console.error('Profile error:', error);
        }
    }

    showProfileModal(data) {
        const { profile, stats, recentGames } = data;
        
        let gamesHtml = '';
        if (recentGames && recentGames.length > 0) {
            gamesHtml = recentGames.map(game => {
                const isPlayer1 = game.player1?.id === this.currentUser.id;
                const isWinner = game.winner_id === this.currentUser.id;
                const result = game.winner_id === null ? 'draw' : (isWinner ? 'win' : 'loss');
                const resultText = result === 'win' ? '🏆 Kazandın' : (result === 'loss' ? '❌ Kaybettin' : '🤝 Berabere');
                const opponent = isPlayer1 ? game.player2?.username : game.player1?.username;
                const myScore = isPlayer1 ? game.player1_score : game.player2_score;
                const oppScore = isPlayer1 ? game.player2_score : game.player1_score;
                
                return `
                    <div class="game-history-item ${result}">
                        <span class="result">${resultText}</span>
                        <span class="opponent">vs ${opponent || 'Misafir'}</span>
                        <span class="score">${myScore} - ${oppScore}</span>
                        <span class="difficulty">${game.difficulty}</span>
                        <span class="date">${new Date(game.created_at).toLocaleDateString('tr-TR')}</span>
                    </div>
                `;
            }).join('');
        } else {
            gamesHtml = '<p class="no-games">Henüz oyun oynamadınız</p>';
        }

        const winRate = stats.total_games > 0 
            ? ((stats.wins / stats.total_games) * 100).toFixed(1) 
            : 0;

        const modal = document.createElement('div');
        modal.id = 'profile-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content profile-modal-content">
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                
                <div class="profile-header">
                    <div class="profile-avatar">👤</div>
                    <div class="profile-info">
                        <h2>${profile.username}</h2>
                        <p class="profile-email">${profile.email}</p>
                        <p class="profile-date">Katılım: ${new Date(profile.created_at).toLocaleDateString('tr-TR')}</p>
                    </div>
                </div>

                <div class="profile-stats">
                    <div class="stat-card">
                        <span class="stat-value">${stats.rating || 1000}</span>
                        <span class="stat-label">Rating</span>
                    </div>
                    <div class="stat-card win">
                        <span class="stat-value">${stats.wins || 0}</span>
                        <span class="stat-label">Galibiyet</span>
                    </div>
                    <div class="stat-card loss">
                        <span class="stat-value">${stats.losses || 0}</span>
                        <span class="stat-label">Mağlubiyet</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-value">${winRate}%</span>
                        <span class="stat-label">Kazanma Oranı</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-value">${stats.best_streak || 0}</span>
                        <span class="stat-label">En İyi Seri</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-value">${stats.total_games || 0}</span>
                        <span class="stat-label">Toplam Oyun</span>
                    </div>
                </div>

                <div class="profile-games">
                    <h3>📜 Son Oyunlar</h3>
                    <div class="games-list">
                        ${gamesHtml}
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        document.getElementById('profile-modal')?.remove();
        document.body.appendChild(modal);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">&times;</button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => notification.remove(), 5000);
    }
}

// Create global instance
window.authManager = new AuthManager();

export default AuthManager;
