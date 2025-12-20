// Heatmap visualization module

const Heatmap = {
  layer: null,
  type: 'activity',  // 'activity', 'deaths', 'realtime'
  isVisible: false,
  filterBySelection: false,
  gameServerId: null,
  deathEvents: [],

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
      1.0: 'red'
    }
  },

  init(gameServerId) {
    this.gameServerId = gameServerId;
    this.setupEventListeners();
  },

  setupEventListeners() {
    // Heatmap toggle
    const showHeatmap = document.getElementById('show-heatmap');
    if (showHeatmap) {
      showHeatmap.addEventListener('change', (e) => {
        this.setVisible(e.target.checked);
      });
    }

    // Heatmap type selector
    const heatmapType = document.getElementById('heatmap-type');
    if (heatmapType) {
      heatmapType.addEventListener('change', (e) => {
        this.setType(e.target.value);
      });
    }

    // Filter by selection toggle
    const filterSelection = document.getElementById('heatmap-filter-selection');
    if (filterSelection) {
      filterSelection.addEventListener('change', (e) => {
        this.setFilterBySelection(e.target.checked);
      });
    }

    // Radius slider
    const radiusSlider = document.getElementById('heatmap-radius');
    if (radiusSlider) {
      radiusSlider.addEventListener('input', (e) => {
        this.setRadius(parseInt(e.target.value));
      });
    }

    // Blur slider
    const blurSlider = document.getElementById('heatmap-blur');
    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        this.setBlur(parseInt(e.target.value));
      });
    }
  },

  setType(type) {
    this.type = type;
    if (this.isVisible) {
      this.refresh();
    }
  },

  setVisible(visible) {
    this.isVisible = visible;

    // Enable/disable type selector
    const typeSelect = document.getElementById('heatmap-type');
    if (typeSelect) {
      typeSelect.disabled = !visible;
    }

    // Show/hide settings
    const settings = document.getElementById('heatmap-settings');
    if (settings) {
      settings.style.display = visible ? 'flex' : 'none';
    }

    // Show/hide filter toggle
    const filterToggle = document.querySelector('.heatmap-filter-toggle');
    if (filterToggle) {
      filterToggle.style.display = visible ? 'inline-flex' : 'none';
    }

    if (visible) {
      this.refresh();
    } else {
      this.clear();
    }
  },

  setFilterBySelection(enabled) {
    this.filterBySelection = enabled;
    if (this.isVisible) {
      this.refresh();
    }
  },

  setRadius(radius) {
    this.config.radius = radius;
    if (this.layer) {
      this.layer.setOptions({ radius });
    }
  },

  setBlur(blur) {
    this.config.blur = blur;
    if (this.layer) {
      this.layer.setOptions({ blur });
    }
  },

  clear() {
    if (this.layer) {
      this.layer.remove();
      this.layer = null;
    }
  },

  async refresh() {
    if (!this.isVisible || !GameMap.map) return;

    this.clear();

    let points = [];

    switch (this.type) {
      case 'activity':
        points = this.generateActivityData();
        break;
      case 'deaths':
        points = await this.generateDeathData();
        break;
      case 'realtime':
        points = this.generateRealtimeData();
        break;
    }

    if (points.length === 0) {
      console.log('No heatmap data available for type:', this.type);
      return;
    }

    // Create heatmap layer
    this.layer = L.heatLayer(points, {
      radius: this.config.radius,
      blur: this.config.blur,
      maxZoom: this.config.maxZoom,
      gradient: this.config.gradient
    });

    this.layer.addTo(GameMap.map);
  },

  // Generate activity heatmap from movement history
  generateActivityData() {
    if (!History.paths || Object.keys(History.paths).length === 0) {
      return [];
    }

    const points = [];
    const selectedPlayers = window.PlayerList ? PlayerList.selectedPlayers : null;

    for (const [playerId, data] of Object.entries(History.paths)) {
      if (!data.points || data.points.length === 0) continue;

      // Filter by selection if enabled
      if (this.filterBySelection && selectedPlayers && selectedPlayers.size > 0) {
        if (!selectedPlayers.has(String(playerId))) continue;
      }

      for (const point of data.points) {
        const latlng = GameMap.gameToLatLng(point.x, point.z);
        // Each point has equal intensity of 1.0
        points.push([latlng.lat, latlng.lng, 1.0]);
      }
    }

    return points;
  },

  // Generate death heatmap from death events
  async generateDeathData() {
    if (!this.gameServerId) return [];

    try {
      // Load death events if not already loaded or if time range changed
      const startDate = History.startDate ? History.startDate.toISOString() : null;
      const endDate = History.endDate ? History.endDate.toISOString() : null;

      this.deathEvents = await API.getDeathEvents(this.gameServerId, startDate, endDate);
    } catch (error) {
      console.error('Failed to load death events:', error);
      return [];
    }

    if (!this.deathEvents || this.deathEvents.length === 0) {
      return [];
    }

    const points = [];
    const selectedPlayers = window.PlayerList ? PlayerList.selectedPlayers : null;

    for (const event of this.deathEvents) {
      // Extract position from event meta
      const position = event.meta?.position || event.position;
      if (!position || position.x === undefined || position.z === undefined) continue;

      // Filter by selection if enabled
      if (this.filterBySelection && selectedPlayers && selectedPlayers.size > 0) {
        const playerId = event.meta?.player?.id || event.playerId;
        if (playerId && !selectedPlayers.has(String(playerId))) continue;
      }

      const latlng = GameMap.gameToLatLng(position.x, position.z);
      // Death events have higher intensity
      points.push([latlng.lat, latlng.lng, 2.0]);
    }

    return points;
  },

  // Generate realtime heatmap from current player positions
  generateRealtimeData() {
    if (!Players.all || Players.all.length === 0) {
      return [];
    }

    const points = [];
    const selectedPlayers = window.PlayerList ? PlayerList.selectedPlayers : null;

    for (const player of Players.all) {
      if (player.x === undefined || player.z === undefined) continue;

      // Filter by selection if enabled
      if (this.filterBySelection && selectedPlayers && selectedPlayers.size > 0) {
        if (!selectedPlayers.has(String(player.playerId))) continue;
      }

      const latlng = GameMap.gameToLatLng(player.x, player.z);
      // Online players have higher intensity
      const intensity = player.online ? 2.0 : 0.5;
      points.push([latlng.lat, latlng.lng, intensity]);
    }

    return points;
  },

  // Called when player selection changes
  onPlayerSelectionChanged() {
    if (this.isVisible && this.filterBySelection) {
      this.refresh();
    }
  },

  // Called when time range changes
  async onTimeRangeChanged() {
    if (this.isVisible) {
      // Clear cached death events to force reload
      this.deathEvents = [];
      await this.refresh();
    }
  }
};

window.Heatmap = Heatmap;
