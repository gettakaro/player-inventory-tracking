// Area Search Module - Draw shapes to search for players in an area

const AreaSearch = {
  map: null,
  drawnItems: null,
  resultsLayer: null,
  currentShape: null,
  drawingEnabled: false,
  currentDrawHandler: null,
  gameServerId: null,
  onSearchComplete: null,

  init(map, gameServerId, onSearchComplete) {
    this.map = map;
    this.gameServerId = gameServerId;
    this.onSearchComplete = onSearchComplete;
    this.drawnItems = new L.FeatureGroup();
    this.resultsLayer = new L.FeatureGroup();
    map.addLayer(this.drawnItems);
    map.addLayer(this.resultsLayer);

    // Handle draw events
    map.on(L.Draw.Event.CREATED, (e) => this.onShapeCreated(e));
  },

  startDrawRectangle() {
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

  startDrawCircle() {
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

  cancelDrawing() {
    if (this.currentDrawHandler) {
      this.currentDrawHandler.disable();
      this.currentDrawHandler = null;
    }
    this.drawingEnabled = false;
  },

  async onShapeCreated(e) {
    // Clear previous shape
    this.drawnItems.clearLayers();
    this.currentShape = e.layer;
    this.drawnItems.addLayer(e.layer);

    // Disable drawing mode
    this.cancelDrawing();

    // Enable search button
    document.getElementById('area-search-btn').disabled = false;
    this.updateButtonStates();

    // Auto-trigger search
    await this.triggerSearch();
  },

  async triggerSearch() {
    if (!this.gameServerId || !this.currentShape) return;

    const { start, end } = TimeRange.getDateRange();
    const results = await this.search(this.gameServerId, start.toISOString(), end.toISOString());

    if (this.onSearchComplete) {
      this.onSearchComplete(results);
    }
  },

  async search(gameServerId, startDate, endDate) {
    if (!this.currentShape) {
      console.warn('No shape drawn');
      return [];
    }

    // Clear previous results
    this.resultsLayer.clearLayers();

    let results;
    const formattedStartDate = startDate ? new Date(startDate).toISOString() : null;
    const formattedEndDate = endDate ? new Date(endDate).toISOString() : null;

    try {
      if (this.currentShape instanceof L.Rectangle) {
        const bounds = this.currentShape.getBounds();
        const sw = GameMap.latLngToGame(bounds.getSouthWest());
        const ne = GameMap.latLngToGame(bounds.getNorthEast());

        results = await API.getPlayersInBox(
          gameServerId,
          {
            minX: Math.min(sw.x, ne.x),
            maxX: Math.max(sw.x, ne.x),
            minZ: Math.min(sw.z, ne.z),
            maxZ: Math.max(sw.z, ne.z),
          },
          formattedStartDate,
          formattedEndDate
        );
      } else if (this.currentShape instanceof L.Circle) {
        const center = GameMap.latLngToGame(this.currentShape.getLatLng());
        // Convert radius from lat/lng units to game units
        const radiusLatLng = this.currentShape.getRadius();
        const radiusGame = radiusLatLng * GameMap.tileSize;

        results = await API.getPlayersInRadius(gameServerId, center, radiusGame, formattedStartDate, formattedEndDate);
      }

      this.displayResults(results || []);
      return results || [];
    } catch (error) {
      console.error('Area search failed:', error);
      alert(`Area search failed: ${error.message}`);
      return [];
    }
  },

  displayResults(players) {
    // Clear previous results markers
    this.resultsLayer.clearLayers();

    // No longer show separate popup panel - results handled via callback to PlayerList
    // Just return the players for the callback to process
    return players;
  },

  clear() {
    this.cancelDrawing();
    this.drawnItems.clearLayers();
    this.resultsLayer.clearLayers();
    this.currentShape = null;

    document.getElementById('area-search-btn').disabled = true;

    this.updateButtonStates();

    // Also clear player list filter
    if (window.PlayerList) {
      PlayerList.clearAreaFilter();
    }
  },

  updateButtonStates() {
    const rectBtn = document.getElementById('draw-rect-btn');
    const circleBtn = document.getElementById('draw-circle-btn');
    const searchBtn = document.getElementById('area-search-btn');

    // Highlight active drawing mode
    rectBtn.classList.toggle('active', this.drawingEnabled && this.currentDrawHandler instanceof L.Draw.Rectangle);
    circleBtn.classList.toggle('active', this.drawingEnabled && this.currentDrawHandler instanceof L.Draw.Circle);

    // Enable search if shape is drawn
    searchBtn.disabled = !this.currentShape;
  },
};

window.AreaSearch = AreaSearch;
