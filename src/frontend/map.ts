// Leaflet map setup with 7D2D coordinate system

import type { MapInfo } from './types.js';

declare const L: typeof import('leaflet');

// Extend L.CRS for custom scaling
interface CustomCRS extends L.CRS {
  scale: (zoom: number) => number;
  zoom: (scale: number) => number;
}

// Custom CRS with proper scaling for 7D2D tile system
// At zoom 4: scale = 128 (1 tile = 1 lat/lng unit)
// At zoom 0: scale = 8 (1 tile = 16 lat/lng units)
const SDTD_CRS: CustomCRS = L.extend({}, L.CRS.Simple, {
  scale: (zoom: number): number => {
    return 2 ** (zoom + 3); // zoom 0 = 8, zoom 4 = 128
  },
  zoom: (scale: number): number => Math.log(scale) / Math.LN2 - 3,
}) as CustomCRS;

// Custom GridLayer for 7D2D that handles centered coordinate system
interface SDTDGridLayerOptions extends L.GridLayerOptions {
  baseUrl: string;
}

const SDTDGridLayer = L.GridLayer.extend({
  createTile: function (
    this: L.GridLayer & { options: SDTDGridLayerOptions },
    coords: L.Coords,
    done: L.DoneCallback
  ): HTMLImageElement {
    const tile = document.createElement('img');

    // Convert Leaflet tile coords to Takaro/7D2D tile coords
    // Takaro uses centered coordinates where (0,0) is world center
    // Y axis is flipped between Leaflet and 7D2D
    const x = coords.x;
    const y = -coords.y - 1;

    const url = this.options.baseUrl
      .replace('{z}', String(coords.z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));

    // Retry logic for failed tiles
    let retries = 0;
    const maxRetries = 3;
    const baseDelay = 500;

    const loadTile = () => {
      tile.onload = () => done(undefined, tile);
      tile.onerror = () => {
        if (retries < maxRetries) {
          retries++;
          const delay = baseDelay * 2 ** (retries - 1);
          setTimeout(loadTile, delay);
        } else {
          tile.src = '';
          done(undefined, tile);
        }
      };
      tile.crossOrigin = 'use-credentials';
      tile.src = retries > 0 ? `${url}?retry=${retries}` : url;
    };

    loadTile();
    return tile;
  },
});

const createSDTDGridLayer = (options: SDTDGridLayerOptions): L.GridLayer => new SDTDGridLayer(options);

export const GameMap = {
  map: null as L.Map | null,
  tileLayer: null as L.GridLayer | null,
  gameServerId: null as string | null,
  worldSize: 6144,
  maxZoom: 4,
  tileSize: 128,
  // Event handler references for cleanup
  _handleMouseMove: null as ((e: L.LeafletMouseEvent) => void) | null,
  _handleMoveEnd: null as (() => void) | null,
  _handleZoomEnd: null as (() => void) | null,
  _gridLayer: null as L.Polyline | null,

  // 7D2D coordinate conversion
  gameToLatLng(x: number, z: number): L.LatLng {
    // Convert game coords to lat/lng (scaled to tile system)
    return L.latLng(z / this.tileSize, x / this.tileSize);
  },

  latLngToGame(latlng: L.LatLng): { x: number; z: number } {
    return {
      x: Math.round(latlng.lng * this.tileSize),
      z: Math.round(latlng.lat * this.tileSize),
    };
  },

  async init(gameServerId: string): Promise<L.Map> {
    this.gameServerId = gameServerId;

    // Get map info from 7D2D server
    let mapEnabled = true;
    try {
      const mapInfo: MapInfo = await window.API.getMapInfo(gameServerId);
      this.worldSize = mapInfo.worldSize || 6144;
      this.maxZoom = mapInfo.maxZoom || 4;
      mapEnabled = (mapInfo as { enabled?: boolean }).enabled !== false;
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

    // Add custom tile layer for 7D2D (cookies handle auth, no session param needed)
    const tileUrl = window.API.getMapTileUrl(gameServerId);
    this.tileLayer = createSDTDGridLayer({
      baseUrl: tileUrl,
      tileSize: this.tileSize,
      minZoom: 0,
      maxZoom: this.maxZoom + 2,
      maxNativeZoom: this.maxZoom,
      bounds: bounds,
      noWrap: true,
      keepBuffer: 2,
    } as SDTDGridLayerOptions);

    this.tileLayer.addTo(this.map);

    // Show warning if map tiles are disabled
    if (!mapEnabled) {
      console.warn('Map tiles are disabled for this game server');
      const warningDiv = document.createElement('div');
      warningDiv.className = 'map-warning';
      warningDiv.innerHTML = `
        <strong>Map tiles not available</strong><br>
        <small>Map rendering is disabled for this server in Takaro settings.</small>
      `;
      warningDiv.style.cssText = `
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8); color: #ff9800; padding: 20px; border-radius: 8px;
        text-align: center; z-index: 1000; pointer-events: none;
      `;
      document.getElementById('map')?.appendChild(warningDiv);
    }

    // Add grid overlay (optional)
    this.addGridLayer();

    // Add coordinate display on mouse move
    this._handleMouseMove = (e: L.LeafletMouseEvent) => {
      const coords = this.latLngToGame(e.latlng);
      const cursorEl = document.getElementById('cursor-coords');
      if (cursorEl) {
        cursorEl.textContent = `X: ${coords.x}, Z: ${coords.z}`;
      }
    };
    this.map.on('mousemove', this._handleMouseMove);

    // Save map state on view change
    this._handleMoveEnd = () => {
      this.saveState();
    };
    this.map.on('moveend', this._handleMoveEnd);

    // Restore saved state
    this.restoreState();

    return this.map;
  },

  addGridLayer(): void {
    if (!this.map) return;

    // Add grid lines every 500 blocks
    const gridSize = 500;
    const halfWorld = this.worldSize / 2;

    const gridLines: L.LatLngExpression[][] = [];

    // Vertical lines
    for (let x = -halfWorld; x <= halfWorld; x += gridSize) {
      gridLines.push([this.gameToLatLng(x, -halfWorld), this.gameToLatLng(x, halfWorld)]);
    }

    // Horizontal lines
    for (let z = -halfWorld; z <= halfWorld; z += gridSize) {
      gridLines.push([this.gameToLatLng(-halfWorld, z), this.gameToLatLng(halfWorld, z)]);
    }

    this._gridLayer = L.polyline(gridLines, {
      color: 'rgba(255, 255, 255, 0.1)',
      weight: 1,
      interactive: false,
    });

    const map = this.map;
    const gridLayer = this._gridLayer;

    // Only show grid at lower zoom levels
    this._handleZoomEnd = () => {
      if (map.getZoom() < 3) {
        gridLayer.addTo(map);
      } else {
        gridLayer.remove();
      }
    };
    map.on('zoomend', this._handleZoomEnd);

    // Initially add if zoomed out
    if (map.getZoom() < 3) {
      gridLayer.addTo(map);
    }
  },

  saveState(): void {
    if (!this.map || !this.gameServerId) return;

    const state = {
      center: this.map.getCenter(),
      zoom: this.map.getZoom(),
    };

    localStorage.setItem(`mapState_${this.gameServerId}`, JSON.stringify(state));
  },

  restoreState(): void {
    if (!this.map || !this.gameServerId) return;

    try {
      const saved = localStorage.getItem(`mapState_${this.gameServerId}`);
      if (saved) {
        const state = JSON.parse(saved) as { center: L.LatLngLiteral; zoom: number };
        this.map.setView(state.center, state.zoom);
      }
    } catch (error) {
      console.warn('Could not restore map state:', error);
    }
  },

  destroy(): void {
    if (this.map) {
      // Unbind event listeners to prevent memory leaks
      if (this._handleMouseMove) {
        this.map.off('mousemove', this._handleMouseMove);
        this._handleMouseMove = null;
      }
      if (this._handleMoveEnd) {
        this.map.off('moveend', this._handleMoveEnd);
        this._handleMoveEnd = null;
      }
      if (this._handleZoomEnd) {
        this.map.off('zoomend', this._handleZoomEnd);
        this._handleZoomEnd = null;
      }
      if (this._gridLayer) {
        this._gridLayer.remove();
        this._gridLayer = null;
      }
      this.map.remove();
      this.map = null;
      this.tileLayer = null;
    }
  },

  refresh(): void {
    if (this.tileLayer) {
      this.tileLayer.redraw();
    }
  },
};

window.GameMap = GameMap;
