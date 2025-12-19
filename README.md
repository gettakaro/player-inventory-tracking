# Takaro 7D2D Player Map

A standalone web application for 7 Days to Die server admins to visualize player positions on their game map, with movement history tracking and playback.

## Features

- **Interactive Map**: View your 7D2D server map with Leaflet.js
- **Real-time Player Tracking**: See online player positions with 30-second updates
- **Offline Player Positions**: View last known positions of offline players
- **Movement History**: Track and visualize player movement paths over time
- **History Playback**: Animate player movements with play/pause controls
- **Time-based Filtering**: Filter movement data by time range (1h, 6h, 24h, 1 week)
- **Multi-Server Support**: Save configurations for multiple 7D2D servers

## Requirements

- Node.js 18+
- A Takaro account with connected 7D2D server
- 7D2D server with web API enabled (Alloc's fixes for A20 and below, or native A21+)

## Installation

1. Clone or download this repository:
   ```bash
   cd takaro-player-map
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open http://localhost:3000 in your browser

## Configuration

### Takaro Credentials

1. Enter your Takaro domain (e.g., if your dashboard is at `myserver.takaro.io`, enter `myserver`)
2. Enter your Takaro email and password
3. Select your 7D2D game server from the dropdown

### 7D2D Web API Connection

You need to configure the connection to your 7D2D server's web API:

1. **Host**: Your 7D2D server IP address or hostname
2. **Port**: The web API port (default: 8082, check your server startup logs)
3. **Token Name**: A web token name configured on your server
4. **Token Secret**: The corresponding token secret
5. **World Size**: Optional - defaults to 8192, change if your world is different

#### Creating Web Tokens on Your 7D2D Server

SSH into your server and run these console commands:

```bash
# List existing tokens
webtokens list

# Create a new token
webtokens add <name> <secret> 0
```

Example:
```bash
webtokens add takaro_map MySecureToken123! 0
```

The `0` at the end grants full permissions. Use a strong, unique token secret.

## Usage

### Viewing Players

- **Green markers**: Online players
- **Gray markers**: Offline players (last known position)
- Click a marker to see player details

### Movement History

1. Check the "Movement Paths" checkbox to display paths
2. Use the time range dropdown to adjust how much history to show
3. Each player's path is shown in a different color

### History Playback

1. Click "Playback" to enter playback mode
2. Use play/pause to animate player movements
3. Drag the slider to jump to a specific time
4. Adjust playback speed (1x, 2x, 5x, 10x)
5. Click X to exit playback mode

## Architecture

```
┌─────────────────────────────────────────┐
│           Browser (Frontend)            │
│  HTML/CSS/JS - Leaflet.js via CDN       │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Node.js Backend (Express)       │
├─────────────────────────────────────────┤
│ • Session management                    │
│ • Proxy Takaro API (player data)        │
│ • Proxy 7D2D API (map tiles)            │
│ • Position history storage (SQLite)     │
│ • Periodic position polling (30s)       │
└─────────────────────────────────────────┘
        │                   │
        ▼                   ▼
┌───────────────┐  ┌────────────────────┐
│  Takaro API   │  │  7D2D Server API   │
└───────────────┘  └────────────────────┘
```

## Data Storage

- Position history is stored in a local SQLite database
- Data older than 7 days is automatically cleaned up
- Database location: `data/playermap.db`

## API Endpoints

### Authentication
- `POST /api/login` - Login with Takaro credentials
- `POST /api/logout` - Logout and clear session

### Configuration
- `GET /api/gameservers` - List available game servers
- `POST /api/sdtd-config` - Save 7D2D connection config
- `GET /api/sdtd-configs` - List saved configs

### Players
- `GET /api/players?gameServerId=xxx` - Get current players from Takaro
- `GET /api/all-players?gameServerId=xxx` - Get all players including offline

### Map
- `GET /api/map-info/:gameServerId` - Get map configuration
- `GET /api/map/:gameServerId/:z/:x/:y.png` - Get map tile (proxied)

### History
- `GET /api/player-history/:playerId` - Get position history for a player
- `GET /api/movement-paths?gameServerId=xxx` - Get movement paths for all players

### Tracking
- `POST /api/tracking/start` - Start position tracking
- `POST /api/tracking/stop` - Stop position tracking
- `POST /api/tracking/refresh` - Force immediate refresh

## Troubleshooting

### Map tiles not loading
- Verify your 7D2D server has the web API enabled
- Check the host and port are correct
- Ensure your web token has map access permissions
- Check server firewall allows connections on the web API port

### Players not showing
- Verify Takaro can see your players (check Takaro dashboard)
- Ensure tracking has started (check browser console)
- Make sure players have valid coordinates in-game

### Connection errors
- Check your Takaro domain is correct
- Verify your email/password
- Ensure your Takaro account has access to the game server

## Development

Run with auto-reload:
```bash
npm run dev
```

## License

MIT

## Credits

- Uses [Leaflet.js](https://leafletjs.com/) for map rendering
- Built for [Takaro](https://takaro.io/) game server management platform
- Inspired by the [Takaro Inventory Tracking](https://github.com/mad-001/Takaro-Inventory-Tracking) project
