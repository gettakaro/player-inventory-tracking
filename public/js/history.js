// Movement history and playback

const History = {
  paths: {},
  pathLayers: new Map(),
  isVisible: false,
  startDate: null,
  endDate: null,

  playbackState: {
    isPlaying: false,
    currentTime: null,
    startTime: null,
    endTime: null,
    speed: 5,
    intervalId: null,
    playbackMarkers: new Map()
  },

  // Generate a color for each player (uses shared ColorUtils)
  getPlayerColor(playerId) {
    return ColorUtils.getPlayerColor(playerId);
  },

  async loadPaths(gameServerId, startDate = null, endDate = null) {
    if (startDate !== null) {
      this.startDate = startDate;
    }
    if (endDate !== null) {
      this.endDate = endDate;
    }

    // Default to last 24 hours if no dates provided
    if (!this.startDate || !this.endDate) {
      const now = new Date();
      this.endDate = now;
      this.startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    try {
      // API expects ISO strings
      const startIso = this.startDate instanceof Date ? this.startDate.toISOString() : this.startDate;
      const endIso = this.endDate instanceof Date ? this.endDate.toISOString() : this.endDate;

      this.paths = await API.getMovementPaths(gameServerId, startIso, endIso);

      return Object.keys(this.paths).length;
    } catch (error) {
      console.error('Failed to load movement paths:', error);
      return 0;
    }
  },

  drawPaths() {
    if (!GameMap.map) return;

    // Clear existing path layers
    this.clearPaths();

    // Get selected player Takaro IDs from PlayerList if available
    // Note: paths use playerId (Player UUID) as keys, but selectedPlayers uses POG IDs
    const selectedTakaroIds = window.PlayerList ? PlayerList.getSelectedTakaroIds() : null;

    for (const [playerId, data] of Object.entries(this.paths)) {
      if (!data.points || data.points.length < 2) continue;

      // Skip if player is not selected (when selection filtering is active)
      if (selectedTakaroIds && selectedTakaroIds.size > 0 && !selectedTakaroIds.has(String(playerId))) {
        continue;
      }

      const color = this.getPlayerColor(playerId);
      const latlngs = data.points.map(p => GameMap.gameToLatLng(p.x, p.z));

      const polyline = L.polyline(latlngs, {
        color: color,
        weight: 3,
        opacity: 0.7,
        smoothFactor: 1
      });

      // Add popup with player name
      polyline.bindPopup(`<b>${data.name}</b><br>Movement path`);

      polyline.addTo(GameMap.map);
      this.pathLayers.set(playerId, polyline);
    }
  },

  clearPaths() {
    for (const layer of this.pathLayers.values()) {
      layer.remove();
    }
    this.pathLayers.clear();
  },

  setVisible(visible) {
    this.isVisible = visible;

    if (visible) {
      this.drawPaths();
    } else {
      this.clearPaths();
    }
  },

  async refresh(gameServerId) {
    await this.loadPaths(gameServerId);
    if (this.isVisible) {
      this.drawPaths();
    }
  },

  // Playback functionality
  async startPlayback(gameServerId) {
    if (!this.paths || Object.keys(this.paths).length === 0) {
      await this.loadPaths(gameServerId);
    }

    if (Object.keys(this.paths).length === 0) {
      alert('No movement data available for playback');
      return;
    }

    // Find time range
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const data of Object.values(this.paths)) {
      if (!data.points) continue;
      for (const point of data.points) {
        const time = new Date(point.timestamp).getTime();
        if (!isNaN(time)) {
          minTime = Math.min(minTime, time);
          maxTime = Math.max(maxTime, time);
        }
      }
    }

    if (minTime === Infinity || maxTime === -Infinity) {
      alert('No valid timestamps in movement data');
      return;
    }

    this.playbackState.startTime = minTime;
    this.playbackState.endTime = maxTime;
    this.playbackState.currentTime = minTime;

    // Hide regular markers (but keep player data/selection intact)
    Players.stopAutoRefresh();
    for (const marker of Players.markers.values()) {
      marker.remove();
    }
    Players.markers.clear();

    // Draw paths for selected players so they're visible during playback
    this.drawPaths();

    // Show playback controls
    document.getElementById('playback-controls').style.display = 'flex';

    // Update slider
    const slider = document.getElementById('playback-slider');
    slider.min = 0;
    slider.max = 100;
    slider.value = 0;

    this.updatePlaybackTime();
  },

  stopPlayback() {
    this.playbackState.isPlaying = false;

    if (this.playbackState.intervalId) {
      clearInterval(this.playbackState.intervalId);
      this.playbackState.intervalId = null;
    }

    // Clear playback markers
    for (const marker of this.playbackState.playbackMarkers.values()) {
      marker.remove();
    }
    this.playbackState.playbackMarkers.clear();

    // Clear paths if "Show Paths" is not checked
    if (!document.getElementById('show-paths').checked) {
      this.clearPaths();
    }

    // Hide controls
    document.getElementById('playback-controls').style.display = 'none';

    // Restore regular markers
    if (window.App && window.App.gameServerId) {
      Players.startAutoRefresh(window.App.gameServerId);
    }
  },

  togglePlayPause() {
    if (this.playbackState.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  },

  play() {
    this.playbackState.isPlaying = true;
    document.getElementById('play-pause-btn').textContent = '⏸';

    const stepMs = 1000; // Update every second
    const timeStep = this.playbackState.speed * 60 * 1000; // x minutes per second

    this.playbackState.intervalId = setInterval(() => {
      this.playbackState.currentTime += timeStep;

      if (this.playbackState.currentTime >= this.playbackState.endTime) {
        this.playbackState.currentTime = this.playbackState.endTime;
        this.pause();
      }

      this.updatePlaybackPosition();
    }, stepMs);
  },

  pause() {
    this.playbackState.isPlaying = false;
    document.getElementById('play-pause-btn').textContent = '▶';

    if (this.playbackState.intervalId) {
      clearInterval(this.playbackState.intervalId);
      this.playbackState.intervalId = null;
    }
  },

  setSpeed(speed) {
    this.playbackState.speed = speed;
  },

  seekTo(percent) {
    const range = this.playbackState.endTime - this.playbackState.startTime;
    this.playbackState.currentTime = this.playbackState.startTime + (range * percent / 100);
    this.updatePlaybackPosition();
  },

  updatePlaybackTime() {
    const current = new Date(this.playbackState.currentTime);
    document.getElementById('playback-time').textContent = current.toLocaleTimeString();

    // Update slider
    const range = this.playbackState.endTime - this.playbackState.startTime;
    const percent = ((this.playbackState.currentTime - this.playbackState.startTime) / range) * 100;
    document.getElementById('playback-slider').value = percent;
  },

  updatePlaybackPosition() {
    this.updatePlaybackTime();

    if (!GameMap.map) return;

    // Get selected player Takaro IDs (same filtering as drawPaths)
    const selectedTakaroIds = window.PlayerList ? PlayerList.getSelectedTakaroIds() : null;

    // For each player, find their position at current time
    for (const [playerId, data] of Object.entries(this.paths)) {
      if (!data.points) continue;

      // Skip if player is not selected (same filtering as drawPaths)
      if (selectedTakaroIds && selectedTakaroIds.size > 0 && !selectedTakaroIds.has(String(playerId))) {
        // Remove existing playback marker if player was deselected during playback
        if (this.playbackState.playbackMarkers.has(playerId)) {
          this.playbackState.playbackMarkers.get(playerId).remove();
          this.playbackState.playbackMarkers.delete(playerId);
        }
        continue;
      }

      // Find the point closest to current time (but not after)
      let bestPoint = null;
      for (const point of data.points) {
        const time = new Date(point.timestamp).getTime();
        if (time <= this.playbackState.currentTime) {
          bestPoint = point;
        } else {
          break;
        }
      }

      if (!bestPoint) continue;

      const pos = GameMap.gameToLatLng(bestPoint.x, bestPoint.z);
      const color = this.getPlayerColor(playerId);

      if (this.playbackState.playbackMarkers.has(playerId)) {
        // Update existing marker
        this.playbackState.playbackMarkers.get(playerId).setLatLng(pos);
      } else {
        // Create new marker
        const marker = L.circleMarker(pos, {
          radius: 8,
          fillColor: color,
          fillOpacity: 0.9,
          color: 'white',
          weight: 2
        });

        marker.bindTooltip(data.name, {
          permanent: true,
          direction: 'top',
          offset: [0, -10]
        });

        marker.addTo(GameMap.map);
        this.playbackState.playbackMarkers.set(playerId, marker);
      }
    }
  }
};

window.History = History;
