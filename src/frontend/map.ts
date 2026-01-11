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

    tile.onload = () => done(undefined, tile);
    tile.onerror = () => {
      tile.src = '';
      done(undefined, tile);
    };
    tile.crossOrigin = 'use-credentials';
    tile.src = url;

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
    try {
      const mapInfo: MapInfo = await window.API.getMapInfo(gameServerId);
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

    // Add grid overlay (optional)
    this.addGridLayer();

    // Add coordinate display on mouse move
    this.map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const coords = this.latLngToGame(e.latlng);
      const cursorEl = document.getElementById('cursor-coords');
      if (cursorEl) {
        cursorEl.textContent = `X: ${coords.x}, Z: ${coords.z}`;
      }
    });

    // Save map state on view change
    this.map.on('moveend', () => {
      this.saveState();
    });

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

    const gridLayer = L.polyline(gridLines, {
      color: 'rgba(255, 255, 255, 0.1)',
      weight: 1,
      interactive: false,
    });

    const map = this.map;

    // Only show grid at lower zoom levels
    map.on('zoomend', () => {
      if (map.getZoom() < 3) {
        gridLayer.addTo(map);
      } else {
        gridLayer.remove();
      }
    });

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
