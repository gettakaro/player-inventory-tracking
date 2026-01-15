// Shared color utilities for player markers and paths

interface ColorUtilsType {
  customColors: Record<string, string>;
  init(): void;
  saveColors(): void;
  setCustomColor(playerId: string, color: string): void;
  clearCustomColor(playerId: string): void;
  hasCustomColor(playerId: string): boolean;
  getCustomColor(playerId: string): string | null;
  notifyColorChange(playerId: string): void;
  getPlayerColor(playerId: string): string;
  getAutoColor(playerId: string): string;
  getPlayerHue(playerId: string): number;
  offlineColor: string;
}

export const ColorUtils: ColorUtilsType = {
  // Store custom player colors (playerId -> hex color)
  customColors: {},

  // Load custom colors from localStorage
  init(): void {
    const saved = localStorage.getItem('playerCustomColors');
    if (saved) {
      try {
        this.customColors = JSON.parse(saved) as Record<string, string>;
      } catch (_e) {
        this.customColors = {};
      }
    }
  },

  // Save custom colors to localStorage
  saveColors(): void {
    localStorage.setItem('playerCustomColors', JSON.stringify(this.customColors));
  },

  // Set a custom color for a player
  setCustomColor(playerId: string, color: string): void {
    this.customColors[String(playerId)] = color;
    this.saveColors();
    // Trigger refresh of markers and paths
    this.notifyColorChange(playerId);
  },

  // Clear custom color for a player (revert to auto)
  clearCustomColor(playerId: string): void {
    delete this.customColors[String(playerId)];
    this.saveColors();
    this.notifyColorChange(playerId);
  },

  // Check if player has custom color
  hasCustomColor(playerId: string): boolean {
    return String(playerId) in this.customColors;
  },

  // Get custom color or null
  getCustomColor(playerId: string): string | null {
    return this.customColors[String(playerId)] || null;
  },

  // Notify that a color changed - refresh paths and markers
  notifyColorChange(_playerId: string): void {
    // Refresh player markers
    if (window.Players && window.App?.gameServerId) {
      window.Players.refreshVisibility();
    }
    // Refresh paths if visible
    if (window.History?.isVisible) {
      window.History.drawPaths();
    }
  },

  // Generate a consistent HSL color for a player based on their ID
  getPlayerColor(playerId: string): string {
    // Check for custom color first
    const custom = this.getCustomColor(playerId);
    if (custom) return custom;

    // Hash the player ID to get a consistent color
    let hash = 0;
    const str = String(playerId);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  },

  // Get the auto-generated color (ignoring custom)
  getAutoColor(playerId: string): string {
    let hash = 0;
    const str = String(playerId);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  },

  // Get hue value for a player (useful for SVG styling)
  getPlayerHue(playerId: string): number {
    let hash = 0;
    const str = String(playerId);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    return Math.abs(hash) % 360;
  },

  // Offline players use gray
  offlineColor: '#6c757d',
};

// Initialize on load
ColorUtils.init();

window.ColorUtils = ColorUtils;
