// Heatmap visualization module

import type { MovementPath } from './types.js';

declare const L: typeof import('leaflet');

// Extend Leaflet for heatLayer plugin
declare module 'leaflet' {
  function heatLayer(latlngs: Array<[number, number, number?]>, options?: HeatLayerOptions): HeatLayer;

  interface HeatLayerOptions {
    radius?: number;
    blur?: number;
    maxZoom?: number;
    gradient?: Record<number, string>;
  }

  interface HeatLayer extends L.Layer {
    setOptions(options: HeatLayerOptions): this;
    addLatLng(latlng: L.LatLngExpression): this;
    setLatLngs(latlngs: Array<[number, number, number?]>): this;
  }
}

interface HeatmapConfig {
  radius: number;
  blur: number;
  maxZoom: number;
  gradient: Record<number, string>;
}

interface HeatmapModule {
  layer: L.HeatLayer | null;
  isVisible: boolean;
  filterBySelection: boolean;
  gameServerId: string | null;
  config: HeatmapConfig;

  init(gameServerId: string): void;
  setupEventListeners(): void;
  setVisible(visible: boolean): void;
  setFilterBySelection(enabled: boolean): void;
  setRadius(radius: number): void;
  setBlur(blur: number): void;
  clear(): void;
  refresh(): void;
  generateActivityData(): Array<[number, number, number]>;
  onPlayerSelectionChanged(): void;
  onTimeRangeChanged(): void;
}

export const Heatmap: HeatmapModule = {
  layer: null,
  isVisible: false,
  filterBySelection: false,
  gameServerId: null,

  // Configuration
  config: {
    radius: 25,
    blur: 15,
    maxZoom: 4,
    gradient: {
      0.4: 'blue',
      0.6: 'cyan',
      0.7: 'lime',
      0.8: 'yellow',
      1.0: 'red',
    },
  },

  init(gameServerId: string): void {
    this.gameServerId = gameServerId;
    this.setupEventListeners();
  },

  setupEventListeners(): void {
    // Heatmap toggle
    const showHeatmap = document.getElementById('show-heatmap') as HTMLInputElement | null;
    if (showHeatmap) {
      showHeatmap.addEventListener('change', (e) => {
        this.setVisible((e.target as HTMLInputElement).checked);
      });
    }

    // Filter by selection toggle
    const filterSelection = document.getElementById('heatmap-filter-selection') as HTMLInputElement | null;
    if (filterSelection) {
      filterSelection.addEventListener('change', (e) => {
        this.setFilterBySelection((e.target as HTMLInputElement).checked);
      });
    }

    // Radius slider
    const radiusSlider = document.getElementById('heatmap-radius') as HTMLInputElement | null;
    if (radiusSlider) {
      radiusSlider.addEventListener('input', (e) => {
        this.setRadius(parseInt((e.target as HTMLInputElement).value, 10));
      });
    }

    // Blur slider
    const blurSlider = document.getElementById('heatmap-blur') as HTMLInputElement | null;
    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        this.setBlur(parseInt((e.target as HTMLInputElement).value, 10));
      });
    }
  },

  setVisible(visible: boolean): void {
    this.isVisible = visible;

    // Show/hide settings
    const settings = document.getElementById('heatmap-settings');
    if (settings) {
      settings.style.display = visible ? 'flex' : 'none';
    }

    // Show/hide filter toggle
    const filterToggle = document.querySelector('.heatmap-filter-toggle') as HTMLElement | null;
    if (filterToggle) {
      filterToggle.style.display = visible ? 'inline-flex' : 'none';
    }

    if (visible) {
      this.refresh();
    } else {
      this.clear();
    }
  },

  setFilterBySelection(enabled: boolean): void {
    this.filterBySelection = enabled;
    if (this.isVisible) {
      this.refresh();
    }
  },

  setRadius(radius: number): void {
    this.config.radius = radius;
    if (this.layer) {
      this.layer.setOptions({ radius });
    }
  },

  setBlur(blur: number): void {
    this.config.blur = blur;
    if (this.layer) {
      this.layer.setOptions({ blur });
    }
  },

  clear(): void {
    if (this.layer) {
      this.layer.remove();
      this.layer = null;
    }
  },

  refresh(): void {
    if (!this.isVisible || !window.GameMap.map) return;

    this.clear();

    const points = this.generateActivityData();

    if (points.length === 0) {
      console.log('No heatmap data available');
      return;
    }

    // Create heatmap layer
    this.layer = L.heatLayer(points, {
      radius: this.config.radius,
      blur: this.config.blur,
      maxZoom: this.config.maxZoom,
      gradient: this.config.gradient,
    });

    this.layer.addTo(window.GameMap.map);
  },

  // Generate activity heatmap from movement history
  generateActivityData(): Array<[number, number, number]> {
    if (!window.History?.paths || Object.keys(window.History.paths).length === 0) {
      return [];
    }

    const points: Array<[number, number, number]> = [];
    const selectedPlayers = window.PlayerList ? window.PlayerList.selectedPlayers : null;

    for (const [playerId, data] of Object.entries(window.History.paths) as Array<[string, MovementPath]>) {
      if (!data.points || data.points.length === 0) continue;

      // Filter by selection if enabled
      if (this.filterBySelection && selectedPlayers && selectedPlayers.size > 0) {
        if (!selectedPlayers.has(String(playerId))) continue;
      }

      for (const point of data.points) {
        const latlng = window.GameMap.gameToLatLng(point.x, point.z);
        // Each point has equal intensity of 1.0
        points.push([latlng.lat, latlng.lng, 1.0]);
      }
    }

    return points;
  },

  // Called when player selection changes
  onPlayerSelectionChanged(): void {
    if (this.isVisible && this.filterBySelection) {
      this.refresh();
    }
  },

  // Called when time range changes
  onTimeRangeChanged(): void {
    if (this.isVisible) {
      this.refresh();
    }
  },
};

window.Heatmap = Heatmap;
