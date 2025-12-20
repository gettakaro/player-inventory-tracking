// Player Info Panel - Shows detailed player information with inventory timeline

const PlayerInfo = {
  selectedPlayerId: null,
  selectedPlayer: null,
  inventoryHistory: [],
  isLoading: false,

  // Base URL for 7DTD item icons from CSMM repository
  ICON_BASE_URL: 'https://raw.githubusercontent.com/CatalysmsServerManager/7dtd-icons/master/sdtdIcons/1.0%20-%20Vanilla/',

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    // Close button
    const closeBtn = document.getElementById('close-player-info');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hidePanel());
    }

    // Tab switching
    document.querySelectorAll('.player-info-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabId = e.target.dataset.tab;
        this.switchTab(tabId);
      });
    });

    // Listen for time range changes to refresh inventory history
    // TimeRange calls its callback when changed, we'll hook into that via app.js
  },

  switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.player-info-tabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    // Load movement data if switching to movement tab
    if (tabId === 'movement' && this.selectedPlayerId) {
      this.renderMovementTab();
    }
  },

  async showPlayer(playerId) {
    if (this.isLoading) return;

    // Find player in the players list
    const player = Players.allPlayers.find(p =>
      String(p.playerId) === String(playerId) || String(p.id) === String(playerId)
    );

    if (!player) {
      console.warn('Player not found:', playerId);
      return;
    }

    this.selectedPlayerId = player.playerId || playerId;
    this.selectedPlayer = player;

    // Show panel
    const panel = document.getElementById('player-info-panel');
    if (panel) {
      panel.style.display = 'flex';
    }

    // Update player name
    const nameEl = document.getElementById('player-info-name');
    if (nameEl) {
      nameEl.textContent = player.name || 'Unknown Player';
    }

    // Render stats
    this.renderPlayerStats(player);

    // Load and render inventory
    this.isLoading = true;
    await this.loadAndRenderInventory();
    this.isLoading = false;
  },

  hidePanel() {
    const panel = document.getElementById('player-info-panel');
    if (panel) {
      panel.style.display = 'none';
    }
    this.selectedPlayerId = null;
    this.selectedPlayer = null;
    this.inventoryHistory = [];
  },

  renderPlayerStats(player) {
    const container = document.getElementById('player-info-stats');
    if (!container) return;

    const isOnline = player.online === 1 || player.online === true;
    const lastSeen = player.lastSeen ? new Date(player.lastSeen).toLocaleString() : 'Now';
    const playtime = this.formatPlaytime(player.playtimeSeconds);
    const currency = player.currency !== null && player.currency !== undefined
      ? player.currency.toLocaleString()
      : null;

    const profileUrl = player.playerId
      ? `https://dashboard.takaro.io/player/${player.playerId}/info`
      : null;

    // Get current color for player
    const playerId = player.playerId;
    const currentColor = playerId ? ColorUtils.getPlayerColor(playerId) : ColorUtils.offlineColor;
    const hasCustomColor = playerId ? ColorUtils.hasCustomColor(playerId) : false;

    container.innerHTML = `
      <div class="stat-item">
        <span class="stat-label">Status</span>
        <span class="stat-value">
          <span class="online-status ${isOnline ? 'online' : 'offline'}">
            ${isOnline ? 'Online' : 'Offline'}
          </span>
        </span>
      </div>
      <div class="stat-item stat-color">
        <span class="stat-label">Path Color</span>
        <span class="stat-value color-picker-row">
          <input type="color" id="player-color-picker" value="${this.colorToHex(currentColor)}"
                 title="Click to change player color" ${!playerId ? 'disabled' : ''} />
          <button id="reset-color-btn" class="btn btn-sm" ${!hasCustomColor ? 'disabled' : ''}
                  title="Reset to auto color">Reset</button>
        </span>
      </div>
      ${currency !== null ? `
      <div class="stat-item stat-currency">
        <span class="stat-label">Currency</span>
        <span class="stat-value currency-value">${currency}</span>
      </div>
      ` : ''}
      <div class="stat-item">
        <span class="stat-label">Position</span>
        <span class="stat-value">X: ${Math.round(player.x)}, Z: ${Math.round(player.z)}${player.y !== null ? `, Y: ${Math.round(player.y)}` : ''}</span>
      </div>
      ${!isOnline ? `
      <div class="stat-item">
        <span class="stat-label">Last Seen</span>
        <span class="stat-value">${lastSeen}</span>
      </div>
      ` : ''}
      ${playtime ? `
      <div class="stat-item">
        <span class="stat-label">Playtime</span>
        <span class="stat-value">${playtime}</span>
      </div>
      ` : ''}
      ${profileUrl ? `
      <div class="stat-item">
        <a href="${profileUrl}" target="_blank" class="profile-link">View Takaro Profile</a>
      </div>
      ` : ''}
    `;

    // Attach color picker event handlers
    this.attachColorPickerHandlers(playerId);
  },

  // Attach handlers for color picker
  attachColorPickerHandlers(playerId) {
    const colorPicker = document.getElementById('player-color-picker');
    const resetBtn = document.getElementById('reset-color-btn');

    if (colorPicker && playerId) {
      colorPicker.addEventListener('change', (e) => {
        ColorUtils.setCustomColor(playerId, e.target.value);
        // Enable reset button
        if (resetBtn) resetBtn.disabled = false;
      });
    }

    if (resetBtn && playerId) {
      resetBtn.addEventListener('click', () => {
        ColorUtils.clearCustomColor(playerId);
        // Update color picker to show auto color
        if (colorPicker) {
          colorPicker.value = this.colorToHex(ColorUtils.getAutoColor(playerId));
        }
        resetBtn.disabled = true;
      });
    }
  },

  // Convert HSL or any color to hex for color picker input
  colorToHex(color) {
    // If already hex, return it
    if (color.startsWith('#')) return color;

    // Create a temporary element to convert color
    const temp = document.createElement('div');
    temp.style.color = color;
    document.body.appendChild(temp);
    const computed = getComputedStyle(temp).color;
    document.body.removeChild(temp);

    // Parse rgb(r, g, b) format
    const match = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }

    return '#808080'; // fallback
  },

  formatPlaytime(seconds) {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  },

  async loadAndRenderInventory() {
    const currentContainer = document.getElementById('current-inventory-table');
    const diffContainer = document.getElementById('inventory-diff-list');

    if (!this.selectedPlayerId) return;

    // Show loading state
    if (currentContainer) currentContainer.innerHTML = '<div class="loading-text">Loading inventory...</div>';
    if (diffContainer) diffContainer.innerHTML = '<div class="loading-text">Loading history...</div>';

    try {
      // Get time range from TimeRange module
      const { start, end } = TimeRange.getDateRange();

      // Fetch inventory history
      const inventory = await API.getPlayerInventory(
        this.selectedPlayerId,
        start.toISOString(),
        end.toISOString()
      );

      this.inventoryHistory = inventory;

      // Render current inventory (most recent snapshot)
      this.renderCurrentInventory(inventory);

      // Render diff timeline
      this.renderInventoryDiff(inventory);

    } catch (error) {
      console.error('Failed to load inventory:', error);
      if (currentContainer) currentContainer.innerHTML = '<div class="error-text">Failed to load inventory</div>';
      if (diffContainer) diffContainer.innerHTML = '<div class="error-text">Failed to load history</div>';
    }
  },

  renderCurrentInventory(inventory) {
    const container = document.getElementById('current-inventory-table');
    if (!container) return;

    if (!inventory || inventory.length === 0) {
      container.innerHTML = '<div class="inventory-empty">No inventory data available</div>';
      return;
    }

    // Group by timestamp to get the most recent snapshot
    const byTimestamp = {};
    for (const item of inventory) {
      const ts = item.createdAt;
      if (!byTimestamp[ts]) byTimestamp[ts] = [];
      byTimestamp[ts].push(item);
    }

    const timestamps = Object.keys(byTimestamp).sort().reverse();
    if (timestamps.length === 0) {
      container.innerHTML = '<div class="inventory-empty">No items in inventory</div>';
      return;
    }

    const items = byTimestamp[timestamps[0]];
    const snapshotTime = new Date(timestamps[0]).toLocaleString();

    const rows = items.map(item => {
      const itemCode = item.itemCode || item.itemName || 'Unknown';
      const displayName = item.itemName || item.itemCode || 'Unknown';
      const quality = item.quality && item.quality !== '-1' && item.quality !== null
        ? `<span class="item-quality">Q${item.quality}</span>`
        : '';
      const icon = this.createItemIcon(itemCode);
      return `<tr>
        <td class="item-name">${icon}${this.escapeHtml(displayName)}${quality}</td>
        <td class="item-count">${item.quantity || 1}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="snapshot-time">As of ${snapshotTime}</div>
      <div class="inventory-table-wrapper">
        <table class="inventory-table">
          <thead>
            <tr><th>Item</th><th>Qty</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  renderInventoryDiff(inventory) {
    const container = document.getElementById('inventory-diff-list');
    if (!container) return;

    if (!inventory || inventory.length === 0) {
      container.innerHTML = '<div class="inventory-empty">No inventory history available</div>';
      return;
    }

    // Group by timestamp
    const byTimestamp = {};
    for (const item of inventory) {
      const ts = item.createdAt;
      if (!byTimestamp[ts]) byTimestamp[ts] = [];
      byTimestamp[ts].push(item);
    }

    const timestamps = Object.keys(byTimestamp).sort();

    if (timestamps.length < 2) {
      container.innerHTML = '<div class="inventory-empty">Not enough snapshots to show changes</div>';
      return;
    }

    // Calculate diffs between consecutive snapshots
    const diffs = [];
    for (let i = 1; i < timestamps.length; i++) {
      const prevSnapshot = byTimestamp[timestamps[i - 1]];
      const currSnapshot = byTimestamp[timestamps[i]];
      const diff = this.calculateDiff(prevSnapshot, currSnapshot);

      if (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0) {
        diffs.push({
          timestamp: timestamps[i],
          ...diff
        });
      }
    }

    if (diffs.length === 0) {
      container.innerHTML = '<div class="inventory-empty">No inventory changes in this time range</div>';
      return;
    }

    // Render diffs (most recent first)
    const diffHtml = diffs.reverse().map(diff => {
      const time = new Date(diff.timestamp).toLocaleString();

      const addedHtml = diff.added.map(item => {
        const icon = this.createItemIcon(item.code || item.name);
        return `<div class="diff-item diff-added">${icon}<span class="diff-symbol">+</span> ${this.escapeHtml(item.name)} x${item.quantity}${item.quality ? ` (Q${item.quality})` : ''}</div>`;
      }).join('');

      const removedHtml = diff.removed.map(item => {
        const icon = this.createItemIcon(item.code || item.name);
        return `<div class="diff-item diff-removed">${icon}<span class="diff-symbol">-</span> ${this.escapeHtml(item.name)} x${item.quantity}${item.quality ? ` (Q${item.quality})` : ''}</div>`;
      }).join('');

      const changedHtml = diff.changed.map(item => {
        const icon = this.createItemIcon(item.code || item.name);
        const change = item.quantityChange > 0 ? `+${item.quantityChange}` : item.quantityChange;
        return `<div class="diff-item diff-changed">${icon}<span class="diff-symbol">~</span> ${this.escapeHtml(item.name)} ${change} (now ${item.quantity})</div>`;
      }).join('');

      return `
        <div class="inventory-diff-entry">
          <div class="diff-timestamp">${time}</div>
          ${addedHtml}${removedHtml}${changedHtml}
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="diff-list">${diffHtml}</div>`;
  },

  calculateDiff(prevSnapshot, currSnapshot) {
    const added = [];
    const removed = [];
    const changed = [];

    // Create maps for comparison (using itemName or itemCode as key)
    const prevMap = new Map();
    for (const item of prevSnapshot) {
      const name = item.itemName || item.itemCode || 'unknown';
      const code = item.itemCode || item.itemName || 'unknown';
      const qualityKey = `${name}|${item.quality || ''}`;
      prevMap.set(qualityKey, {
        name: name,
        code: code,
        quantity: item.quantity || 1,
        quality: item.quality
      });
    }

    const currMap = new Map();
    for (const item of currSnapshot) {
      const name = item.itemName || item.itemCode || 'unknown';
      const code = item.itemCode || item.itemName || 'unknown';
      const qualityKey = `${name}|${item.quality || ''}`;
      currMap.set(qualityKey, {
        name: name,
        code: code,
        quantity: item.quantity || 1,
        quality: item.quality
      });
    }

    // Find added and changed
    for (const [key, curr] of currMap) {
      const prev = prevMap.get(key);
      if (!prev) {
        added.push(curr);
      } else if (prev.quantity !== curr.quantity) {
        changed.push({
          ...curr,
          quantityChange: curr.quantity - prev.quantity
        });
      }
    }

    // Find removed
    for (const [key, prev] of prevMap) {
      if (!currMap.has(key)) {
        removed.push(prev);
      }
    }

    return { added, removed, changed };
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  getItemIconUrl(itemName) {
    if (!itemName) return null;
    // The icon filename matches the item code/name from the game
    return `${this.ICON_BASE_URL}${encodeURIComponent(itemName)}.png`;
  },

  createItemIcon(itemName) {
    const iconUrl = this.getItemIconUrl(itemName);
    if (!iconUrl) return '';
    // Use onerror to hide broken images gracefully
    return `<img src="${iconUrl}" class="item-icon" alt="" onerror="this.style.display='none'">`;
  },

  // Called when time range changes to refresh inventory
  async onTimeRangeChange() {
    if (this.selectedPlayerId && !this.isLoading) {
      await this.loadAndRenderInventory();
    }
  },

  // Render the movement tab with position timeline
  renderMovementTab() {
    const statsContainer = document.getElementById('movement-stats');
    const timelineContainer = document.getElementById('movement-timeline');

    if (!statsContainer || !timelineContainer) return;

    // Get movement data from History module
    const playerId = this.selectedPlayerId;
    const paths = window.History?.paths || {};

    // Find matching player path (try different ID formats)
    let playerPath = paths[playerId];
    if (!playerPath) {
      // Try to find by matching player ID variations
      for (const [id, data] of Object.entries(paths)) {
        if (String(id) === String(playerId) || data.name === this.selectedPlayer?.name) {
          playerPath = data;
          break;
        }
      }
    }

    if (!playerPath || !playerPath.points || playerPath.points.length === 0) {
      statsContainer.innerHTML = '';
      timelineContainer.innerHTML = '<div class="movement-empty">No movement data available. Enable "Show Paths" and select a time range to see movement history.</div>';
      return;
    }

    const points = playerPath.points;

    // Calculate statistics
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dz = points[i].z - points[i - 1].z;
      totalDistance += Math.sqrt(dx * dx + dz * dz);
    }

    // Calculate time span
    const firstTime = new Date(points[0].timestamp);
    const lastTime = new Date(points[points.length - 1].timestamp);
    const durationMs = lastTime - firstTime;
    const durationSec = durationMs / 1000;

    // Average speed (blocks per second)
    const avgSpeed = durationSec > 0 ? totalDistance / durationSec : 0;

    // Render stats
    statsContainer.innerHTML = `
      <div class="movement-stat">
        <div class="movement-stat-value">${Math.round(totalDistance).toLocaleString()}</div>
        <div class="movement-stat-label">blocks</div>
      </div>
      <div class="movement-stat">
        <div class="movement-stat-value">${points.length}</div>
        <div class="movement-stat-label">points</div>
      </div>
      <div class="movement-stat">
        <div class="movement-stat-value">${avgSpeed.toFixed(1)}</div>
        <div class="movement-stat-label">blocks/sec</div>
      </div>
    `;

    // Render timeline (most recent first, limit to last 50 points)
    const recentPoints = points.slice(-50).reverse();
    let prevPoint = null;

    const entriesHtml = recentPoints.map((point, idx) => {
      const time = new Date(point.timestamp);
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

      let distanceStr = '';
      if (prevPoint) {
        const dx = point.x - prevPoint.x;
        const dz = point.z - prevPoint.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.5) {
          distanceStr = `+${Math.round(dist)}`;
        }
      }
      prevPoint = point;

      return `
        <div class="movement-entry">
          <span class="movement-time">${timeStr}</span>
          <span class="movement-coords">(${Math.round(point.x)}, ${Math.round(point.z)})</span>
          ${distanceStr ? `<span class="movement-distance">${distanceStr}</span>` : ''}
        </div>
      `;
    }).join('');

    timelineContainer.innerHTML = entriesHtml || '<div class="movement-empty">No movement data</div>';
  }
};

window.PlayerInfo = PlayerInfo;
