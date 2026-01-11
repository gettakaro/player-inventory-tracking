// Area Search Module - Draw shapes to search for players in an area

import type { AreaSearchResult } from './types.js';

declare const L: typeof import('leaflet');

interface BoundingBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface GameCoordinates {
  x: number;
  z: number;
}

export const AreaSearch = {
  map: null as L.Map | null,
  drawnItems: null as L.FeatureGroup | null,
  resultsLayer: null as L.FeatureGroup | null,
  currentShape: null as L.Rectangle | L.Circle | null,
  closeButton: null as L.Marker | null,
  drawingEnabled: false,
  currentDrawHandler: null as L.Draw.Rectangle | L.Draw.Circle | null,
  gameServerId: null as string | null,
  onSearchComplete: null as ((results: AreaSearchResult[]) => void) | null,

  init(map: L.Map, gameServerId: string, onSearchComplete: (results: AreaSearchResult[]) => void): void {
    this.map = map;
    this.gameServerId = gameServerId;
    this.onSearchComplete = onSearchComplete;
    this.drawnItems = new L.FeatureGroup();
    this.resultsLayer = new L.FeatureGroup();
    map.addLayer(this.drawnItems);
    map.addLayer(this.resultsLayer);

    // Handle draw events
    map.on(L.Draw.Event.CREATED, (e: L.DrawEvents.Created) => this.onShapeCreated(e));
  },

  startDrawRectangle(): void {
    if (!this.map) return;

    this.cancelDrawing();
    this.currentDrawHandler = new L.Draw.Rectangle(this.map, {
      shapeOptions: {
        color: '#ff7800',
        weight: 2,
        fillOpacity: 0.2,
      },
    });
    this.currentDrawHandler.enable();
    this.drawingEnabled = true;
    this.updateButtonStates();
  },

  startDrawCircle(): void {
    if (!this.map) return;

    this.cancelDrawing();
    this.currentDrawHandler = new L.Draw.Circle(this.map, {
      shapeOptions: {
        color: '#ff7800',
        weight: 2,
        fillOpacity: 0.2,
      },
    });
    this.currentDrawHandler.enable();
    this.drawingEnabled = true;
    this.updateButtonStates();
  },

  cancelDrawing(): void {
    if (this.currentDrawHandler) {
      this.currentDrawHandler.disable();
      this.currentDrawHandler = null;
    }
    this.drawingEnabled = false;
  },

  async onShapeCreated(e: L.DrawEvents.Created): Promise<void> {
    if (!this.drawnItems) return;

    // Clear previous shape
    this.drawnItems.clearLayers();
    this.currentShape = e.layer as L.Rectangle | L.Circle;
    this.drawnItems.addLayer(e.layer);

    // Add close button at top-right corner of shape
    const bounds = e.layer.getBounds();
    this.closeButton = L.marker(bounds.getNorthEast(), {
      icon: L.divIcon({
        className: 'shape-close-btn-container',
        html: '<button class="shape-close-btn" title="Remove area">✕</button>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).addTo(this.drawnItems);

    // Attach click handler to close button
    const element = this.closeButton.getElement();
    if (element) {
      element.addEventListener('click', (evt: MouseEvent) => {
        evt.stopPropagation();
        this.clear();
      });
    }

    // Disable drawing mode
    this.cancelDrawing();
    this.updateButtonStates();

    // Auto-trigger search
    await this.triggerSearch();
  },

  async triggerSearch(): Promise<void> {
    if (!this.gameServerId || !this.currentShape) return;

    const { start, end } = window.TimeRange.getDateRange();
    const results = await this.search(this.gameServerId, start.toISOString(), end.toISOString());

    if (this.onSearchComplete) {
      this.onSearchComplete(results);
    }
  },

  async search(gameServerId: string, startDate: string | null, endDate: string | null): Promise<AreaSearchResult[]> {
    if (!this.currentShape) {
      console.warn('No shape drawn');
      return [];
    }

    // Clear previous results
    this.resultsLayer?.clearLayers();

    let results: AreaSearchResult[] | undefined;
    const formattedStartDate = startDate ? new Date(startDate).toISOString() : null;
    const formattedEndDate = endDate ? new Date(endDate).toISOString() : null;

    try {
      if (this.currentShape instanceof L.Rectangle) {
        const bounds = this.currentShape.getBounds();
        const sw: GameCoordinates = window.GameMap.latLngToGame(bounds.getSouthWest());
        const ne: GameCoordinates = window.GameMap.latLngToGame(bounds.getNorthEast());

        const box: BoundingBox = {
          minX: Math.min(sw.x, ne.x),
          maxX: Math.max(sw.x, ne.x),
          minZ: Math.min(sw.z, ne.z),
          maxZ: Math.max(sw.z, ne.z),
        };

        results = await window.API.getPlayersInBox(gameServerId, box, formattedStartDate, formattedEndDate);
      } else if (this.currentShape instanceof L.Circle) {
        const center: GameCoordinates = window.GameMap.latLngToGame(this.currentShape.getLatLng());
        // Convert radius from lat/lng units to game units
        const radiusLatLng = this.currentShape.getRadius();
        const radiusGame = radiusLatLng * window.GameMap.tileSize;

        results = await window.API.getPlayersInRadius(
          gameServerId,
          center,
          radiusGame,
          formattedStartDate,
          formattedEndDate
        );
      }

      this.displayResults(results || []);
      return results || [];
    } catch (error) {
      console.error('Area search failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Area search failed: ${errorMessage}`);
      return [];
    }
  },

  displayResults(players: AreaSearchResult[]): AreaSearchResult[] {
    // Clear previous results markers
    this.resultsLayer?.clearLayers();

    // No longer show separate popup panel - results handled via callback to PlayerList
    // Just return the players for the callback to process
    return players;
  },

  clear(): void {
    this.cancelDrawing();
    this.drawnItems?.clearLayers();
    this.resultsLayer?.clearLayers();
    this.currentShape = null;
    this.closeButton = null;

    this.updateButtonStates();

    // Also clear player list filter
    if (window.PlayerList) {
      window.PlayerList.clearAreaFilter();
    }
  },

  updateButtonStates(): void {
    const rectBtn = document.getElementById('draw-rect-btn');
    const circleBtn = document.getElementById('draw-circle-btn');

    // Highlight active drawing mode
    rectBtn?.classList.toggle('active', this.drawingEnabled && this.currentDrawHandler instanceof L.Draw.Rectangle);
    circleBtn?.classList.toggle('active', this.drawingEnabled && this.currentDrawHandler instanceof L.Draw.Circle);
  },
};

window.AreaSearch = AreaSearch;
