// Dynamic import for ES module SDK
let Client;
let serviceClient = null;

async function getClientClass() {
  if (!Client) {
    const sdk = await import('@takaro/apiclient');
    Client = sdk.Client;
  }
  return Client;
}

// Initialize service client at startup (like Takaro agent)
async function initServiceClient() {
  const username = process.env.TAKARO_USERNAME;
  const password = process.env.TAKARO_PASSWORD;
  const domain = process.env.TAKARO_DOMAIN;
  const apiUrl = process.env.TAKARO_API_URL || 'https://api.takaro.io';

  if (!username || !password) {
    console.log('No Takaro credentials configured (TAKARO_USERNAME/TAKARO_PASSWORD)');
    console.log('Using manual login mode - users must log in via the web interface');
    return null;
  }

  if (!domain) {
    console.log('No TAKARO_DOMAIN configured - service client requires a domain');
    return null;
  }

  try {
    const ClientClass = await getClientClass();

    serviceClient = new ClientClass({
      url: apiUrl,
      auth: {
        username,
        password
      },
      log: false
    });

    console.log('Logging into Takaro as service account...');
    await serviceClient.login();

    // Select the domain and manually set the cookie
    // The SDK doesn't properly handle the domain cookie from the response
    await serviceClient.user.userControllerSetSelectedDomain(domain);

    // Manually set the domain cookie on the axios instance
    serviceClient.setHeader('Cookie', `takaro-domain=${domain}`);

    console.log(`✓ Service client authenticated for domain: ${domain}`);
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
          password: password
        },
        log: false
      });

      // Authenticate
      await this.client.login();

      // Select the domain and manually set the cookie
      await this.client.user.userControllerSetSelectedDomain(this.domain);

      // Manually set the domain cookie on the axios instance
      this.client.setHeader('Cookie', `takaro-domain=${this.domain}`);

      return { success: true };
    } catch (error) {
      const message = error.response?.data?.meta?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Login failed';
      throw new Error(message);
    }
  }

  async getGameServers(type = null) {
    const response = await this.client.gameserver.gameServerControllerSearch({
      filters: type ? { type: [type] } : {},
      sortBy: 'name',
      sortDirection: 'asc',
      limit: 100
    });
    return response.data.data || [];
  }

  async getPlayers(gameServerId) {
    // Get ALL players from POG (Player On Gameserver) endpoint
    const response = await this.client.playerOnGameserver.playerOnGameServerControllerSearch({
      filters: {
        gameServerId: [gameServerId]
        // No online filter = get ALL players (online and offline)
      },
      extend: ['player'],
      limit: 1000
    });

    const pogs = response.data.data || [];

    return pogs.map(pog => ({
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
      online: pog.online
    }));
  }

  async getPlayerList(gameServerId) {
    // Get all players for this game server
    const response = await this.client.player.playerControllerSearch({
      filters: {},
      sortBy: 'name',
      sortDirection: 'asc',
      limit: 1000
    });

    return response.data.data || [];
  }

  async getPlayersByIds(playerIds) {
    if (!playerIds || playerIds.length === 0) return [];

    // Query players by their IDs
    const response = await this.client.player.playerControllerSearch({
      filters: {
        id: playerIds
      },
      limit: playerIds.length
    });

    return response.data.data || [];
  }

  async getPlayersInBox(gameServerId, minX, maxX, minY, maxY, minZ, maxZ, startDate, endDate) {
    const body = {
      gameserverId: gameServerId,
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ
    };

    if (startDate) body.startDate = startDate;
    if (endDate) body.endDate = endDate;

    console.log('Calling Takaro box API:', JSON.stringify(body, null, 2));

    try {
      const response = await this.client.tracking.trackingControllerGetBoundingBoxPlayers(body);
      return response.data.data || [];
    } catch (error) {
      const message = error.response?.data?.meta?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Box search failed';
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
      radius
    };

    if (startDate) body.startDate = startDate;
    if (endDate) body.endDate = endDate;

    console.log('Calling Takaro radius API:', JSON.stringify(body, null, 2));

    try {
      const response = await this.client.tracking.trackingControllerGetRadiusPlayers(body);
      return response.data.data || [];
    } catch (error) {
      const message = error.response?.data?.meta?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Radius search failed';
      console.error('Takaro radius API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Get map info from Takaro (no direct 7D2D connection needed)
  async getMapInfo(gameServerId) {
    try {
      const response = await this.client.gameserver.gameServerControllerGetMapInfo(gameServerId);
      return response.data.data || {};
    } catch (error) {
      const message = error.response?.data?.meta?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Failed to get map info';
      throw new Error(message);
    }
  }

  // Get map tile from Takaro (no direct 7D2D connection needed)
  async getMapTile(gameServerId, z, x, y) {
    try {
      // Need to make a direct axios call with responseType: 'arraybuffer' for binary data
      const axios = this.client.axiosInstance;
      const response = await axios.get(
        `/gameserver/${gameServerId}/map/tile/${x}/${y}/${z}`,
        { responseType: 'arraybuffer' }
      );
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
        endDate: endDate || now.toISOString()
      };

      const response = await this.client.tracking.trackingControllerGetPlayerInventoryHistory(body);
      return response.data.data || [];
    } catch (error) {
      const message = error.response?.data?.meta?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Failed to get inventory history';
      console.error('Takaro inventory history API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Get player movement history from Takaro tracking API
  async getPlayerMovementHistory(playerIds, startDate, endDate, limit = 10000) {
    try {
      const body = {
        limit
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
      const message = error.response?.data?.meta?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Failed to get movement history';
      console.error('Takaro movement history API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Get death events for a game server
  async getDeathEvents(gameServerId, startDate, endDate) {
    try {
      const filters = {
        eventName: ['player-death'],
        gameserverId: [gameServerId]
      };

      const body = {
        filters,
        sortBy: 'createdAt',
        sortDirection: 'desc',
        limit: 1000
      };

      // Add date range if provided
      if (startDate || endDate) {
        body.filters.createdAt = {};
        if (startDate) body.filters.createdAt.greaterThan = startDate;
        if (endDate) body.filters.createdAt.lessThan = endDate;
      }

      const response = await this.client.event.eventControllerSearch(body);
      return response.data.data || [];
    } catch (error) {
      const message = error.response?.data?.meta?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Failed to get death events';
      console.error('Takaro death events API error:', error.response?.data || error.message);
      throw new Error(message);
    }
  }

  // Get all movement paths for players on a game server (uses box search for full coverage)
  async getMovementPaths(gameServerId, startDate, endDate) {
    try {
      // Use a very large box to get all movement on the server
      const body = {
        gameserverId: gameServerId,
        minX: -100000,
        maxX: 100000,
        minY: -10000,
        maxY: 10000,
        minZ: -100000,
        maxZ: 100000
      };
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;

      const response = await this.client.tracking.trackingControllerGetBoundingBoxPlayers(body);
      return response.data.data || [];
    } catch (error) {
      const message = error.response?.data?.meta?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Failed to get movement paths';
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
  isServiceMode
};
