import { cache, TTL } from './cache.js';

// Types for Takaro API responses
interface TakaroGameServer {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

interface TakaroPOG {
  id: string;
  playerId: string;
  player?: {
    name?: string;
    steamId?: string;
  };
  positionX: number | null;
  positionY: number | null;
  positionZ: number | null;
  ping?: number;
  currency?: number;
  playtimeSeconds?: number;
  lastSeen?: string;
  online?: boolean | number;
}

interface TakaroPlayer {
  id: string;
  name: string;
  steamId?: string;
  [key: string]: unknown;
}

interface TakaroMapInfo {
  mapSizeX?: number;
  maxZoom?: number;
  [key: string]: unknown;
}

interface TakaroItem {
  id: string;
  name: string;
  code?: string;
  [key: string]: unknown;
}

interface TakaroTrackingResult {
  playerId: string;
  playerName?: string;
  x: number;
  y: number;
  z: number;
  createdAt?: string;
  timestamp?: string;
  [key: string]: unknown;
}

interface MovementPoint {
  x: number;
  y: number;
  z: number;
  timestamp: string;
}

interface MovementPath {
  name: string;
  points: MovementPoint[];
}

interface NormalizedPlayer {
  id: string;
  playerId: string;
  name: string;
  steamId?: string;
  x: number | null;
  y: number | null;
  z: number | null;
  ping?: number;
  currency?: number;
  playtimeSeconds?: number;
  lastSeen?: string;
  online: boolean | number;
}

// Dynamic import for ES module SDK
let Client: new (options: {
  url: string;
  auth: { username?: string; password?: string };
  log: boolean;
}) => TakaroSDKClient;

interface TakaroSDKClient {
  login(): Promise<void>;
  setHeader(name: string, value: string): void;
  axiosInstance: {
    get(url: string, options?: { responseType?: string }): Promise<{ data: ArrayBuffer }>;
    defaults?: {
      headers?: {
        common?: {
          Cookie?: string;
        };
      };
    };
  };
  user: {
    userControllerMe(): Promise<{
      data: {
        data?: {
          domains?: Array<{ id: string; name: string }>;
        };
      };
    }>;
    userControllerSetSelectedDomain(domainId: string): Promise<void>;
  };
  gameserver: {
    gameServerControllerSearch(params: {
      filters?: { type?: string[] };
      sortBy?: string;
      sortDirection?: string;
      limit?: number;
    }): Promise<{ data: { data: TakaroGameServer[] } }>;
    gameServerControllerGetMapInfo(gameServerId: string): Promise<{
      data: { data: TakaroMapInfo };
    }>;
    gameServerControllerGiveItem(
      gameServerId: string,
      playerId: string,
      body: { name: string; amount: number; quality: string }
    ): Promise<{ data: unknown }>;
  };
  playerOnGameserver: {
    playerOnGameServerControllerSearch(params: {
      filters: { gameServerId: string[] };
      extend?: string[];
      sortBy?: string;
      sortDirection?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }): Promise<{
      data: {
        data: TakaroPOG[];
        meta?: { total?: number };
      };
    }>;
    playerOnGameServerControllerAddCurrency(
      gameServerId: string,
      playerId: string,
      body: { currency: number }
    ): Promise<{ data: unknown }>;
  };
  player: {
    playerControllerSearch(params: {
      filters?: { id?: string[] };
      sortBy?: string;
      sortDirection?: string;
      page?: number;
      limit?: number;
    }): Promise<{
      data: {
        data: TakaroPlayer[];
        meta?: { total?: number };
      };
    }>;
  };
  item: {
    itemControllerSearch(params: {
      filters?: { gameserverId?: string[] };
      search?: { name?: string[] };
      limit?: number;
    }): Promise<{
      data: { data: TakaroItem[] };
    }>;
  };
  tracking: {
    trackingControllerGetBoundingBoxPlayers(body: {
      gameserverId: string;
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
      startDate?: string;
      endDate?: string;
    }): Promise<{ data: { data: TakaroTrackingResult[] } }>;
    trackingControllerGetRadiusPlayers(body: {
      gameserverId: string;
      x: number;
      y: number;
      z: number;
      radius: number;
      startDate?: string;
      endDate?: string;
    }): Promise<{ data: { data: TakaroTrackingResult[] } }>;
    trackingControllerGetPlayerInventoryHistory(body: {
      playerId: string;
      startDate: string;
      endDate: string;
    }): Promise<{ data: { data: unknown[] } }>;
    trackingControllerGetPlayerMovementHistory(body: {
      playerId?: string[];
      startDate?: string;
      endDate?: string;
      limit?: number;
    }): Promise<{ data: { data: TakaroTrackingResult[] } }>;
    trackingControllerGetPlayersByItem(body: {
      itemId: string;
      startDate?: string;
      endDate?: string;
    }): Promise<{ data: { data: TakaroTrackingResult[] } }>;
  };
}

let serviceClient: TakaroSDKClient | null = null;
let operationMode: 'service' | 'cookie' | null = null;

// Detect which auth mode to use based on environment variables
function detectMode(): 'service' | 'cookie' {
  const hasEnvVars = process.env.TAKARO_USERNAME && process.env.TAKARO_PASSWORD && process.env.TAKARO_DOMAIN;
  operationMode = hasEnvVars ? 'service' : 'cookie';
  return operationMode;
}

// Get current operation mode
export function getOperationMode(): 'service' | 'cookie' | null {
  return operationMode;
}

// Check if running in cookie mode (production - no env vars)
export function isCookieMode(): boolean {
  return operationMode === 'cookie';
}

// Create a client that forwards cookies from the user's browser
export async function createCookieClient(
  cookies: Record<string, string>,
  domainId: string | null = null
): Promise<TakaroSDKClient> {
  const ClientClass = await getClientClass();
  const apiUrl = process.env.TAKARO_API_URL || 'https://api.takaro.io';

  const client = new ClientClass({
    url: apiUrl,
    auth: {}, // Empty auth - rely on cookies
    log: false,
  });

  // Forward all cookies from the incoming request
  if (cookies && Object.keys(cookies).length > 0) {
    const cookieHeader = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    client.setHeader('Cookie', cookieHeader);
  }

  // If domain specified and not in cookies, add it
  if (domainId && (!cookies || !cookies['takaro-domain'])) {
    const existingCookies = client.axiosInstance?.defaults?.headers?.common?.Cookie || '';
    const separator = existingCookies ? '; ' : '';
    client.setHeader('Cookie', `${existingCookies}${separator}takaro-domain=${domainId}`);
  }

  // If domain specified, call setSelectedDomain to scope API queries to that domain
  if (domainId) {
    try {
      await client.user.userControllerSetSelectedDomain(domainId);
    } catch (error) {
      console.warn('Failed to set selected domain:', error instanceof Error ? error.message : 'Unknown error');
      // Continue anyway - some queries might still work
    }
  }

  return client;
}

// Pagination helper - fetches all pages of paginated API results
async function fetchAllPaginated<T>(
  fetchFn: (page: number, limit: number) => Promise<{ data: { data: T[]; meta?: { total?: number } } }>,
  pageSize = 100,
  maxTotal = 10000
): Promise<T[]> {
  let allResults: T[] = [];
  let page = 0;
  let total: number | undefined;

  do {
    const response = await fetchFn(page, pageSize);
    const data = response.data.data || [];
    allResults = allResults.concat(data);

    total = response.data.meta?.total;
    page++;

    // Safety limit to prevent infinite loops
    if (allResults.length >= maxTotal) {
      console.log(`  ⚠️ Pagination hit max limit (${maxTotal}), stopping`);
      break;
    }
  } while (total && allResults.length < total);

  if (total && total > pageSize) {
    console.log(`  📄 Paginated fetch: ${allResults.length}/${total} results (${page} pages)`);
  }

  return allResults;
}

// Timing helper for API calls
function logApiCall(method: string, start: number, resultCount: number | null = null): void {
  const duration = Date.now() - start;
  const countStr = resultCount !== null ? ` (${resultCount} results)` : '';
  const emoji = duration > 2000 ? '🐢' : duration > 500 ? '⚠️' : '⚡';
  console.log(`  ${emoji} TAKARO API: ${method} - ${duration}ms${countStr}`);
}

async function getClientClass(): Promise<typeof Client> {
  if (!Client) {
    const sdk = await import('@takaro/apiclient');
    Client = sdk.Client as typeof Client;
  }
  return Client;
}

// Initialize service client at startup (like Takaro agent)
export async function initServiceClient(): Promise<TakaroSDKClient | null> {
  // Detect operation mode first
  detectMode();
  console.log(`Operation mode: ${operationMode}`);

  if (isCookieMode()) {
    console.log('Cookie mode active - relying on user session cookies from Takaro');
    console.log('Users must be logged into Takaro to use this app');
    return null;
  }

  const username = process.env.TAKARO_USERNAME;
  const password = process.env.TAKARO_PASSWORD;
  const domainName = process.env.TAKARO_DOMAIN;
  const apiUrl = process.env.TAKARO_API_URL || 'https://api.takaro.io';

  try {
    const ClientClass = await getClientClass();

    serviceClient = new ClientClass({
      url: apiUrl,
      auth: {
        username,
        password,
      },
      log: false,
    });

    console.log('Logging into Takaro as service account...');
    await serviceClient.login();

    // Get current user info which includes available domains
    const meResponse = await serviceClient.user.userControllerMe();
    const userDomains = meResponse.data.data?.domains || [];

    // Find the domain by name or ID (in case the env var contains an ID)
    const targetDomain = userDomains.find((d) => d.name === domainName || d.id === domainName);
    if (!targetDomain) {
      const availableDomains = userDomains.map((d) => `${d.name} (${d.id})`).join(', ');
      throw new Error(`Domain '${domainName}' not found. Available domains: ${availableDomains || 'none'}`);
    }

    const domainId = targetDomain.id;
    console.log(`Found domain ID: ${domainId}`);

    // Select the domain using the ID
    await serviceClient.user.userControllerSetSelectedDomain(domainId);

    // Manually set the domain cookie on the axios instance
    serviceClient.setHeader('Cookie', `takaro-domain=${domainId}`);

    console.log(`✓ Service client authenticated for domain: ${domainName} (${domainId})`);
    return serviceClient;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to initialize service client:', errorMessage);
    serviceClient = null;
    return null;
  }
}

// Get the service client (if initialized)
export function getServiceClient(): TakaroSDKClient | null {
  return serviceClient;
}

// Check if running in service mode
export function isServiceMode(): boolean {
  return serviceClient !== null;
}

// In-flight request deduplication to prevent concurrent fetches for the same data
const inFlightRequests = new Map<string, Promise<unknown>>();

// Wrapper class that uses either service client or custom client
export class TakaroClient {
  domain: string | null;
  client: TakaroSDKClient | null = null;

  constructor(domain: string | null) {
    this.domain = domain;
  }

  // Use service client if available
  useServiceClient(): boolean {
    if (serviceClient) {
      this.client = serviceClient;
      return true;
    }
    return false;
  }

  async login(email: string, password: string): Promise<{ success: boolean }> {
    try {
      const ClientClass = await getClientClass();

      // Create client with credentials
      this.client = new ClientClass({
        url: process.env.TAKARO_API_URL || 'https://api.takaro.io',
        auth: {
          username: email,
          password: password,
        },
        log: false,
      });

      // Authenticate
      await this.client.login();

      // Select the domain and manually set the cookie
      if (this.domain) {
        await this.client.user.userControllerSetSelectedDomain(this.domain);
        // Manually set the domain cookie on the axios instance
        this.client.setHeader('Cookie', `takaro-domain=${this.domain}`);
      }

      return { success: true };
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Login failed';
      throw new Error(message);
    }
  }

  async getGameServers(type: string | null = null): Promise<TakaroGameServer[]> {
    if (!this.client) throw new Error('Client not initialized');

    const cacheKey = cache.key('gameservers', this.domain || 'service', type || 'all');
    const cached = await cache.get<TakaroGameServer[]>(cacheKey);
    if (cached) return cached;

    const start = Date.now();
    const response = await this.client.gameserver.gameServerControllerSearch({
      filters: type ? { type: [type] } : {},
      sortBy: 'name',
      sortDirection: 'asc',
      limit: 100,
    });
    const data = response.data.data || [];
    logApiCall('getGameServers', start, data.length);

    await cache.set(cacheKey, data, TTL.GAME_SERVERS);
    return data;
  }

  async getPlayers(
    gameServerId: string,
    startDate?: string,
    endDate?: string,
    loadAll = false
  ): Promise<NormalizedPlayer[]> {
    if (!this.client) throw new Error('Client not initialized');

    // CACHE-THEN-FILTER PATTERN:
    // 1. Always cache the FULL player list (no date filtering in cache key)
    // 2. Filter by date range when returning
    // This makes range changes instant (just re-filter cached data)

    const fullCacheKey = cache.key('players', this.domain || 'service', gameServerId, 'full');

    // Check if there's already an in-flight request for the full list
    const inFlightKey = `players:${this.domain || 'service'}:${gameServerId}:full`;
    const inFlight = inFlightRequests.get(inFlightKey);

    let allPlayers: NormalizedPlayer[];

    if (inFlight) {
      console.log(`  ⏳ Waiting for in-flight player fetch...`);
      allPlayers = (await inFlight) as NormalizedPlayer[];
    } else {
      // Try cache first
      const cached = await cache.get<NormalizedPlayer[]>(fullCacheKey);
      if (cached) {
        allPlayers = cached;
      } else {
        // Fetch ALL players and cache them
        const fetchPromise = (async () => {
          const start = Date.now();
          console.log('  → Fetching ALL players (caching for fast filtering)...');

          const client = this.client;
          if (!client) throw new Error('Client not initialized');

          const allPogs = await fetchAllPaginated(
            (page, limit) =>
              client.playerOnGameserver.playerOnGameServerControllerSearch({
                filters: {
                  gameServerId: [gameServerId],
                },
                extend: ['player'],
                page,
                limit,
              }),
            100 // Page size
          );
          logApiCall('getPlayers (full list)', start, allPogs.length);

          const players = allPogs.map((pog) => ({
            id: pog.id,
            playerId: pog.playerId,
            name: pog.player?.name || 'Unknown',
            steamId: pog.player?.steamId,
            x: pog.positionX,
            y: pog.positionY,
            z: pog.positionZ,
            ping: pog.ping,
            currency: pog.currency,
            playtimeSeconds: pog.playtimeSeconds,
            lastSeen: pog.lastSeen,
            online: pog.online ?? false,
          }));

          // Cache the full list for 30 seconds (matches auto-refresh interval)
          await cache.set(fullCacheKey, players, TTL.PLAYERS_LIST);
          return players;
        })();

        // Store the promise and clean up when done
        inFlightRequests.set(inFlightKey, fetchPromise);
        try {
          allPlayers = await fetchPromise;
        } finally {
          inFlightRequests.delete(inFlightKey);
        }
      }
    }

    // If loadAll requested, return everything
    if (loadAll) {
      return allPlayers;
    }

    // Filter by date range
    if (!startDate && !endDate) {
      // No date filter - return only online players
      return allPlayers.filter((p) => p.online === true || p.online === 1);
    }

    const startTime = startDate ? new Date(startDate).getTime() : 0;
    const endTime = endDate ? new Date(endDate).getTime() : Date.now();

    return allPlayers.filter((player) => {
      // Always include online players
      if (player.online === true || player.online === 1) {
        return true;
      }
      // Include offline players within the date range
      if (!player.lastSeen) return false;
      const lastSeenTime = new Date(player.lastSeen).getTime();
      return lastSeenTime >= startTime && lastSeenTime <= endTime;
    });
  }

  async getPlayerList(_gameServerId: string): Promise<TakaroPlayer[]> {
    if (!this.client) throw new Error('Client not initialized');

    const client = this.client;
    // Get all players for this game server with pagination
    const players = await fetchAllPaginated<TakaroPlayer>(
      (page, limit) =>
        client.player.playerControllerSearch({
          filters: {},
          sortBy: 'name',
          sortDirection: 'asc',
          page,
          limit,
        }),
      100 // Page size
    );

    return players;
  }

  async getPlayersByIds(playerIds: string[]): Promise<TakaroPlayer[]> {
    if (!this.client) throw new Error('Client not initialized');
    if (!playerIds || playerIds.length === 0) return [];

    // Check cache for individual players first
    const uncachedIds: string[] = [];
    const cachedPlayers: TakaroPlayer[] = [];

    for (const id of playerIds) {
      const cacheKey = cache.key('player', this.domain || 'service', id);
      const cached = await cache.get<TakaroPlayer>(cacheKey);
      if (cached) {
        cachedPlayers.push(cached);
      } else {
        uncachedIds.push(id);
      }
    }

    // If all cached, return immediately
    if (uncachedIds.length === 0) {
      console.log(`  ⚡ CACHE HIT: All ${playerIds.length} players from cache`);
      return cachedPlayers;
    }

    const start = Date.now();
    // Query only uncached players
    const response = await this.client.player.playerControllerSearch({
      filters: {
        id: uncachedIds,
      },
      limit: uncachedIds.length,
    });

    const fetchedData = response.data.data || [];
    logApiCall(`getPlayersByIds (${uncachedIds.length}/${playerIds.length} IDs)`, start, fetchedData.length);

    // Cache each fetched player
    for (const player of fetchedData) {
      await cache.set(cache.key('player', this.domain || 'service', player.id), player, TTL.PLAYER_NAMES);
    }

    return [...cachedPlayers, ...fetchedData];
  }

  async getPlayersInBox(
    gameServerId: string,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    startDate?: string,
    endDate?: string
  ): Promise<TakaroTrackingResult[]> {
    if (!this.client) throw new Error('Client not initialized');

    const body: {
      gameserverId: string;
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
      startDate?: string;
      endDate?: string;
    } = {
      gameserverId: gameServerId,
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
    };

    if (startDate) body.startDate = startDate;
    if (endDate) body.endDate = endDate;

    console.log('  → Calling Takaro box API:', `${minX},${minZ} to ${maxX},${maxZ}`);

    try {
      const start = Date.now();
      const response = await this.client.tracking.trackingControllerGetBoundingBoxPlayers(body);
      const data = response.data.data || [];
      logApiCall('getPlayersInBox', start, data.length);
      return data;
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Box search failed';
      console.error('Takaro box API error:', axiosError.response?.data || axiosError.message);
      throw new Error(message);
    }
  }

  async getPlayersInRadius(
    gameServerId: string,
    x: number,
    y: number,
    z: number,
    radius: number,
    startDate?: string,
    endDate?: string
  ): Promise<TakaroTrackingResult[]> {
    if (!this.client) throw new Error('Client not initialized');

    const body: {
      gameserverId: string;
      x: number;
      y: number;
      z: number;
      radius: number;
      startDate?: string;
      endDate?: string;
    } = {
      gameserverId: gameServerId,
      x,
      y,
      z,
      radius,
    };

    if (startDate) body.startDate = startDate;
    if (endDate) body.endDate = endDate;

    console.log('Calling Takaro radius API:', JSON.stringify(body, null, 2));

    try {
      const response = await this.client.tracking.trackingControllerGetRadiusPlayers(body);
      return response.data.data || [];
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Radius search failed';
      console.error('Takaro radius API error:', axiosError.response?.data || axiosError.message);
      throw new Error(message);
    }
  }

  // Get map info from Takaro (no direct 7D2D connection needed)
  async getMapInfo(gameServerId: string): Promise<TakaroMapInfo> {
    if (!this.client) throw new Error('Client not initialized');

    const cacheKey = cache.key('mapinfo', this.domain || 'service', gameServerId);
    const cached = await cache.get<TakaroMapInfo>(cacheKey);
    if (cached) return cached;

    try {
      const start = Date.now();
      const response = await this.client.gameserver.gameServerControllerGetMapInfo(gameServerId);
      const data = response.data.data || {};
      logApiCall('getMapInfo', start);

      await cache.set(cacheKey, data, TTL.MAP_INFO);
      return data;
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Failed to get map info';
      throw new Error(message);
    }
  }

  // Get map tile from Takaro (no direct 7D2D connection needed)
  async getMapTile(gameServerId: string, z: number, x: number, y: number): Promise<ArrayBuffer | null> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      // Need to make a direct axios call with responseType: 'arraybuffer' for binary data
      const axios = this.client.axiosInstance;
      const response = await axios.get(`/gameserver/${gameServerId}/map/tile/${x}/${y}/${z}`, {
        responseType: 'arraybuffer',
      });
      return response.data;
    } catch (error) {
      // Return null for missing tiles (404)
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // Get player inventory history from Takaro tracking API
  async getPlayerInventoryHistory(playerId: string, startDate?: string, endDate?: string): Promise<unknown[]> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      // Default to last 24 hours if no dates provided
      const now = new Date();
      const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const body = {
        playerId,
        startDate: startDate || defaultStart.toISOString(),
        endDate: endDate || now.toISOString(),
      };

      const response = await this.client.tracking.trackingControllerGetPlayerInventoryHistory(body);
      return response.data.data || [];
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Failed to get inventory history';
      console.error('Takaro inventory history API error:', axiosError.response?.data || axiosError.message);
      throw new Error(message);
    }
  }

  // Get player movement history from Takaro tracking API
  async getPlayerMovementHistory(
    playerIds: string | string[] | undefined,
    startDate?: string,
    endDate?: string,
    limit = 10000
  ): Promise<TakaroTrackingResult[]> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      const body: {
        limit: number;
        playerId?: string[];
        startDate?: string;
        endDate?: string;
      } = {
        limit,
      };
      // playerId should be an array
      if (playerIds) {
        body.playerId = Array.isArray(playerIds) ? playerIds : [playerIds];
      }
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;

      const response = await this.client.tracking.trackingControllerGetPlayerMovementHistory(body);
      return response.data.data || [];
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Failed to get movement history';
      console.error('Takaro movement history API error:', axiosError.response?.data || axiosError.message);
      throw new Error(message);
    }
  }

  // Search for items on a game server
  async getItems(gameServerId: string, searchQuery: string | null = null): Promise<TakaroItem[]> {
    if (!this.client) throw new Error('Client not initialized');

    const cacheKey = cache.key('items', this.domain || 'service', gameServerId, searchQuery || 'all');
    const cached = await cache.get<TakaroItem[]>(cacheKey);
    if (cached) return cached;

    try {
      const start = Date.now();
      const body: {
        filters: { gameserverId: string[] };
        limit: number;
        search?: { name: string[] };
      } = {
        filters: {
          gameserverId: [gameServerId],
        },
        limit: 1000, // Get all items
      };

      // Add search if provided
      if (searchQuery) {
        body.search = {
          name: [searchQuery],
        };
      }

      const response = await this.client.item.itemControllerSearch(body);
      const data = response.data.data || [];
      logApiCall('getItems', start, data.length);

      // Cache for 30 minutes (items don't change often)
      await cache.set(cacheKey, data, 30 * 60);
      return data;
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Failed to get items';
      console.error('Takaro getItems API error:', axiosError.response?.data || axiosError.message);
      throw new Error(message);
    }
  }

  // Get players who have had a specific item in their inventory
  async getPlayersByItem(itemId: string, startDate?: string, endDate?: string): Promise<TakaroTrackingResult[]> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      const body: {
        itemId: string;
        startDate?: string;
        endDate?: string;
      } = {
        itemId,
      };

      // Only add dates if provided (try without dates first to debug)
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;

      console.log('  🔍 Calling getPlayersByItem with:', JSON.stringify(body));

      const start = Date.now();
      const response = await this.client.tracking.trackingControllerGetPlayersByItem(body);
      const data = response.data.data || [];

      console.log('  📊 Response:', JSON.stringify(response.data).slice(0, 500));
      logApiCall('getPlayersByItem', start, data.length);
      return data;
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Failed to get players by item';
      console.error('Takaro getPlayersByItem API error:', axiosError.response?.data || axiosError.message);
      throw new Error(message);
    }
  }

  // Get all movement paths for players on a game server (uses box search for full coverage)
  async getMovementPaths(gameServerId: string, startDate?: string, endDate?: string): Promise<TakaroTrackingResult[]> {
    if (!this.client) throw new Error('Client not initialized');

    // Cache key includes date range
    const cacheKey = cache.key(
      'movementpaths',
      this.domain || 'service',
      gameServerId,
      startDate || 'nostart',
      endDate || 'noend'
    );
    const cached = await cache.get<TakaroTrackingResult[]>(cacheKey);
    if (cached) return cached;

    try {
      // Use a very large box to get all movement on the server
      const body: {
        gameserverId: string;
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
        minZ: number;
        maxZ: number;
        startDate?: string;
        endDate?: string;
      } = {
        gameserverId: gameServerId,
        minX: -100000,
        maxX: 100000,
        minY: -10000,
        maxY: 10000,
        minZ: -100000,
        maxZ: 100000,
      };
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;

      console.log('  → Calling getMovementPaths (full world box)');
      const start = Date.now();
      const response = await this.client.tracking.trackingControllerGetBoundingBoxPlayers(body);
      const data = response.data.data || [];
      logApiCall('getMovementPaths (full world)', start, data.length);

      await cache.set(cacheKey, data, TTL.MOVEMENT_PATHS);
      return data;
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Failed to get movement paths';
      console.error('Takaro movement paths API error:', axiosError.response?.data || axiosError.message);
      throw new Error(message);
    }
  }

  // Give an item to a player
  async giveItem(
    gameServerId: string,
    playerId: string,
    itemName: string,
    amount: number,
    quality: string = '1'
  ): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      const start = Date.now();
      await this.client.gameserver.gameServerControllerGiveItem(gameServerId, playerId, {
        name: itemName,
        amount,
        quality,
      });
      logApiCall(`giveItem (${amount}x ${itemName})`, start);
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Failed to give item';
      console.error('Takaro giveItem API error:', axiosError.response?.data || axiosError.message);
      throw new Error(message);
    }
  }

  // Add currency to a player
  async addCurrency(gameServerId: string, playerId: string, currency: number): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      const start = Date.now();
      await this.client.playerOnGameserver.playerOnGameServerControllerAddCurrency(gameServerId, playerId, {
        currency,
      });
      logApiCall(`addCurrency (${currency})`, start);
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { meta?: { error?: { message?: string } }; message?: string } };
        message?: string;
      };
      const message =
        axiosError.response?.data?.meta?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Failed to add currency';
      console.error('Takaro addCurrency API error:', axiosError.response?.data || axiosError.message);
      throw new Error(message);
    }
  }
}

export function createClient(domain: string | null): TakaroClient {
  return new TakaroClient(domain);
}

// Export types
export type {
  TakaroGameServer,
  TakaroPlayer,
  TakaroMapInfo,
  TakaroItem,
  TakaroTrackingResult,
  MovementPath,
  MovementPoint,
  NormalizedPlayer,
};
