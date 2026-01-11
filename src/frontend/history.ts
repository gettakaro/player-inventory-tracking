// Movement history and playback

import type { MovementPath, MovementPoint } from './types.js';

declare const L: typeof import('leaflet');

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number | null;
  startTime: number | null;
  endTime: number | null;
  speed: number;
  intervalId: ReturnType<typeof setInterval> | null;
  playbackMarkers: Map<string, L.CircleMarker>;
}

export const History = {
  paths: {} as Record<string, MovementPath>,
  pathLayers: new Map<string, L.Polyline>(),
  isVisible: false,
  startDate: null as Date | null,
  endDate: null as Date | null,

  playbackState: {
    isPlaying: false,
    currentTime: null,
    startTime: null,
    endTime: null,
    speed: 5,
    intervalId: null,
    playbackMarkers: new Map<string, L.CircleMarker>(),
  } as PlaybackState,

  // Generate a color for each player (uses shared ColorUtils)
  getPlayerColor(playerId: string): string {
    return window.ColorUtils.getPlayerColor(playerId);
  },

  async loadPaths(
    gameServerId: string,
    startDate: Date | string | null = null,
    endDate: Date | string | null = null
  ): Promise<number> {
    if (startDate !== null) {
      this.startDate = startDate instanceof Date ? startDate : new Date(startDate);
    }
    if (endDate !== null) {
      this.endDate = endDate instanceof Date ? endDate : new Date(endDate);
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

      this.paths = await window.API.getMovementPaths(gameServerId, startIso, endIso);

      return Object.keys(this.paths).length;
    } catch (error) {
      console.error('Failed to load movement paths:', error);
      return 0;
    }
  },

  drawPaths(): void {
    if (!window.GameMap.map) return;

    // Clear existing path layers
    this.clearPaths();

    // Get selected player Takaro IDs from PlayerList if available
    // Note: paths use playerId (Player UUID) as keys, but selectedPlayers uses POG IDs
    const selectedTakaroIds = window.PlayerList ? window.PlayerList.getSelectedTakaroIds() : null;

    for (const [playerId, data] of Object.entries(this.paths)) {
      if (!data.points || data.points.length < 2) continue;

      // Skip if player is not selected (when selection filtering is active)
      if (selectedTakaroIds && selectedTakaroIds.size > 0 && !selectedTakaroIds.has(String(playerId))) {
        continue;
      }

      const color = this.getPlayerColor(playerId);
      const latlngs = data.points.map((p) => window.GameMap.gameToLatLng(p.x, p.z));

      const polyline = L.polyline(latlngs, {
        color: color,
        weight: 3,
        opacity: 0.7,
        smoothFactor: 1,
      });

      // Add popup with player name
      polyline.bindPopup(`<b>${data.name}</b><br>Movement path`);

      polyline.addTo(window.GameMap.map);
      this.pathLayers.set(playerId, polyline);
    }
  },

  clearPaths(): void {
    for (const layer of this.pathLayers.values()) {
      layer.remove();
    }
    this.pathLayers.clear();
  },

  setVisible(visible: boolean): void {
    this.isVisible = visible;

    if (visible) {
      this.drawPaths();
    } else {
      this.clearPaths();
    }
  },

  async refresh(gameServerId: string): Promise<void> {
    await this.loadPaths(gameServerId);
    if (this.isVisible) {
      this.drawPaths();
    }
  },

  // Playback functionality
  async startPlayback(gameServerId: string): Promise<void> {
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
        if (Number.isFinite(time)) {
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
    window.Players.stopAutoRefresh();
    for (const marker of window.Players.markers.values()) {
      marker.remove();
    }
    window.Players.markers.clear();

    // Draw paths for selected players so they're visible during playback
    this.drawPaths();

    // Show playback controls
    const playbackControls = document.getElementById('playback-controls');
    if (playbackControls) {
      playbackControls.style.display = 'flex';
    }

    // Update slider
    const slider = document.getElementById('playback-slider') as HTMLInputElement;
    if (slider) {
      slider.min = '0';
      slider.max = '100';
      slider.value = '0';
    }

    this.updatePlaybackTime();
  },

  stopPlayback(): void {
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
    const showPathsCheckbox = document.getElementById('show-paths') as HTMLInputElement;
    if (!showPathsCheckbox?.checked) {
      this.clearPaths();
    }

    // Hide controls
    const playbackControls = document.getElementById('playback-controls');
    if (playbackControls) {
      playbackControls.style.display = 'none';
    }

    // Restore regular markers
    if (window.App?.gameServerId) {
      window.Players.startAutoRefresh(window.App.gameServerId);
    }
  },

  togglePlayPause(): void {
    if (this.playbackState.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  },

  play(): void {
    this.playbackState.isPlaying = true;
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
      playPauseBtn.textContent = '⏸';
    }

    const stepMs = 1000; // Update every second
    const timeStep = this.playbackState.speed * 60 * 1000; // x minutes per second

    this.playbackState.intervalId = setInterval(() => {
      if (this.playbackState.currentTime === null || this.playbackState.endTime === null) return;

      this.playbackState.currentTime += timeStep;

      if (this.playbackState.currentTime >= this.playbackState.endTime) {
        this.playbackState.currentTime = this.playbackState.endTime;
        this.pause();
      }

      this.updatePlaybackPosition();
    }, stepMs);
  },

  pause(): void {
    this.playbackState.isPlaying = false;
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
      playPauseBtn.textContent = '▶';
    }

    if (this.playbackState.intervalId) {
      clearInterval(this.playbackState.intervalId);
      this.playbackState.intervalId = null;
    }
  },

  setSpeed(speed: number): void {
    this.playbackState.speed = speed;
  },

  seekTo(percent: number): void {
    if (this.playbackState.startTime === null || this.playbackState.endTime === null) return;

    const range = this.playbackState.endTime - this.playbackState.startTime;
    this.playbackState.currentTime = this.playbackState.startTime + (range * percent) / 100;
    this.updatePlaybackPosition();
  },

  updatePlaybackTime(): void {
    if (this.playbackState.currentTime === null) return;

    const current = new Date(this.playbackState.currentTime);
    const timeElement = document.getElementById('playback-time');
    if (timeElement) {
      timeElement.textContent = current.toLocaleTimeString();
    }

    // Update slider
    if (this.playbackState.startTime !== null && this.playbackState.endTime !== null) {
      const range = this.playbackState.endTime - this.playbackState.startTime;
      const percent = ((this.playbackState.currentTime - this.playbackState.startTime) / range) * 100;
      const slider = document.getElementById('playback-slider') as HTMLInputElement;
      if (slider) {
        slider.value = String(percent);
      }
    }
  },

  updatePlaybackPosition(): void {
    this.updatePlaybackTime();

    if (!window.GameMap.map || this.playbackState.currentTime === null) return;

    // For each player, find their position at current time
    for (const [playerId, data] of Object.entries(this.paths)) {
      // Skip players with no path data (same check as drawPaths)
      if (!data.points || data.points.length < 2) continue;

      // Only animate players who have a visible path drawn on the map
      // This ensures playback matches what the user sees in terms of paths
      if (!this.pathLayers.has(playerId)) {
        // Remove existing playback marker if player's path is not visible
        if (this.playbackState.playbackMarkers.has(playerId)) {
          const marker = this.playbackState.playbackMarkers.get(playerId);
          marker?.remove();
          this.playbackState.playbackMarkers.delete(playerId);
        }
        continue;
      }

      // Find the point closest to current time (but not after)
      let bestPoint: MovementPoint | null = null;
      for (const point of data.points) {
        const time = new Date(point.timestamp).getTime();
        if (time <= this.playbackState.currentTime) {
          bestPoint = point;
        } else {
          break;
        }
      }

      if (!bestPoint) continue;

      const pos = window.GameMap.gameToLatLng(bestPoint.x, bestPoint.z);
      const color = this.getPlayerColor(playerId);

      if (this.playbackState.playbackMarkers.has(playerId)) {
        // Update existing marker
        const marker = this.playbackState.playbackMarkers.get(playerId);
        marker?.setLatLng(pos);
      } else {
        // Create new marker
        const marker = L.circleMarker(pos, {
          radius: 8,
          fillColor: color,
          fillOpacity: 0.9,
          color: 'white',
          weight: 2,
        });

        marker.bindTooltip(data.name, {
          permanent: true,
          direction: 'top',
          offset: [0, -10],
        });

        marker.addTo(window.GameMap.map);
        this.playbackState.playbackMarkers.set(playerId, marker);
      }
    }
  },
};

window.History = History;
