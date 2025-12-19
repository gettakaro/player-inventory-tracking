// Area Search Module - Draw shapes to search for players in an area

const AreaSearch = {
  map: null,
  drawnItems: null,
  resultsLayer: null,
  currentShape: null,
  drawingEnabled: false,
  currentDrawHandler: null,

  init(map) {
    this.map = map;
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
        fillOpacity: 0.2
      }
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
        fillOpacity: 0.2
      }
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

  onShapeCreated(e) {
    // Clear previous shape
    this.drawnItems.clearLayers();
    this.currentShape = e.layer;
    this.drawnItems.addLayer(e.layer);

    // Disable drawing mode
    this.cancelDrawing();

    // Enable search button
    document.getElementById('area-search-btn').disabled = false;
    this.updateButtonStates();
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

        results = await API.getPlayersInBox(gameServerId, {
          minX: Math.min(sw.x, ne.x),
          maxX: Math.max(sw.x, ne.x),
          minZ: Math.min(sw.z, ne.z),
          maxZ: Math.max(sw.z, ne.z)
        }, formattedStartDate, formattedEndDate);
      } else if (this.currentShape instanceof L.Circle) {
        const center = GameMap.latLngToGame(this.currentShape.getLatLng());
        // Convert radius from lat/lng units to game units
        const radiusLatLng = this.currentShape.getRadius();
        const radiusGame = radiusLatLng * GameMap.tileSize;

        results = await API.getPlayersInRadius(
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
      alert('Area search failed: ' + error.message);
      return [];
    }
  },

  displayResults(players) {
    // Clear previous results
    this.resultsLayer.clearLayers();

    // Show results panel
    const panel = document.getElementById('area-results-panel');
    const countEl = document.getElementById('area-results-count');
    const listEl = document.getElementById('area-results-list');

    panel.style.display = 'block';
    listEl.innerHTML = '';

    // Group players by playerId (deduplicate multiple hits)
    const playerMap = new Map();
    players.forEach(p => {
      const key = p.playerId || p.id;
      if (!playerMap.has(key)) {
        // Use playerName from API (enriched by backend)
        const name = p.playerName || p.name || 'Unknown';
        playerMap.set(key, {
          ...p,
          name: name,
          hits: 1,
          positions: [{ x: p.x, z: p.z, timestamp: p.createdAt || p.timestamp }]
        });
      } else {
        const existing = playerMap.get(key);
        existing.hits++;
        existing.positions.push({ x: p.x, z: p.z, timestamp: p.createdAt || p.timestamp });
      }
    });

    // Update count with unique players
    countEl.textContent = `${playerMap.size} player${playerMap.size !== 1 ? 's' : ''} found (${players.length} positions)`;

    // Create list items and markers
    playerMap.forEach((player, key) => {
      // Create list item
      const li = document.createElement('li');
      li.className = 'area-result-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      nameSpan.textContent = player.name;

      const hitsSpan = document.createElement('span');
      hitsSpan.className = 'player-hits';
      hitsSpan.textContent = `${player.hits} hit${player.hits !== 1 ? 's' : ''}`;

      li.appendChild(nameSpan);
      li.appendChild(hitsSpan);

      // Click to highlight on map
      li.addEventListener('click', () => this.highlightPlayer(player));

      listEl.appendChild(li);

      // Add marker for most recent position
      if (player.positions.length > 0) {
        const lastPos = player.positions[player.positions.length - 1];
        if (lastPos.x !== undefined && lastPos.z !== undefined) {
          const marker = L.circleMarker(
            GameMap.gameToLatLng(lastPos.x, lastPos.z),
            {
              radius: 6,
              fillColor: '#ff7800',
              color: '#fff',
              weight: 2,
              fillOpacity: 0.8
            }
          );

          marker.bindPopup(`
            <strong>${player.name}</strong><br>
            Position: ${Math.round(lastPos.x)}, ${Math.round(lastPos.z)}<br>
            Hits: ${player.hits}
          `);

          this.resultsLayer.addLayer(marker);
        }
      }
    });
  },

  highlightPlayer(player) {
    if (player.positions && player.positions.length > 0) {
      const lastPos = player.positions[player.positions.length - 1];
      if (lastPos.x !== undefined && lastPos.z !== undefined) {
        const latLng = GameMap.gameToLatLng(lastPos.x, lastPos.z);
        this.map.setView(latLng, Math.max(this.map.getZoom(), 3));

        // Flash effect
        this.resultsLayer.eachLayer(layer => {
          if (layer instanceof L.CircleMarker) {
            const pos = GameMap.latLngToGame(layer.getLatLng());
            if (Math.abs(pos.x - lastPos.x) < 1 && Math.abs(pos.z - lastPos.z) < 1) {
              layer.openPopup();
              layer.setStyle({ fillColor: '#ffff00' });
              setTimeout(() => layer.setStyle({ fillColor: '#ff7800' }), 1000);
            }
          }
        });
      }
    }
  },

  clear() {
    this.cancelDrawing();
    this.drawnItems.clearLayers();
    this.resultsLayer.clearLayers();
    this.currentShape = null;

    // Hide results panel
    document.getElementById('area-results-panel').style.display = 'none';
    document.getElementById('area-search-btn').disabled = true;

    this.updateButtonStates();
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
  }
};

window.AreaSearch = AreaSearch;
