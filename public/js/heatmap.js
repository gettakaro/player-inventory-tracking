// Heatmap visualization module

const Heatmap = {
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
        this.setRadius(parseInt(e.target.value, 10));
      });
    }

    // Blur slider
    const blurSlider = document.getElementById('heatmap-blur');
    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        this.setBlur(parseInt(e.target.value, 10));
      });
    }
  },

  setVisible(visible) {
    this.isVisible = visible;

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

  refresh() {
    if (!this.isVisible || !GameMap.map) return;

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

  // Called when player selection changes
  onPlayerSelectionChanged() {
    if (this.isVisible && this.filterBySelection) {
      this.refresh();
    }
  },

  // Called when time range changes
  onTimeRangeChanged() {
    if (this.isVisible) {
      this.refresh();
    }
  },
};

window.Heatmap = Heatmap;
