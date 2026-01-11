// Main application logic

import type { AreaSearchResult } from './types.js';

interface AppModule {
  gameServerId: string | null;
  isMapInitialized: boolean;

  init(): Promise<void>;
  setupEventListeners(): void;
  onTimeRangeChange(startDate: Date, endDate: Date, presetId: string): Promise<void>;
  startMap(gameServerId: string): Promise<void>;
  cleanup(): void;
}

export const App: AppModule = {
  gameServerId: null,
  isMapInitialized: false,

  async init(): Promise<void> {
    // Display app version
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
      versionEl.textContent = `v${__APP_VERSION__}`;
    }

    // Check if already logged in (service mode)
    const isLoggedIn = await window.Auth.init();

    if (isLoggedIn) {
      await window.Auth.loadGameServers();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Initialize player list panel
    window.PlayerList.init();

    // Initialize player info panel
    window.PlayerInfo.init();
  },

  setupEventListeners(): void {
    // Game server selection
    const gameServerEl = document.getElementById('game-server') as HTMLSelectElement | null;
    if (gameServerEl) {
      gameServerEl.addEventListener('change', (e) => {
        window.Auth.onServerSelected((e.target as HTMLSelectElement).value);
      });
    }

    // Start map button
    const startMapBtn = document.getElementById('start-map-btn');
    if (startMapBtn) {
      startMapBtn.addEventListener('click', async () => {
        const gameServer = document.getElementById('game-server') as HTMLSelectElement | null;
        const gameServerId = gameServer?.value;
        if (!gameServerId) return;

        await this.startMap(gameServerId);
      });
    }

    // Initialize Time Range Selector
    window.TimeRange.init(async (startDate: Date, endDate: Date, presetId: string) => {
      await this.onTimeRangeChange(startDate, endDate, presetId);
    });

    // Map controls
    const showPaths = document.getElementById('show-paths') as HTMLInputElement | null;
    if (showPaths) {
      showPaths.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          const { start, end } = window.TimeRange.getDateRange();
          await window.History.loadPaths(this.gameServerId!, start, end);
        }
        window.History.setVisible(target.checked);
      });
    }

    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement | null;
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        if (!this.gameServerId) return;

        refreshBtn.disabled = true;

        try {
          await window.Players.update(this.gameServerId);
          if (window.History.isVisible) {
            await window.History.refresh(this.gameServerId);
          }
        } finally {
          refreshBtn.disabled = false;
        }
      });
    }

    // Playback controls
    const playbackBtn = document.getElementById('playback-btn');
    if (playbackBtn) {
      playbackBtn.addEventListener('click', async () => {
        if (!this.gameServerId) return;
        await window.History.startPlayback(this.gameServerId);
      });
    }

    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        window.History.togglePlayPause();
      });
    }

    const playbackSlider = document.getElementById('playback-slider') as HTMLInputElement | null;
    if (playbackSlider) {
      playbackSlider.addEventListener('input', (e) => {
        window.History.seekTo(parseInt((e.target as HTMLInputElement).value, 10));
      });
    }

    const playbackSpeed = document.getElementById('playback-speed') as HTMLSelectElement | null;
    if (playbackSpeed) {
      playbackSpeed.addEventListener('change', (e) => {
        window.History.setSpeed(parseInt((e.target as HTMLSelectElement).value, 10));
      });
    }

    const closePlaybackBtn = document.getElementById('close-playback-btn');
    if (closePlaybackBtn) {
      closePlaybackBtn.addEventListener('click', () => {
        window.History.stopPlayback();
      });
    }

    // Settings button (placeholder for future settings modal)
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        alert('Settings coming soon!');
      });
    }

    // Area Search controls
    const drawRectBtn = document.getElementById('draw-rect-btn');
    if (drawRectBtn) {
      drawRectBtn.addEventListener('click', () => {
        window.AreaSearch.startDrawRectangle();
      });
    }

    const drawCircleBtn = document.getElementById('draw-circle-btn');
    if (drawCircleBtn) {
      drawCircleBtn.addEventListener('click', () => {
        window.AreaSearch.startDrawCircle();
      });
    }
  },

  async onTimeRangeChange(startDate: Date, endDate: Date, _presetId: string): Promise<void> {
    if (!this.gameServerId) return;

    // Refresh player list with new time filter
    if (window.PlayerList) {
      window.PlayerList.onTimeRangeChange();
    }

    // Refresh map markers with new time filter
    if (window.Players) {
      window.Players.refreshVisibility();
    }

    // Reload paths if they're visible
    if (window.History.isVisible) {
      await window.History.loadPaths(this.gameServerId, startDate, endDate);
      window.History.drawPaths();
    }

    // Refresh heatmap if visible
    if (window.Heatmap && window.Heatmap.isVisible) {
      await window.Heatmap.onTimeRangeChanged();
    }

    // Refresh player info panel inventory if open
    if (window.PlayerInfo) {
      window.PlayerInfo.onTimeRangeChange();
    }
  },

  async startMap(gameServerId: string): Promise<void> {
    this.gameServerId = gameServerId;

    // Update time range inputs with current values
    window.TimeRange.updateInputValues();

    // Show map container
    window.Auth.showMapView();

    // Initialize map
    await window.GameMap.init(gameServerId);
    this.isMapInitialized = true;

    // Initialize area search after map is ready with callback
    window.AreaSearch.init(window.GameMap.map!, gameServerId, async (results: AreaSearchResult[]) => {
      if (results.length > 0) {
        // Get unique player IDs
        const playerIds = [...new Set(results.map((r) => r.playerId).filter(Boolean))] as string[];

        if (playerIds.length > 0 && window.PlayerList) {
          // Filter player list to show only found players
          window.PlayerList.setAreaFilter(playerIds);
          // Also select them
          window.PlayerList.selectOnly(playerIds);
        }

        // Load paths if checkbox is checked
        const showPathsCheckbox = document.getElementById('show-paths') as HTMLInputElement | null;
        if (showPathsCheckbox?.checked) {
          const { start, end } = window.TimeRange.getDateRange();
          await window.History.loadPaths(this.gameServerId!, start, end);
          window.History.drawPaths();
        }
      } else {
        // No results - clear any existing filter
        if (window.PlayerList) {
          window.PlayerList.clearAreaFilter();
        }
      }
    });

    // Initialize heatmap module
    if (window.Heatmap) {
      window.Heatmap.init(gameServerId);
    }

    // Load items for autocomplete (in Item Search tab)
    if (window.PlayerInfo) {
      window.PlayerInfo.loadItems(gameServerId);
    }

    // Start player marker updates - fetch from API directly
    window.Players.startAutoRefresh(gameServerId, 30000);
  },

  cleanup(): void {
    window.Players.clear();
    window.History.clearPaths();
    window.History.stopPlayback();
    window.AreaSearch.clear();

    // Clear heatmap
    if (window.Heatmap) {
      window.Heatmap.clear();
    }

    if (this.isMapInitialized) {
      window.GameMap.destroy();
      this.isMapInitialized = false;
    }

    this.gameServerId = null;
  },
};

window.App = App;
