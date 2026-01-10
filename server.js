require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs').promises;

const { createClient: createTakaroClient, initServiceClient, isServiceMode } = require('./lib/takaro');

const { cache } = require('./lib/cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Debug timing middleware - logs all API requests with timing
app.use('/api', (req, res, next) => {
  const start = Date.now();
  const reqId = Math.random().toString(36).substr(2, 6);

  console.log(`[${reqId}] → ${req.method} ${req.originalUrl}`);

  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const emoji = duration > 2000 ? '🐢' : duration > 500 ? '⚠️' : '✓';
    console.log(`[${reqId}] ${emoji} ${req.method} ${req.originalUrl} - ${duration}ms (${res.statusCode})`);
  });

  next();
});

// Session storage (in-memory) - simplified for service mode only
let serviceSession = null;

// Service session ID (used when running in service mode)
const SERVICE_SESSION_ID = 'service-session';

// Auth middleware - service mode only
function requireAuth(req, res, next) {
  if (!isServiceMode() || !serviceSession) {
    return res.status(401).json({
      error: 'Service not configured. Set TAKARO_USERNAME, TAKARO_PASSWORD, and TAKARO_DOMAIN environment variables.',
    });
  }

  req.session = serviceSession;
  req.sessionId = SERVICE_SESSION_ID;
  next();
}

// ============== AUTH ROUTES ==============

// Check auth status - tells frontend if service mode is active
app.get('/api/auth/status', (_req, res) => {
  const serviceMode = isServiceMode();
  const domain = process.env.TAKARO_DOMAIN || null;

  res.json({
    serviceMode,
    authenticated: serviceMode,
    domain,
    sessionId: serviceMode ? SERVICE_SESSION_ID : null,
  });
});

// ============== GAME SERVER ROUTES ==============

// Get game servers
app.get('/api/gameservers', requireAuth, async (req, res) => {
  try {
    const servers = await req.session.takaroClient.getGameServers();
    res.json({ data: servers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get map info (from Takaro)
app.get('/api/map-info/:gameServerId', requireAuth, async (req, res) => {
  const { gameServerId } = req.params;

  try {
    const mapInfo = await req.session.takaroClient.getMapInfo(gameServerId);
    res.json({
      data: {
        worldSize: mapInfo.mapSizeX || 8192,
        maxZoom: mapInfo.maxZoom || 4,
        ...mapInfo,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== MAP TILE PROXY (from Takaro) ==============

// Tile cache directory
const TILE_CACHE_DIR = path.join(__dirname, 'cache', 'tiles');

app.get('/api/map/:gameServerId/:z/:x/:y.png', requireAuth, async (req, res) => {
  const { gameServerId, z, x, y } = req.params;
  const takaroX = parseInt(x, 10);
  const takaroY = parseInt(y, 10);

  // Disk cache path
  const tileCachePath = path.join(TILE_CACHE_DIR, gameServerId, z, `${takaroX}_${takaroY}.png`);

  try {
    // Check disk cache first
    try {
      const cachedTile = await fs.readFile(tileCachePath);
      console.log(`  ⚡ TILE CACHE HIT: ${z}/${takaroX}/${takaroY}`);
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(cachedTile);
    } catch {
      // Not in cache, fetch from Takaro
    }

    const tileData = await req.session.takaroClient.getMapTile(gameServerId, z, takaroX, takaroY);

    if (tileData) {
      // Save to disk cache
      try {
        await fs.mkdir(path.dirname(tileCachePath), { recursive: true });
        await fs.writeFile(tileCachePath, Buffer.from(tileData));
      } catch (cacheErr) {
        console.warn('Failed to cache tile:', cacheErr.message);
      }

      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(Buffer.from(tileData));
    } else {
      res.status(204).send();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== PLAYER ROUTES ==============

// Get all players (from Takaro - includes online and offline)
app.get('/api/players', requireAuth, async (req, res) => {
  const { gameServerId } = req.query;

  if (!gameServerId) {
    return res.status(400).json({ error: 'gameServerId required' });
  }

  try {
    const players = await req.session.takaroClient.getPlayers(gameServerId);
    res.json({ data: players });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get player inventory history (from Takaro tracking API)
app.get('/api/inventory/:playerId', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const inventory = await req.session.takaroClient.getPlayerInventoryHistory(playerId, startDate, endDate);
    res.json({ data: inventory });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get player movement history (from Takaro tracking API)
app.get('/api/player-history/:gameServerId/:playerId', requireAuth, async (req, res) => {
  const { gameServerId: _gameServerId, playerId } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const history = await req.session.takaroClient.getPlayerMovementHistory(playerId, startDate, endDate);
    res.json({ data: history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get movement paths for all players on a game server (from Takaro tracking API)
app.get('/api/movement-paths', requireAuth, async (req, res) => {
  const { gameServerId, startDate, endDate } = req.query;

  if (!gameServerId) {
    return res.status(400).json({ error: 'gameServerId required' });
  }

  try {
    // Get all movement data from Takaro
    const results = await req.session.takaroClient.getMovementPaths(gameServerId, startDate, endDate);

    // Enrich with player names
    const enrichedResults = await enrichWithPlayerNames(req.session.takaroClient, results);

    // Group by player for path drawing
    const paths = {};
    for (const point of enrichedResults) {
      const playerId = point.playerId;
      if (!playerId) continue;

      if (!paths[playerId]) {
        paths[playerId] = {
          name: point.playerName || 'Unknown',
          points: [],
        };
      }

      paths[playerId].points.push({
        x: point.x,
        y: point.y,
        z: point.z,
        timestamp: point.createdAt || point.timestamp,
      });
    }

    // Sort points by timestamp for each player
    for (const playerId in paths) {
      paths[playerId].points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    res.json({ data: paths });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== EVENTS ROUTES ==============

// Get death events
app.get('/api/events/deaths', requireAuth, async (req, res) => {
  const { gameServerId, startDate, endDate } = req.query;

  if (!gameServerId) {
    return res.status(400).json({ error: 'gameServerId required' });
  }

  try {
    const events = await req.session.takaroClient.getDeathEvents(gameServerId, startDate, endDate);
    res.json({ data: events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== AREA SEARCH ROUTES ==============

// Helper function to enrich tracking results with player names
async function enrichWithPlayerNames(takaroClient, trackingResults) {
  if (!trackingResults || trackingResults.length === 0) return trackingResults;

  // Get unique player IDs
  const playerIds = [...new Set(trackingResults.map((r) => r.playerId).filter(Boolean))];

  if (playerIds.length === 0) return trackingResults;

  try {
    // Fetch player info from Takaro
    const players = await takaroClient.getPlayersByIds(playerIds);

    // Create lookup map
    const playerNameMap = new Map();
    players.forEach((p) => {
      playerNameMap.set(p.id, p.name);
    });

    // Enrich results with player names
    return trackingResults.map((r) => ({
      ...r,
      playerName: playerNameMap.get(r.playerId) || 'Unknown',
    }));
  } catch (error) {
    console.warn('Failed to fetch player names:', error.message);
    return trackingResults;
  }
}

// Search players in bounding box
app.post('/api/players/area/box', requireAuth, async (req, res) => {
  const { gameServerId, minX, maxX, minY, maxY, minZ, maxZ, startDate, endDate } = req.body;

  if (!gameServerId) {
    return res.status(400).json({ error: 'gameServerId required' });
  }

  if (minX === undefined || maxX === undefined || minZ === undefined || maxZ === undefined) {
    return res.status(400).json({ error: 'minX, maxX, minZ, maxZ are required' });
  }

  try {
    const results = await req.session.takaroClient.getPlayersInBox(
      gameServerId,
      minX,
      maxX,
      minY ?? -10000,
      maxY ?? 10000,
      minZ,
      maxZ,
      startDate,
      endDate
    );

    // Enrich with player names from Takaro
    const enrichedResults = await enrichWithPlayerNames(req.session.takaroClient, results);

    res.json({ data: enrichedResults });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search players in radius
app.post('/api/players/area/radius', requireAuth, async (req, res) => {
  const { gameServerId, x, y, z, radius, startDate, endDate } = req.body;

  if (!gameServerId) {
    return res.status(400).json({ error: 'gameServerId required' });
  }

  if (x === undefined || z === undefined || radius === undefined) {
    return res.status(400).json({ error: 'x, z, and radius are required' });
  }

  try {
    const results = await req.session.takaroClient.getPlayersInRadius(
      gameServerId,
      x,
      y ?? 0,
      z,
      radius,
      startDate,
      endDate
    );

    // Enrich with player names from Takaro
    const enrichedResults = await enrichWithPlayerNames(req.session.takaroClient, results);

    res.json({ data: enrichedResults });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== START SERVER ==============

async function startServer() {
  // Initialize cache (Redis or fallback to memory)
  await cache.connect();

  // Initialize service client (auto-login)
  await initServiceClient();

  // If service mode is active, create the service session
  if (isServiceMode()) {
    const domain = process.env.TAKARO_DOMAIN;

    // Create a TakaroClient wrapper that uses the service client
    const takaroClient = createTakaroClient(domain);
    takaroClient.useServiceClient();

    serviceSession = {
      domain,
      takaroClient,
      createdAt: new Date(),
    };

    console.log('Service mode active - no login required');
  } else {
    console.error(
      'ERROR: Service mode not active. Please set TAKARO_USERNAME, TAKARO_PASSWORD, and TAKARO_DOMAIN environment variables.'
    );
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
