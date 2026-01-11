// API client for backend communication

const API = {
  sessionId: null,
  domain: null,

  setSession(id) {
    this.sessionId = id;
    localStorage.setItem('sessionId', id);
  },

  getSession() {
    if (!this.sessionId) {
      this.sessionId = localStorage.getItem('sessionId');
    }
    return this.sessionId;
  },

  setDomain(domain) {
    this.domain = domain;
    localStorage.setItem('takaroDomain', domain);
  },

  getDomain() {
    if (!this.domain) {
      this.domain = localStorage.getItem('takaroDomain');
    }
    return this.domain;
  },

  clearSession() {
    this.sessionId = null;
    this.domain = null;
    localStorage.removeItem('sessionId');
    localStorage.removeItem('takaroDomain');
  },

  async request(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.sessionId) {
      headers['X-Session-ID'] = this.sessionId;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include cookies for cookie mode auth
    });

    if (response.status === 401) {
      const data = await response.json().catch(() => ({}));

      // Handle cookie mode session expiration
      if (data.needsLogin && data.loginUrl) {
        if (confirm('Your session has expired. Would you like to log in again?')) {
          window.open(data.loginUrl, '_blank');
        }
      }

      this.clearSession();
      throw new Error(data.error || 'Session expired');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  },

  // Check auth status (for both service mode and cookie mode)
  async getAuthStatus() {
    const response = await fetch('/api/auth/status', {
      credentials: 'include', // Include cookies for cookie mode auth
    });
    return await response.json();
  },

  // Get available domains (for cookie mode domain selector)
  async getDomains() {
    const data = await this.request('/api/domains');
    return data;
  },

  // Select a domain (cookie mode only)
  async selectDomain(domainId) {
    return await this.request('/api/domains/select', {
      method: 'POST',
      body: JSON.stringify({ domainId }),
    });
  },

  // Game Servers
  async getGameServers() {
    const data = await this.request('/api/gameservers');
    return data.data || [];
  },

  async getMapInfo(gameServerId) {
    const data = await this.request(`/api/map-info/${gameServerId}`);
    return data.data;
  },

  // Map Tile URL (for Leaflet)
  getMapTileUrl(gameServerId) {
    return `/api/map/${gameServerId}/{z}/{x}/{y}.png`;
  },

  // Players - now returns ALL players (online and offline)
  async getPlayers(gameServerId) {
    const data = await this.request(`/api/players?gameServerId=${gameServerId}`);
    return data.data || [];
  },

  // Player Inventory History (from Takaro tracking API)
  async getPlayerInventory(playerId, startDate, endDate) {
    let url = `/api/inventory/${playerId}`;
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (params.toString()) url += `?${params.toString()}`;

    const data = await this.request(url);
    return data.data || [];
  },

  // Player Movement History (from Takaro tracking API)
  async getPlayerHistory(gameServerId, playerId, startDate, endDate) {
    let url = `/api/player-history/${gameServerId}/${playerId}`;
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (params.toString()) url += `?${params.toString()}`;

    const data = await this.request(url);
    return data.data || [];
  },

  // Movement Paths (for history/playback)
  async getMovementPaths(gameServerId, startDate, endDate) {
    let url = `/api/movement-paths?gameServerId=${gameServerId}`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

    const data = await this.request(url);
    return data.data || {};
  },

  // Area Search
  async getPlayersInBox(gameServerId, bounds, startDate, endDate) {
    const data = await this.request('/api/players/area/box', {
      method: 'POST',
      body: JSON.stringify({
        gameServerId,
        minX: bounds.minX,
        maxX: bounds.maxX,
        minY: -10000,
        maxY: 10000,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    });
    return data.data || [];
  },

  async getPlayersInRadius(gameServerId, center, radius, startDate, endDate) {
    const data = await this.request('/api/players/area/radius', {
      method: 'POST',
      body: JSON.stringify({
        gameServerId,
        x: center.x,
        y: 0,
        z: center.z,
        radius,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    });
    return data.data || [];
  },

  // Get all items for a game server (for dropdown)
  async getItems(gameServerId, search = null) {
    let url = `/api/items?gameServerId=${gameServerId}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const data = await this.request(url);
    return data.data || [];
  },

  // Item Search - find players who have/had a specific item
  async getPlayersByItem(itemId, startDate, endDate) {
    const data = await this.request('/api/players/item', {
      method: 'POST',
      body: JSON.stringify({
        itemId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    });
    return data.data || [];
  },
};

window.API = API;
