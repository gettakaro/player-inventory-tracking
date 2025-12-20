// Shared color utilities for player markers and paths

const ColorUtils = {
  // Generate a consistent HSL color for a player based on their ID
  getPlayerColor(playerId) {
    // Hash the player ID to get a consistent color
    let hash = 0;
    const str = String(playerId);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  },

  // Get a lighter version for fills
  getPlayerColorLight(playerId) {
    let hash = 0;
    const str = String(playerId);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 65%)`;
  },

  // Get hue value for a player (useful for SVG styling)
  getPlayerHue(playerId) {
    let hash = 0;
    const str = String(playerId);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    return Math.abs(hash) % 360;
  },

  // Offline players use gray
  offlineColor: '#6c757d'
};

window.ColorUtils = ColorUtils;
