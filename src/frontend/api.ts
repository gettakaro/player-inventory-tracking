// API client for backend communication

// Loading state tracking
let activeRequests = 0;

function updateLoadingIndicator(): void {
  const el = document.getElementById('loading-indicator');
  if (el) el.classList.toggle('active', activeRequests > 0);
}

import type {
  AreaSearchResult,
  AuthStatus,
  GameServer,
  InventoryItem,
  Item,
  ItemSearchResult,
  MapInfo,
  MovementPath,
  Player,
} from './types.js';

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

interface ErrorResponse {
  error?: string;
  needsLogin?: boolean;
  loginUrl?: string;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export const API = {
  sessionId: null as string | null,
  domain: null as string | null,

  setSession(id: string): void {
    this.sessionId = id;
    localStorage.setItem('sessionId', id);
  },

  getSession(): string | null {
    if (!this.sessionId) {
      this.sessionId = localStorage.getItem('sessionId');
    }
    return this.sessionId;
  },

  setDomain(domain: string): void {
    this.domain = domain;
    localStorage.setItem('takaroDomain', domain);
  },

  getDomain(): string | null {
    if (!this.domain) {
      this.domain = localStorage.getItem('takaroDomain');
    }
    return this.domain;
  },

  clearSession(): void {
    this.sessionId = null;
    this.domain = null;
    localStorage.removeItem('sessionId');
    localStorage.removeItem('takaroDomain');
  },

  async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    activeRequests++;
    updateLoadingIndicator();

    try {
      const headers: Record<string, string> = {
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
        const data = (await response.json().catch(() => ({}))) as ErrorResponse;

        // Handle cookie mode session expiration
        if (data.needsLogin && data.loginUrl) {
          if (confirm('Your session has expired. Would you like to log in again?')) {
            window.open(data.loginUrl, '_blank');
          }
        }

        this.clearSession();
        throw new Error(data.error || 'Session expired');
      }

      const data = (await response.json().catch(() => ({}))) as T | ErrorResponse;

      if (!response.ok) {
        throw new Error((data as ErrorResponse).error || 'Request failed');
      }

      return data as T;
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
      updateLoadingIndicator();
    }
  },

  // Check auth status (for both service mode and cookie mode)
  async getAuthStatus(): Promise<AuthStatus> {
    activeRequests++;
    updateLoadingIndicator();

    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include', // Include cookies for cookie mode auth
      });
      return await response.json();
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
      updateLoadingIndicator();
    }
  },

  // Get available domains (for cookie mode domain selector)
  async getDomains(): Promise<ApiResponse<Array<{ id: string; name: string }>>> {
    const data = await this.request<ApiResponse<Array<{ id: string; name: string }>>>('/api/domains');
    return data;
  },

  // Select a domain (cookie mode only)
  async selectDomain(domainId: string): Promise<ApiResponse<unknown>> {
    return await this.request<ApiResponse<unknown>>('/api/domains/select', {
      method: 'POST',
      body: JSON.stringify({ domainId }),
    });
  },

  // Game Servers
  async getGameServers(): Promise<GameServer[]> {
    const data = await this.request<ApiResponse<GameServer[]>>('/api/gameservers');
    return data.data || [];
  },

  async getMapInfo(gameServerId: string): Promise<MapInfo> {
    const data = await this.request<ApiResponse<MapInfo>>(`/api/map-info/${gameServerId}`);
    return data.data as MapInfo;
  },

  // Map Tile URL (for Leaflet)
  getMapTileUrl(gameServerId: string): string {
    return `/api/map/${gameServerId}/{z}/{x}/{y}.png`;
  },

  // Players - returns online players + offline players within date range (if provided)
  // Set loadAll=true to fetch ALL players (slow for large servers)
  async getPlayers(gameServerId: string, startDate?: string, endDate?: string, loadAll = false): Promise<Player[]> {
    let url = `/api/players?gameServerId=${gameServerId}`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
    if (loadAll) url += '&loadAll=true';
    const data = await this.request<ApiResponse<Player[]>>(url);
    return data.data || [];
  },

  // Player Inventory History (from Takaro tracking API)
  async getPlayerInventory(playerId: string, startDate?: string, endDate?: string): Promise<InventoryItem[]> {
    let url = `/api/inventory/${playerId}`;
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (params.toString()) url += `?${params.toString()}`;

    const data = await this.request<ApiResponse<InventoryItem[]>>(url);
    return data.data || [];
  },

  // Player Movement History (from Takaro tracking API)
  async getPlayerHistory(
    gameServerId: string,
    playerId: string,
    startDate?: string,
    endDate?: string
  ): Promise<MovementPath> {
    let url = `/api/player-history/${gameServerId}/${playerId}`;
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (params.toString()) url += `?${params.toString()}`;

    const data = await this.request<ApiResponse<MovementPath>>(url);
    return data.data as MovementPath;
  },

  // Movement Paths (for history/playback)
  async getMovementPaths(
    gameServerId: string,
    startDate?: string,
    endDate?: string
  ): Promise<Record<string, MovementPath>> {
    let url = `/api/movement-paths?gameServerId=${gameServerId}`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

    const data = await this.request<ApiResponse<Record<string, MovementPath>>>(url);
    return data.data || {};
  },

  // Area Search
  async getPlayersInBox(
    gameServerId: string,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    startDate?: string,
    endDate?: string
  ): Promise<AreaSearchResult[]> {
    const data = await this.request<ApiResponse<AreaSearchResult[]>>('/api/players/area/box', {
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

  async getPlayersInRadius(
    gameServerId: string,
    center: { x: number; z: number },
    radius: number,
    startDate?: string,
    endDate?: string
  ): Promise<AreaSearchResult[]> {
    const data = await this.request<ApiResponse<AreaSearchResult[]>>('/api/players/area/radius', {
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
  async getItems(gameServerId: string, search: string | null = null): Promise<Item[]> {
    let url = `/api/items?gameServerId=${gameServerId}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const data = await this.request<ApiResponse<Item[]>>(url);
    return data.data || [];
  },

  // Item Search - find players who have/had a specific item
  async getPlayersByItem(itemId: string, startDate?: string, endDate?: string): Promise<ItemSearchResult[]> {
    const data = await this.request<ApiResponse<ItemSearchResult[]>>('/api/players/item', {
      method: 'POST',
      body: JSON.stringify({
        itemId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    });
    return data.data || [];
  },

  // Give item to player
  async giveItem(
    gameServerId: string,
    playerId: string,
    itemName: string,
    amount: number,
    quality: string = '1'
  ): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/player/${playerId}/give-item`, {
      method: 'POST',
      body: JSON.stringify({ gameServerId, itemName, amount, quality }),
    });
  },

  // Add currency to player
  async addCurrency(
    gameServerId: string,
    playerId: string,
    currency: number
  ): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/player/${playerId}/add-currency`, {
      method: 'POST',
      body: JSON.stringify({ gameServerId, currency }),
    });
  },
};

window.API = API;
