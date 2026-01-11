// Dynamic import for ES module SDK
let Client;
let serviceClient = null;
let operationMode = null; // 'service' | 'cookie'

const { cache, TTL } = require('./cache');

// Detect which auth mode to use based on environment variables
function detectMode() {
  const hasEnvVars = process.env.TAKARO_USERNAME && process.env.TAKARO_PASSWORD && process.env.TAKARO_DOMAIN;
  operationMode = hasEnvVars ? 'service' : 'cookie';
  return operationMode;
}

// Get current operation mode
function getOperationMode() {
  return operationMode;
}

// Check if running in cookie mode (production - no env vars)
function isCookieMode() {
  return operationMode === 'cookie';
}

// Create a client that forwards cookies from the user's browser
async function createCookieClient(cookies, domainId = null) {
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

  return client;
}

// Pagination helper - fetches all pages of paginated API results
async function fetchAllPaginated(fetchFn, pageSize = 100, maxTotal = 10000) {
  let allResults = [];
  let page = 0;
  let total = null;

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

  if (total > pageSize) {
    console.log(`  📄 Paginated fetch: ${allResults.length}/${total} results (${page} pages)`);
  }

  return allResults;
}

// Timing helper for API calls
function logApiCall(method, start, resultCount = null) {
  const duration = Date.now() - start;
  const countStr = resultCount !== null ? ` (${resultCount} results)` : '';
  const emoji = duration > 2000 ? '🐢' : duration > 500 ? '⚠️' : '⚡';
  console.log(`  ${emoji} TAKARO API: ${method} - ${duration}ms${countStr}`);
}

async function getClientClass() {
  if (!Client) {
    const sdk = await import('@takaro/apiclient');
    Client = sdk.Client;
  }
  return Client;
}

// Initialize service client at startup (like Takaro agent)
async function initServiceClient() {
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
    console.error('Failed to initialize service client:', error.message);
    serviceClient = null;
    return null;
  }
}

// Get the service client (if initialized)
function getServiceClient() {
  return serviceClient;
}

// Check if running in service mode
function isServiceMode() {
  return serviceClient !== null;
}

// Wrapper class that uses either service client or custom client
class TakaroClient {
  constructor(domain) {
    this.domain = domain;
    this.client = null;
  }

  // Use service client if available
  useServiceClient() {
    if (serviceClient) {
      this.client = serviceClient;
      return true;
    }
    return false;
  }

  async login(email, password) {
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
      await this.client.user.userControllerSetSelectedDomain(this.domain);

      // Manually set the domain cookie on the axios instance
      this.client.setHeader('Cookie', `takaro-domain=${this.domain}`);

      return { success: true };
    } catch (error) {
      const message =
        error.response?.data?.meta?.error?.message || error.response?.data?.message || error.message || 'Login failed';
      throw new Error(message);
    }
  }

  async getGameServers(type = null) {
    const cacheKey = cache.key('gameservers', type || 'all');
    const cached = await cache.get(cacheKey);
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

  async getPlayers(gameServerId) {
    const start = Date.now();
    // Get ALL players from POG (Player On Gameserver) endpoint with pagination
    const pogs = await fetchAllPaginated(
      (page, limit) =>
        this.client.playerOnGameserver.playerOnGameServerControllerSearch({
          filters: {
            gameServerId: [gameServerId],
            // No online filter = get ALL players (online and offline)
          },
          extend: ['player'],
          page,
          limit,
        }),
      100 // Page size
    );

    logApiCall('getPlayers (POG search)', start, pogs.length);

    return pogs.map((pog) => ({
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
      online: pog.online,
    }));
  }

  async getPlayerList(_gameServerId) {
    // Get all players for this game server with pagination
    const players = await fetchAllPaginated(
      (page, limit) =>
        this.client.player.playerControllerSearch({
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

  async getPlayersByIds(playerIds) {
    if (!playerIds || playerIds.length === 0) return [];

    // Check cache for individual players first
    const uncachedIds = [];
    const cachedPlayers = [];

    for (const id of playerIds) {
      const cacheKey = cache.key('player', id);
      const cached = await cache.get(cacheKey);
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
      await cache.set(cache.key('player', player.id), player, TTL.PLAYER_NAMES);
    }

    return [...cachedPlayers, ...fetchedData];
  }

  async getPlayersInBox(gameServerId, minX, maxX, minY, maxY, minZ, maxZ, startDate, endDate) {
    const body = {
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
      const message =
        error.response?.data?.meta?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Box search failed';
      console.error('Takaro box API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  async getPlayersInRadius(gameServerId, x, y, z, radius, startDate, endDate) {
    const body = {
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
      const message =
        error.response?.data?.meta?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Radius search failed';
      console.error('Takaro radius API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Get map info from Takaro (no direct 7D2D connection needed)
  async getMapInfo(gameServerId) {
    const cacheKey = cache.key('mapinfo', gameServerId);
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    try {
      const start = Date.now();
      const response = await this.client.gameserver.gameServerControllerGetMapInfo(gameServerId);
      const data = response.data.data || {};
      logApiCall('getMapInfo', start);

      await cache.set(cacheKey, data, TTL.MAP_INFO);
      return data;
    } catch (error) {
      const message =
        error.response?.data?.meta?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Failed to get map info';
      throw new Error(message);
    }
  }

  // Get map tile from Takaro (no direct 7D2D connection needed)
  async getMapTile(gameServerId, z, x, y) {
    try {
      // Need to make a direct axios call with responseType: 'arraybuffer' for binary data
      const axios = this.client.axiosInstance;
      const response = await axios.get(`/gameserver/${gameServerId}/map/tile/${x}/${y}/${z}`, {
        responseType: 'arraybuffer',
      });
      return response.data;
    } catch (error) {
      // Return null for missing tiles (404)
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // Get player inventory history from Takaro tracking API
  async getPlayerInventoryHistory(playerId, startDate, endDate) {
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
      const message =
        error.response?.data?.meta?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Failed to get inventory history';
      console.error('Takaro inventory history API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Get player movement history from Takaro tracking API
  async getPlayerMovementHistory(playerIds, startDate, endDate, limit = 10000) {
    try {
      const body = {
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
      const message =
        error.response?.data?.meta?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Failed to get movement history';
      console.error('Takaro movement history API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Get death events for a game server
  async getDeathEvents(gameServerId, startDate, endDate) {
    const cacheKey = cache.key('deaths', gameServerId, startDate || 'nostart', endDate || 'noend');
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    try {
      const filters = {
        eventName: ['player-death'],
        gameserverId: [gameServerId],
      };

      // Add date range if provided
      if (startDate || endDate) {
        filters.createdAt = {};
        if (startDate) filters.createdAt.greaterThan = startDate;
        if (endDate) filters.createdAt.lessThan = endDate;
      }

      const start = Date.now();
      // Use pagination to fetch ALL death events
      const data = await fetchAllPaginated(
        (page, limit) =>
          this.client.event.eventControllerSearch({
            filters,
            sortBy: 'createdAt',
            sortDirection: 'desc',
            page,
            limit,
          }),
        100 // Page size
      );
      logApiCall('getDeathEvents', start, data.length);

      await cache.set(cacheKey, data, TTL.DEATH_EVENTS);
      return data;
    } catch (error) {
      const message =
        error.response?.data?.meta?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Failed to get death events';
      console.error('Takaro death events API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Search for items on a game server
  async getItems(gameServerId, searchQuery = null) {
    const cacheKey = cache.key('items', gameServerId, searchQuery || 'all');
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    try {
      const start = Date.now();
      const body = {
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
      const message =
        error.response?.data?.meta?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Failed to get items';
      console.error('Takaro getItems API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Get players who have had a specific item in their inventory
  async getPlayersByItem(itemId, startDate, endDate) {
    try {
      const body = {
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
      const message =
        error.response?.data?.meta?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Failed to get players by item';
      console.error('Takaro getPlayersByItem API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Get all movement paths for players on a game server (uses box search for full coverage)
  async getMovementPaths(gameServerId, startDate, endDate) {
    // Cache key includes date range
    const cacheKey = cache.key('movementpaths', gameServerId, startDate || 'nostart', endDate || 'noend');
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    try {
      // Use a very large box to get all movement on the server
      const body = {
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
      const message =
        error.response?.data?.meta?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Failed to get movement paths';
      console.error('Takaro movement paths API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }
}

function createClient(domain) {
  return new TakaroClient(domain);
}

module.exports = {
  TakaroClient,
  createClient,
  initServiceClient,
  getServiceClient,
  isServiceMode,
  isCookieMode,
  getOperationMode,
  createCookieClient,
};
