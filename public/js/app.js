// Main application logic

const App = {
  gameServerId: null,
  isMapInitialized: false,

  async init() {
    // Check if already logged in (service mode)
    const isLoggedIn = await Auth.init();

    if (isLoggedIn) {
      await Auth.loadGameServers();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Initialize player list panel
    PlayerList.init();

    // Initialize player info panel
    PlayerInfo.init();
  },

  setupEventListeners() {
    // Game server selection
    document.getElementById('game-server').addEventListener('change', (e) => {
      Auth.onServerSelected(e.target.value);
    });

    // Start map button
    document.getElementById('start-map-btn').addEventListener('click', async () => {
      const gameServerId = document.getElementById('game-server').value;
      if (!gameServerId) return;

      await this.startMap(gameServerId);
    });

    // Initialize Time Range Selector
    TimeRange.init(async (startDate, endDate, presetId) => {
      await this.onTimeRangeChange(startDate, endDate, presetId);
    });

    // Map controls
    document.getElementById('show-paths').addEventListener('change', async (e) => {
      if (e.target.checked) {
        const { start, end } = TimeRange.getDateRange();
        await History.loadPaths(this.gameServerId, start, end);
      }
      History.setVisible(e.target.checked);
    });

    document.getElementById('refresh-btn').addEventListener('click', async () => {
      if (!this.gameServerId) return;

      const btn = document.getElementById('refresh-btn');
      btn.disabled = true;

      try {
        await Players.update(this.gameServerId);
        if (History.isVisible) {
          await History.refresh(this.gameServerId);
        }
      } finally {
        btn.disabled = false;
      }
    });

    // Playback controls
    document.getElementById('playback-btn').addEventListener('click', async () => {
      if (!this.gameServerId) return;
      await History.startPlayback(this.gameServerId);
    });

    document.getElementById('play-pause-btn').addEventListener('click', () => {
      History.togglePlayPause();
    });

    document.getElementById('playback-slider').addEventListener('input', (e) => {
      History.seekTo(parseInt(e.target.value, 10));
    });

    document.getElementById('playback-speed').addEventListener('change', (e) => {
      History.setSpeed(parseInt(e.target.value, 10));
    });

    document.getElementById('close-playback-btn').addEventListener('click', () => {
      History.stopPlayback();
    });

    // Settings button (placeholder for future settings modal)
    document.getElementById('settings-btn').addEventListener('click', () => {
      alert('Settings coming soon!');
    });

    // Area Search controls
    document.getElementById('draw-rect-btn').addEventListener('click', () => {
      AreaSearch.startDrawRectangle();
    });

    document.getElementById('draw-circle-btn').addEventListener('click', () => {
      AreaSearch.startDrawCircle();
    });

    document.getElementById('area-search-btn').addEventListener('click', async () => {
      if (!this.gameServerId) return;

      const btn = document.getElementById('area-search-btn');
      btn.disabled = true;
      btn.classList.add('loading');

      try {
        // Trigger search - callback will handle results
        await AreaSearch.triggerSearch();
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });

    document.getElementById('clear-area-btn').addEventListener('click', () => {
      AreaSearch.clear();
      // AreaSearch.clear() now also clears PlayerList filter
    });
  },

  async onTimeRangeChange(startDate, endDate, _presetId) {
    if (!this.gameServerId) return;

    // Refresh player list with new time filter
    if (window.PlayerList) {
      PlayerList.onTimeRangeChange();
    }

    // Refresh map markers with new time filter
    if (window.Players) {
      Players.refreshVisibility();
    }

    // Reload paths if they're visible
    if (History.isVisible) {
      await History.loadPaths(this.gameServerId, startDate, endDate);
      History.drawPaths();
    }

    // Refresh heatmap if visible
    if (window.Heatmap && Heatmap.isVisible) {
      await Heatmap.onTimeRangeChanged();
    }

    // Refresh player info panel inventory if open
    if (window.PlayerInfo) {
      PlayerInfo.onTimeRangeChange();
    }
  },

  async startMap(gameServerId) {
    this.gameServerId = gameServerId;

    // Update time range inputs with current values
    TimeRange.updateInputValues();

    // Show map container
    Auth.showMapView();

    // Initialize map
    await GameMap.init(gameServerId);
    this.isMapInitialized = true;

    // Initialize area search after map is ready with callback
    AreaSearch.init(GameMap.map, gameServerId, async (results) => {
      if (results.length > 0) {
        // Get unique player IDs
        const playerIds = [...new Set(results.map((r) => r.playerId).filter(Boolean))];

        if (playerIds.length > 0 && window.PlayerList) {
          // Filter player list to show only found players
          PlayerList.setAreaFilter(playerIds);
          // Also select them
          PlayerList.selectOnly(playerIds);
        }

        // Load paths if checkbox is checked
        if (document.getElementById('show-paths').checked) {
          const { start, end } = TimeRange.getDateRange();
          await History.loadPaths(this.gameServerId, start, end);
          History.drawPaths();
        }
      } else {
        // No results - clear any existing filter
        if (window.PlayerList) {
          PlayerList.clearAreaFilter();
        }
      }
    });

    // Initialize heatmap module
    if (window.Heatmap) {
      Heatmap.init(gameServerId);
    }

    // Start player marker updates - fetch from API directly
    Players.startAutoRefresh(gameServerId, 30000);
  },

  cleanup() {
    Players.clear();
    History.clearPaths();
    History.stopPlayback();
    AreaSearch.clear();

    // Clear heatmap
    if (window.Heatmap) {
      Heatmap.clear();
    }

    if (this.isMapInitialized) {
      GameMap.destroy();
      this.isMapInitialized = false;
    }

    this.gameServerId = null;
  },
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

window.App = App;
