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
      History.seekTo(parseInt(e.target.value));
    });

    document.getElementById('playback-speed').addEventListener('change', (e) => {
      History.setSpeed(parseInt(e.target.value));
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
        const { start, end } = TimeRange.getDateRange();
        const results = await AreaSearch.search(this.gameServerId, start.toISOString(), end.toISOString());

        // If we have results, auto-select found players in the sidebar
        if (results.length > 0) {
          const playerIds = [...new Set(results.map(r => r.playerId).filter(Boolean))];
          if (playerIds.length > 0 && window.PlayerList) {
            // Auto-select only the found players
            PlayerList.selectOnly(playerIds);
          }

          // If "Show Paths" is checked, load and draw paths (will use selection filter)
          if (document.getElementById('show-paths').checked) {
            await History.loadPaths(this.gameServerId, start, end);
            History.drawPaths();
          }
        }
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });

    document.getElementById('clear-area-btn').addEventListener('click', () => {
      AreaSearch.clear();
    });

    document.getElementById('close-area-results-btn').addEventListener('click', () => {
      AreaSearch.clear();
    });

    // Play Area button - starts playback for found players
    document.getElementById('play-area-btn').addEventListener('click', () => {
      if (window.History) {
        History.startPlayback();
      }
    });
  },

  async onTimeRangeChange(startDate, endDate, presetId) {
    if (!this.gameServerId) return;

    // Reload paths if they're visible
    if (History.isVisible) {
      await History.loadPaths(this.gameServerId, startDate, endDate);
      History.drawPaths();
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

    // Initialize area search after map is ready
    AreaSearch.init(GameMap.map);

    // Start player marker updates - fetch from API directly
    Players.startAutoRefresh(gameServerId, 30000);
  },

  cleanup() {
    Players.clear();
    History.clearPaths();
    History.stopPlayback();
    AreaSearch.clear();

    if (this.isMapInitialized) {
      GameMap.destroy();
      this.isMapInitialized = false;
    }

    this.gameServerId = null;
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

window.App = App;
