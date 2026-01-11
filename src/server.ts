import 'dotenv/config';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { cache } from './lib/cache.js';
import {
  createCookieClient,
  createClient as createTakaroClient,
  getOperationMode,
  initServiceClient,
  isCookieMode,
  isServiceMode,
  TakaroClient,
  type TakaroTrackingResult,
} from './lib/takaro.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Session type
interface Session {
  domain: string | null;
  takaroClient: TakaroClient;
  createdAt: Date;
}

// Extend Express Request with our session
interface AuthenticatedRequest extends Request {
  session?: Session;
  sessionId?: string;
}

// Middleware
app.use(
  cors({
    origin: true, // Allow all origins (needed for cookie mode)
    credentials: true, // Allow cookies to be sent
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Debug timing middleware - logs all API requests with timing
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
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
let serviceSession: Session | null = null;

// Service session ID (used when running in service mode)
const SERVICE_SESSION_ID = 'service-session';

// Auth middleware - handles both service mode and cookie mode
async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (isServiceMode()) {
      // Service mode: use pre-authenticated client
      if (!serviceSession) {
        res.status(503).json({
          error: 'Service not initialized. Please wait or check server logs.',
        });
        return;
      }
      req.session = serviceSession;
      req.sessionId = SERVICE_SESSION_ID;
      next();
      return;
    }

    if (isCookieMode()) {
      // Cookie mode: forward user's cookies to Takaro API
      const hasTakaroCookies = hasTakaroSession(req.cookies);

      if (!hasTakaroCookies) {
        res.status(401).json({
          error: 'Not authenticated. Please log in to Takaro first.',
          needsLogin: true,
          loginUrl: process.env.TAKARO_API_URL || 'https://api.takaro.io',
        });
        return;
      }

      // Get domain from cookie or header
      const domainId = req.cookies['takaro-domain'] || req.headers['x-takaro-domain'] || null;

      // Create a per-request client with forwarded cookies
      const client = await createCookieClient(req.cookies, domainId as string | null);

      // Wrap in TakaroClient-like interface
      const takaroClient = new TakaroClient(domainId as string | null);
      takaroClient.client = client;

      req.session = {
        domain: domainId as string | null,
        takaroClient,
        createdAt: new Date(),
      };
      req.sessionId = 'cookie-session';
      next();
      return;
    }

    // Neither mode active - should not happen
    res.status(500).json({
      error: 'Server misconfiguration - no auth mode detected',
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

// Helper to check if request has Takaro session cookies
function hasTakaroSession(cookies: Record<string, string>): boolean {
  if (!cookies || Object.keys(cookies).length === 0) return false;

  // Ory session cookies typically start with 'ory_' or contain 'session'
  // Also check for takaro-domain cookie
  const sessionCookies = Object.keys(cookies).filter(
    (key) => key.startsWith('ory_') || key.includes('session') || key === 'takaro-domain'
  );

  return sessionCookies.length > 0;
}

// ============== AUTH ROUTES ==============

// Check auth status - tells frontend the current auth mode and status
app.get('/api/auth/status', async (req: Request, res: Response) => {
  const mode = getOperationMode();
  const apiUrl = process.env.TAKARO_API_URL || 'https://api.takaro.io';
  const dashboardUrl = apiUrl.replace('://api.', '://dashboard.');

  if (mode === 'service') {
    // Service mode - report if service client is ready
    const serviceModeActive = isServiceMode();
    res.json({
      mode: 'service',
      serviceMode: true,
      authenticated: serviceModeActive,
      domain: process.env.TAKARO_DOMAIN || null,
      sessionId: serviceModeActive ? SERVICE_SESSION_ID : null,
      dashboardUrl,
    });
  } else {
    // Cookie mode - check if user has valid cookies
    const hasCookies = hasTakaroSession(req.cookies);
    const domainId = req.cookies['takaro-domain'] || null;

    // If we have cookies, try to validate them by making a test API call
    let isValid = false;
    let domains: Array<{ id: string; name: string }> = [];

    if (hasCookies) {
      try {
        const client = await createCookieClient(req.cookies, domainId);
        const meResponse = await client.user.userControllerMe();
        isValid = true;
        domains = meResponse.data.data?.domains || [];
      } catch (error) {
        console.warn('Cookie validation failed:', error instanceof Error ? error.message : 'Unknown error');
        isValid = false;
      }
    }

    res.json({
      mode: 'cookie',
      serviceMode: false,
      authenticated: isValid,
      domain: domainId,
      availableDomains: domains,
      needsLogin: !isValid,
      loginUrl: apiUrl,
      dashboardUrl,
    });
  }
});

// Get available domains for current user
app.get('/api/domains', async (req: Request, res: Response) => {
  if (isServiceMode()) {
    // In service mode, only one domain is available
    const domain = process.env.TAKARO_DOMAIN;
    res.json({
      data: [{ id: domain, name: domain }],
      currentDomain: domain,
    });
    return;
  }

  // Cookie mode - fetch user's domains
  try {
    const client = await createCookieClient(req.cookies);
    const meResponse = await client.user.userControllerMe();
    const domains = meResponse.data.data?.domains || [];
    const currentDomain = req.cookies['takaro-domain'] || null;

    res.json({
      data: domains,
      currentDomain,
    });
  } catch (_error) {
    res.status(401).json({ error: 'Not authenticated or session expired' });
  }
});

// Set selected domain (cookie mode only)
app.post('/api/domains/select', async (req: Request, res: Response) => {
  const { domainId } = req.body;

  if (!domainId) {
    res.status(400).json({ error: 'domainId required' });
    return;
  }

  if (isServiceMode()) {
    res.status(400).json({ error: 'Cannot change domain in service mode' });
    return;
  }

  // Set domain cookie
  res.cookie('takaro-domain', domainId, {
    httpOnly: false, // Allow JS to read it for display purposes
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  // Also call Takaro to set the domain
  try {
    const client = await createCookieClient(req.cookies, domainId);
    await client.user.userControllerSetSelectedDomain(domainId);
    res.json({ success: true, domainId });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to select domain: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

// ============== GAME SERVER ROUTES ==============

// Get game servers
app.get('/api/gameservers', requireAuth as express.RequestHandler, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const servers = await req.session!.takaroClient.getGameServers();
    res.json({ data: servers });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Get map info (from Takaro)
app.get(
  '/api/map-info/:gameServerId',
  requireAuth as express.RequestHandler,
  async (req: AuthenticatedRequest, res: Response) => {
    const gameServerId = req.params.gameServerId as string;

    try {
      const mapInfo = await req.session!.takaroClient.getMapInfo(gameServerId);
      res.json({
        data: {
          worldSize: mapInfo.mapSizeX || 8192,
          maxZoom: mapInfo.maxZoom || 4,
          ...mapInfo,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
);

// ============== MAP TILE PROXY (from Takaro) ==============

// Tile cache directory
const TILE_CACHE_DIR = path.join(__dirname, '..', 'cache', 'tiles');

app.get(
  '/api/map/:gameServerId/:z/:x/:y.png',
  requireAuth as express.RequestHandler,
  async (req: AuthenticatedRequest, res: Response) => {
    const gameServerId = req.params.gameServerId as string;
    const z = req.params.z as string;
    const x = req.params.x as string;
    const y = req.params.y as string;
    const takaroX = parseInt(x, 10);
    const takaroY = parseInt(y, 10);

    // Disk cache path - include domain to isolate caches between domains
    const domain = req.session!.domain || 'service';
    const tileCachePath = path.join(TILE_CACHE_DIR, domain, gameServerId, z, `${takaroX}_${takaroY}.png`);

    try {
      // Check disk cache first
      try {
        const cachedTile = await fs.readFile(tileCachePath);
        console.log(`  ⚡ TILE CACHE HIT: ${z}/${takaroX}/${takaroY}`);
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(cachedTile);
        return;
      } catch {
        // Not in cache, fetch from Takaro
      }

      const tileData = await req.session!.takaroClient.getMapTile(gameServerId, parseInt(z, 10), takaroX, takaroY);

      if (tileData) {
        // Save to disk cache
        try {
          await fs.mkdir(path.dirname(tileCachePath), { recursive: true });
          await fs.writeFile(tileCachePath, Buffer.from(tileData));
        } catch (cacheErr) {
          console.warn('Failed to cache tile:', cacheErr instanceof Error ? cacheErr.message : 'Unknown error');
        }

        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(Buffer.from(tileData));
      } else {
        res.status(204).send();
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
);

// ============== PLAYER ROUTES ==============

// Get all players (from Takaro - includes online and offline)
app.get('/api/players', requireAuth as express.RequestHandler, async (req: AuthenticatedRequest, res: Response) => {
  const { gameServerId } = req.query;

  if (!gameServerId) {
    res.status(400).json({ error: 'gameServerId required' });
    return;
  }

  try {
    const players = await req.session!.takaroClient.getPlayers(gameServerId as string);
    res.json({ data: players });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Get player inventory history (from Takaro tracking API)
app.get(
  '/api/inventory/:playerId',
  requireAuth as express.RequestHandler,
  async (req: AuthenticatedRequest, res: Response) => {
    const playerId = req.params.playerId as string;
    const { startDate, endDate } = req.query;

    try {
      const inventory = await req.session!.takaroClient.getPlayerInventoryHistory(
        playerId,
        startDate as string | undefined,
        endDate as string | undefined
      );
      res.json({ data: inventory });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
);

// Get player movement history (from Takaro tracking API)
app.get(
  '/api/player-history/:gameServerId/:playerId',
  requireAuth as express.RequestHandler,
  async (req: AuthenticatedRequest, res: Response) => {
    const { playerId } = req.params;
    const { startDate, endDate } = req.query;

    try {
      const history = await req.session!.takaroClient.getPlayerMovementHistory(
        playerId,
        startDate as string | undefined,
        endDate as string | undefined
      );
      res.json({ data: history });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
);

// Helper function to enrich tracking results with player names
async function enrichWithPlayerNames(
  takaroClient: TakaroClient,
  trackingResults: TakaroTrackingResult[]
): Promise<(TakaroTrackingResult & { playerName?: string })[]> {
  if (!trackingResults || trackingResults.length === 0) return trackingResults;

  // Get unique player IDs
  const playerIds = [...new Set(trackingResults.map((r) => r.playerId).filter(Boolean))];

  if (playerIds.length === 0) return trackingResults;

  try {
    // Fetch player info from Takaro
    const players = await takaroClient.getPlayersByIds(playerIds);

    // Create lookup map
    const playerNameMap = new Map<string, string>();
    players.forEach((p) => {
      playerNameMap.set(p.id, p.name);
    });

    // Enrich results with player names
    return trackingResults.map((r) => ({
      ...r,
      playerName: playerNameMap.get(r.playerId) || 'Unknown',
    }));
  } catch (error) {
    console.warn('Failed to fetch player names:', error instanceof Error ? error.message : 'Unknown error');
    return trackingResults;
  }
}

// Get movement paths for all players on a game server (from Takaro tracking API)
app.get(
  '/api/movement-paths',
  requireAuth as express.RequestHandler,
  async (req: AuthenticatedRequest, res: Response) => {
    const { gameServerId, startDate, endDate } = req.query;

    if (!gameServerId) {
      res.status(400).json({ error: 'gameServerId required' });
      return;
    }

    try {
      // Get all movement data from Takaro
      const results = await req.session!.takaroClient.getMovementPaths(
        gameServerId as string,
        startDate as string | undefined,
        endDate as string | undefined
      );

      // Enrich with player names
      const enrichedResults = await enrichWithPlayerNames(req.session!.takaroClient, results);

      // Group by player for path drawing
      const paths: Record<
        string,
        { name: string; points: Array<{ x: number; y: number; z: number; timestamp: string }> }
      > = {};
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
          timestamp: point.createdAt || point.timestamp || '',
        });
      }

      // Sort points by timestamp for each player
      for (const playerId in paths) {
        paths[playerId].points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      }

      res.json({ data: paths });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
);

// ============== AREA SEARCH ROUTES ==============

// Search players in bounding box
app.post(
  '/api/players/area/box',
  requireAuth as express.RequestHandler,
  async (req: AuthenticatedRequest, res: Response) => {
    const { gameServerId, minX, maxX, minY, maxY, minZ, maxZ, startDate, endDate } = req.body;

    if (!gameServerId) {
      res.status(400).json({ error: 'gameServerId required' });
      return;
    }

    if (minX === undefined || maxX === undefined || minZ === undefined || maxZ === undefined) {
      res.status(400).json({ error: 'minX, maxX, minZ, maxZ are required' });
      return;
    }

    try {
      const results = await req.session!.takaroClient.getPlayersInBox(
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
      const enrichedResults = await enrichWithPlayerNames(req.session!.takaroClient, results);

      res.json({ data: enrichedResults });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
);

// Search players in radius
app.post(
  '/api/players/area/radius',
  requireAuth as express.RequestHandler,
  async (req: AuthenticatedRequest, res: Response) => {
    const { gameServerId, x, y, z, radius, startDate, endDate } = req.body;

    if (!gameServerId) {
      res.status(400).json({ error: 'gameServerId required' });
      return;
    }

    if (x === undefined || z === undefined || radius === undefined) {
      res.status(400).json({ error: 'x, z, and radius are required' });
      return;
    }

    try {
      const results = await req.session!.takaroClient.getPlayersInRadius(
        gameServerId,
        x,
        y ?? 0,
        z,
        radius,
        startDate,
        endDate
      );

      // Enrich with player names from Takaro
      const enrichedResults = await enrichWithPlayerNames(req.session!.takaroClient, results);

      res.json({ data: enrichedResults });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
);

// ============== ITEM SEARCH ROUTES ==============

// Get items for a game server (for dropdown/autocomplete)
app.get('/api/items', requireAuth as express.RequestHandler, async (req: AuthenticatedRequest, res: Response) => {
  const { gameServerId, search } = req.query;

  if (!gameServerId) {
    res.status(400).json({ error: 'gameServerId required' });
    return;
  }

  try {
    const items = await req.session!.takaroClient.getItems(gameServerId as string, (search as string) || null);
    res.json({ data: items });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Search players by item (who has/had a specific item)
app.post(
  '/api/players/item',
  requireAuth as express.RequestHandler,
  async (req: AuthenticatedRequest, res: Response) => {
    const { itemId, startDate, endDate } = req.body;

    console.log('  🔍 Item search:', { itemId, startDate, endDate });

    if (!itemId) {
      res.status(400).json({ error: 'itemId is required' });
      return;
    }

    try {
      const results = await req.session!.takaroClient.getPlayersByItem(itemId, startDate, endDate);

      // Enrich with player names from Takaro
      const enrichedResults = await enrichWithPlayerNames(req.session!.takaroClient, results);

      res.json({ data: enrichedResults });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
);

// ============== START SERVER ==============

async function startServer(): Promise<void> {
  // Initialize cache (Redis or fallback to memory)
  await cache.connect();

  // Initialize service client (auto-login)
  await initServiceClient();

  // If service mode is active, create the service session
  if (isServiceMode()) {
    const domain = process.env.TAKARO_DOMAIN || null;

    // Create a TakaroClient wrapper that uses the service client
    const takaroClient = createTakaroClient(domain);
    takaroClient.useServiceClient();

    serviceSession = {
      domain,
      takaroClient,
      createdAt: new Date(),
    };

    console.log('Service mode active - no login required');
  } else if (isCookieMode()) {
    console.log('Cookie mode active - users must be logged into Takaro');
    console.log('Sessions will be validated via forwarded cookies');
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
