// Leaflet map setup with 7D2D coordinate system

// Custom CRS with proper scaling for 7D2D tile system
// At zoom 4: scale = 128 (1 tile = 1 lat/lng unit)
// At zoom 0: scale = 8 (1 tile = 16 lat/lng units)
const SDTD_CRS = L.extend({}, L.CRS.Simple, {
  scale: (zoom) => {
    return 2 ** (zoom + 3); // zoom 0 = 8, zoom 4 = 128
  },
  zoom: (scale) => Math.log(scale) / Math.LN2 - 3,
});

// Custom GridLayer for 7D2D that handles centered coordinate system
L.GridLayer.SDTD = L.GridLayer.extend({
  createTile: function (coords, done) {
    const tile = document.createElement('img');

    // Convert Leaflet tile coords to Takaro/7D2D tile coords
    // Takaro uses centered coordinates where (0,0) is world center
    // Y axis is flipped between Leaflet and 7D2D
    const x = coords.x;
    const y = -coords.y - 1;

    const url = this.options.baseUrl.replace('{z}', coords.z).replace('{x}', x).replace('{y}', y);

    console.log(`Tile: z=${coords.z} leaflet(${coords.x},${coords.y}) -> 7d2d(${x},${y})`);

    tile.onload = () => done(null, tile);
    tile.onerror = () => {
      tile.src = '';
      done(null, tile);
    };
    tile.crossOrigin = 'anonymous';
    tile.src = url;

    return tile;
  },
});

L.gridLayer.sdtd = (options) => new L.GridLayer.SDTD(options);

const GameMap = {
  map: null,
  tileLayer: null,
  gameServerId: null,
  worldSize: 6144,
  maxZoom: 4,
  tileSize: 128,

  // 7D2D coordinate conversion
  gameToLatLng(x, z) {
    // Convert game coords to lat/lng (scaled to tile system)
    return L.latLng(z / this.tileSize, x / this.tileSize);
  },

  latLngToGame(latlng) {
    return {
      x: Math.round(latlng.lng * this.tileSize),
      z: Math.round(latlng.lat * this.tileSize),
    };
  },

  async init(gameServerId) {
    this.gameServerId = gameServerId;

    // Get map info from 7D2D server
    try {
      const mapInfo = await API.getMapInfo(gameServerId);
      this.worldSize = mapInfo.worldSize || 6144;
      this.maxZoom = mapInfo.maxZoom || 4;
    } catch (error) {
      console.warn('Could not get map info, using defaults:', error);
    }

    // Calculate bounds in tile coordinates
    const halfTiles = this.worldSize / this.tileSize / 2;
    const bounds = L.latLngBounds(L.latLng(-halfTiles, -halfTiles), L.latLng(halfTiles, halfTiles));

    // Initialize map with custom CRS for proper tile scaling
    this.map = L.map('map', {
      crs: SDTD_CRS,
      minZoom: 0,
      maxZoom: this.maxZoom + 2,
      maxBounds: bounds.pad(0.5),
      maxBoundsViscosity: 1.0,
    });

    // Set initial view to center (0,0 in tile coords)
    this.map.setView([0, 0], 0);

    // Add custom tile layer for 7D2D
    const tileUrl = `${API.getMapTileUrl(gameServerId)}?session=${API.getSession()}`;
    this.tileLayer = L.gridLayer.sdtd({
      baseUrl: tileUrl,
      tileSize: this.tileSize,
      minZoom: 0,
      maxZoom: this.maxZoom + 2,
      maxNativeZoom: this.maxZoom,
      bounds: bounds,
      noWrap: true,
      keepBuffer: 2,
    });

    this.tileLayer.addTo(this.map);

    // Add grid overlay (optional)
    this.addGridLayer();

    // Add coordinate display on mouse move
    this.map.on('mousemove', (e) => {
      const coords = this.latLngToGame(e.latlng);
      document.getElementById('cursor-coords').textContent = `X: ${coords.x}, Z: ${coords.z}`;
    });

    // Save map state on view change
    this.map.on('moveend', () => {
      this.saveState();
    });

    // Restore saved state
    this.restoreState();

    return this.map;
  },

  addGridLayer() {
    // Add grid lines every 500 blocks
    const gridSize = 500;
    const halfWorld = this.worldSize / 2;

    const gridLines = [];

    // Vertical lines
    for (let x = -halfWorld; x <= halfWorld; x += gridSize) {
      gridLines.push([this.gameToLatLng(x, -halfWorld), this.gameToLatLng(x, halfWorld)]);
    }

    // Horizontal lines
    for (let z = -halfWorld; z <= halfWorld; z += gridSize) {
      gridLines.push([this.gameToLatLng(-halfWorld, z), this.gameToLatLng(halfWorld, z)]);
    }

    const gridLayer = L.polyline(gridLines, {
      color: 'rgba(255, 255, 255, 0.1)',
      weight: 1,
      interactive: false,
    });

    // Only show grid at lower zoom levels
    this.map.on('zoomend', () => {
      if (this.map.getZoom() < 3) {
        gridLayer.addTo(this.map);
      } else {
        gridLayer.remove();
      }
    });

    // Initially add if zoomed out
    if (this.map.getZoom() < 3) {
      gridLayer.addTo(this.map);
    }
  },

  saveState() {
    if (!this.map || !this.gameServerId) return;

    const state = {
      center: this.map.getCenter(),
      zoom: this.map.getZoom(),
    };

    localStorage.setItem(`mapState_${this.gameServerId}`, JSON.stringify(state));
  },

  restoreState() {
    if (!this.map || !this.gameServerId) return;

    try {
      const saved = localStorage.getItem(`mapState_${this.gameServerId}`);
      if (saved) {
        const state = JSON.parse(saved);
        this.map.setView(state.center, state.zoom);
      }
    } catch (error) {
      console.warn('Could not restore map state:', error);
    }
  },

  destroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.tileLayer = null;
    }
  },

  refresh() {
    if (this.tileLayer) {
      this.tileLayer.redraw();
    }
  },
};

window.GameMap = GameMap;
