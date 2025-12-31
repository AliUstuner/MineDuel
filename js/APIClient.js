// MineDuel API Client
// Handles all API calls to the backend

class APIClient {
    constructor() {
        this.baseUrl = window.location.origin;
        this.token = localStorage.getItem('mineduel_token');
        this.user = JSON.parse(localStorage.getItem('mineduel_user') || 'null');
    }

    // Set auth token
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('mineduel_token', token);
        } else {
            localStorage.removeItem('mineduel_token');
        }
    }

    // Set user data
    setUser(user) {
        this.user = user;
        if (user) {
            localStorage.setItem('mineduel_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('mineduel_user');
        }
    }

    // Get current user
    getUser() {
        return this.user;
    }

    // Check if logged in
    isLoggedIn() {
        return !!this.token && !!this.user;
    }

    // Make API request
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}/api${endpoint}`;
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // ==================== AUTH ====================

    async register(email, password, username) {
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, username })
        });
        return data;
    }

    async login(email, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (data.success) {
            this.setToken(data.session.access_token);
            this.setUser(data.user);
        }

        return data;
    }

    async logout() {
        try {
            await this.request('/auth/logout', { method: 'POST' });
        } finally {
            this.setToken(null);
            this.setUser(null);
        }
    }

    async getProfile() {
        return await this.request('/auth/profile', { method: 'GET' });
    }

    async updateProfile(updates) {
        return await this.request('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    // ==================== GAMES ====================

    async saveGame(gameData) {
        return await this.request('/games', {
            method: 'POST',
            body: JSON.stringify(gameData)
        });
    }

    async getGameHistory(userId = null, limit = 20, offset = 0) {
        let endpoint = `/games?limit=${limit}&offset=${offset}`;
        if (userId) {
            endpoint += `&user_id=${userId}`;
        }
        return await this.request(endpoint, { method: 'GET' });
    }

    // ==================== STATS ====================

    async getStats(userId) {
        return await this.request(`/stats?user_id=${userId}`, { method: 'GET' });
    }

    // ==================== LEADERBOARD ====================

    async getLeaderboard(type = 'rating', limit = 50) {
        return await this.request(`/leaderboard?type=${type}&limit=${limit}`, { method: 'GET' });
    }

    // ==================== MATCHMAKING ====================

    async joinMatchmaking(difficulty = 'medium') {
        return await this.request('/matchmaking', {
            method: 'POST',
            body: JSON.stringify({ difficulty })
        });
    }

    async checkMatchmaking() {
        return await this.request('/matchmaking', { method: 'GET' });
    }

    async leaveMatchmaking() {
        return await this.request('/matchmaking', { method: 'DELETE' });
    }
}

// Create global instance
window.api = new APIClient();

export default APIClient;
