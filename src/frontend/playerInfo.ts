// Player Info Panel - Shows detailed player information with inventory timeline

import type { DateRange, InventoryItem, Item, ItemSearchResult, Player } from './types.js';

interface InventoryDiff {
  added: DiffItem[];
  removed: DiffItem[];
  changed: ChangedItem[];
}

interface DiffItem {
  name: string;
  code: string;
  quantity: number;
  quality?: string | number | null;
}

interface ChangedItem extends DiffItem {
  quantityChange: number;
}

interface InventoryEntry {
  quantity: number;
  quality?: string | number | null;
  createdAt: string;
}

interface PlayerGroupedResult {
  playerId: string;
  playerName: string;
  entries: InventoryEntry[];
}

interface CurrentItemSearch {
  itemId: string;
  itemName: string;
}

interface PlayerInfoModule {
  selectedPlayerId: string | null;
  selectedPlayer: Player | null;
  inventoryHistory: InventoryItem[];
  isLoading: boolean;
  isExpanded: boolean;
  itemSearchResults: ItemSearchResult[];
  currentItemSearch: CurrentItemSearch | null;
  items: Item[];
  gameServerId: string | null;
  ICON_BASE_URL: string;

  init(): void;
  setupEventListeners(): void;
  toggleExpand(): void;
  openItemSearch(): void;
  switchTopTab(tabId: string): void;
  switchSubTab(tabId: string): void;
  showPlayer(playerId: string): Promise<void>;
  hidePanel(): void;
  renderPlayerStats(player: Player): void;
  attachColorPickerHandlers(playerId: string): void;
  colorToHex(color: string): string;
  formatPlaytime(seconds?: number): string | null;
  loadAndRenderInventory(): Promise<void>;
  renderCurrentInventory(inventory: InventoryItem[]): void;
  renderInventoryDiff(inventory: InventoryItem[]): void;
  calculateDiff(prevSnapshot: InventoryItem[], currSnapshot: InventoryItem[]): InventoryDiff;
  escapeHtml(text: string): string;
  getItemIconUrl(itemName: string): string | null;
  createItemIcon(itemName: string): string;
  onTimeRangeChange(): Promise<void>;
  renderMovementTab(): void;
  loadItems(gameServerId: string): Promise<void>;
  updateItemSuggestions(query: string): Promise<void>;
  clearItemFilter(): void;
  searchByItemId(itemId: string, itemName: string, startDate?: string, endDate?: string): Promise<void>;
  searchByItemName(itemName: string, startDate?: string, endDate?: string): Promise<void>;
  showItemSearchResults(itemName: string, results: ItemSearchResult[]): void;
  renderItemSearchResults(itemName: string, results: ItemSearchResult[]): void;
  formatRelativeTime(timestamp: string): string;
  attachInventoryClickHandlers(): void;
}

const PlayerInfo: PlayerInfoModule = {
  selectedPlayerId: null,
  selectedPlayer: null,
  inventoryHistory: [],
  isLoading: false,
  isExpanded: false,
  itemSearchResults: [], // Results from item search
  currentItemSearch: null, // Current item being searched
  items: [], // Cached items for autocomplete
  gameServerId: null, // Current game server

  // Base URL for 7DTD item icons from CSMM repository
  ICON_BASE_URL:
    'https://raw.githubusercontent.com/CatalysmsServerManager/7dtd-icons/master/sdtdIcons/1.0%20-%20Vanilla/',

  init(): void {
    this.setupEventListeners();
  },

  setupEventListeners(): void {
    // Close button
    const closeBtn = document.getElementById('close-bottom-panel');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hidePanel());
    }

    // Expand/collapse button
    const expandBtn = document.getElementById('expand-bottom-panel');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => this.toggleExpand());
    }

    // Item search button in top toolbar
    const itemSearchBtn = document.getElementById('item-search-btn');
    if (itemSearchBtn) {
      itemSearchBtn.addEventListener('click', () => this.openItemSearch());
    }

    // Top-level tab switching (Player Info / Item Search)
    document.querySelectorAll('.top-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabId = target.dataset.topTab;
        if (tabId) {
          this.switchTopTab(tabId);
        }
      });
    });

    // Sub-tab switching within Player Info (Inventory / Movement)
    document.querySelectorAll('.player-info-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabId = target.dataset.tab;
        if (tabId) {
          this.switchSubTab(tabId);
        }
      });
    });

    // Item search input in Item Search tab
    const itemSearchInput = document.getElementById('item-search') as HTMLInputElement | null;
    if (itemSearchInput) {
      // Debounced search for autocomplete
      let searchTimeout: ReturnType<typeof setTimeout>;
      itemSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const target = e.target as HTMLInputElement;
        const query = target.value.trim();

        searchTimeout = setTimeout(async () => {
          if (query.length >= 2) {
            await this.updateItemSuggestions(query);
          }
        }, 300);
      });

      // Handle selection from datalist
      itemSearchInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        const selectedName = target.value.trim();
        if (!selectedName) return;

        // Find the item in our cached items
        const item = this.items.find((i) => i.name === selectedName);
        if (item && item.id) {
          await this.searchByItemId(item.id, item.name);
        }
      });

      // Handle Enter key
      itemSearchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          const target = e.target as HTMLInputElement;
          const selectedName = target.value.trim();
          if (!selectedName) return;

          const item = this.items.find((i) => i.name === selectedName);
          if (item && item.id) {
            await this.searchByItemId(item.id, item.name);
          }
        }
      });
    }

    // Clear item filter button
    const clearFilterBtn = document.getElementById('clear-item-filter-btn');
    if (clearFilterBtn) {
      clearFilterBtn.addEventListener('click', () => {
        this.clearItemFilter();
      });
    }

    // Listen for time range changes to refresh inventory history
    // TimeRange calls its callback when changed, we'll hook into that via app.js
  },

  toggleExpand(): void {
    const panel = document.getElementById('bottom-panel');
    const expandBtn = document.getElementById('expand-bottom-panel');
    if (!panel) return;

    this.isExpanded = !this.isExpanded;
    panel.classList.toggle('expanded', this.isExpanded);

    // Update button title
    if (expandBtn) {
      expandBtn.title = this.isExpanded ? 'Restore panel' : 'Expand panel';
    }
  },

  // Open bottom panel with Item Search tab active
  openItemSearch(): void {
    this.switchTopTab('item-search');
    // Focus the search input
    const itemSearchInput = document.getElementById('item-search') as HTMLInputElement | null;
    if (itemSearchInput) {
      itemSearchInput.focus();
    }
  },

  // Switch between top-level tabs (Player Info / Item Search)
  switchTopTab(tabId: string): void {
    // Update top-level tab buttons
    document.querySelectorAll('.top-tab-btn').forEach((btn) => {
      const btnEl = btn as HTMLElement;
      btn.classList.toggle('active', btnEl.dataset.topTab === tabId);
    });

    // Update top-level tab panes
    document.querySelectorAll('.top-tab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `top-tab-${tabId}`);
    });

    // Show the panel if it's hidden
    const panel = document.getElementById('bottom-panel');
    if (panel) {
      panel.style.display = 'flex';
    }
  },

  // Switch between sub-tabs within Player Info (Inventory / Movement)
  switchSubTab(tabId: string): void {
    // Update sub-tab buttons
    document.querySelectorAll('.player-info-tabs .tab-btn').forEach((btn) => {
      const btnEl = btn as HTMLElement;
      btn.classList.toggle('active', btnEl.dataset.tab === tabId);
    });

    // Update sub-tab panes
    document.querySelectorAll('#top-tab-player-info .tab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    // Load movement data if switching to movement tab
    if (tabId === 'movement' && this.selectedPlayerId) {
      this.renderMovementTab();
    }
  },

  async showPlayer(playerId: string): Promise<void> {
    if (this.isLoading) return;

    // Find player in the players list
    const player = window.Players.allPlayers.find(
      (p: Player) => String(p.playerId) === String(playerId) || String(p.id) === String(playerId)
    );

    if (!player) {
      console.warn('Player not found:', playerId);
      return;
    }

    this.selectedPlayerId = player.playerId || playerId;
    this.selectedPlayer = player;

    // Show panel and switch to Player Info tab
    const panel = document.getElementById('bottom-panel');
    if (panel) {
      panel.style.display = 'flex';
    }
    this.switchTopTab('player-info');

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

  hidePanel(): void {
    const panel = document.getElementById('bottom-panel');
    if (panel) {
      panel.style.display = 'none';
      panel.classList.remove('expanded');
    }
    this.selectedPlayerId = null;
    this.selectedPlayer = null;
    this.inventoryHistory = [];
    this.isExpanded = false;

    // Reset expand button title
    const expandBtn = document.getElementById('expand-bottom-panel');
    if (expandBtn) {
      expandBtn.title = 'Expand panel';
    }
  },

  renderPlayerStats(player: Player): void {
    const container = document.getElementById('player-info-stats');
    if (!container) return;

    const isOnline = player.online === 1 || player.online === true;
    const lastSeen = player.lastSeen ? new Date(player.lastSeen).toLocaleString() : 'Now';
    const playtime = this.formatPlaytime(player.playtimeSeconds);
    const currency =
      player.currency !== null && player.currency !== undefined ? player.currency.toLocaleString() : null;

    const profileUrl = player.playerId ? `${window.Auth.dashboardUrl}/player/${player.playerId}/info` : null;

    // Get current color for player
    const playerId = player.playerId;
    const currentColor = playerId ? window.ColorUtils.getPlayerColor(playerId) : window.ColorUtils.offlineColor;
    const hasCustomColor = playerId ? window.ColorUtils.hasCustomColor(playerId) : false;

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
      ${
        currency !== null
          ? `
      <div class="stat-item stat-currency">
        <span class="stat-label">Currency</span>
        <span class="stat-value currency-value">${currency}</span>
      </div>
      `
          : ''
      }
      <div class="stat-item">
        <span class="stat-label">Position</span>
        <span class="stat-value">X: ${Math.round(player.x ?? 0)}, Z: ${Math.round(player.z ?? 0)}${player.y !== null ? `, Y: ${Math.round(player.y)}` : ''}</span>
      </div>
      ${
        !isOnline
          ? `
      <div class="stat-item">
        <span class="stat-label">Last Seen</span>
        <span class="stat-value">${lastSeen}</span>
      </div>
      `
          : ''
      }
      ${
        playtime
          ? `
      <div class="stat-item">
        <span class="stat-label">Playtime</span>
        <span class="stat-value">${playtime}</span>
      </div>
      `
          : ''
      }
      ${
        profileUrl
          ? `
      <div class="stat-item">
        <a href="${profileUrl}" target="_blank" class="profile-link">View Takaro Profile</a>
      </div>
      `
          : ''
      }
    `;

    // Attach color picker event handlers
    if (playerId) {
      this.attachColorPickerHandlers(playerId);
    }
  },

  // Attach handlers for color picker
  attachColorPickerHandlers(playerId: string): void {
    const colorPicker = document.getElementById('player-color-picker') as HTMLInputElement | null;
    const resetBtn = document.getElementById('reset-color-btn') as HTMLButtonElement | null;

    if (colorPicker && playerId) {
      colorPicker.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        window.ColorUtils.setCustomColor(playerId, target.value);
        // Enable reset button
        if (resetBtn) resetBtn.disabled = false;
      });
    }

    if (resetBtn && playerId) {
      resetBtn.addEventListener('click', () => {
        window.ColorUtils.clearCustomColor(playerId);
        // Update color picker to show auto color
        if (colorPicker) {
          colorPicker.value = this.colorToHex(window.ColorUtils.getAutoColor(playerId));
        }
        resetBtn.disabled = true;
      });
    }
  },

  // Convert HSL or any color to hex for color picker input
  colorToHex(color: string): string {
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
      const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
      const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
      const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }

    return '#808080'; // fallback
  },

  formatPlaytime(seconds?: number): string | null {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  },

  async loadAndRenderInventory(): Promise<void> {
    const currentContainer = document.getElementById('current-inventory-table');
    const diffContainer = document.getElementById('inventory-diff-list');

    if (!this.selectedPlayerId) return;

    // Show loading state
    if (currentContainer) currentContainer.innerHTML = '<div class="loading-text">Loading inventory...</div>';
    if (diffContainer) diffContainer.innerHTML = '<div class="loading-text">Loading history...</div>';

    try {
      // Get time range from TimeRange module
      const { start, end }: DateRange = window.TimeRange.getDateRange();

      // Fetch inventory history
      const inventory = await window.API.getPlayerInventory(
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

  renderCurrentInventory(inventory: InventoryItem[]): void {
    const container = document.getElementById('current-inventory-table');
    if (!container) return;

    if (!inventory || inventory.length === 0) {
      container.innerHTML = '<div class="inventory-empty">No inventory data available</div>';
      return;
    }

    // Group by timestamp to get the most recent snapshot
    const byTimestamp: Record<string, InventoryItem[]> = {};
    for (const item of inventory) {
      const ts = item.createdAt || '';
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

    const rows = items
      .map((item) => {
        const itemCode = item.itemCode || item.itemName || 'Unknown';
        const displayName = item.itemName || item.itemCode || 'Unknown';
        const quality =
          item.quality && item.quality !== '-1' && item.quality !== null
            ? `<span class="item-quality">Q${item.quality}</span>`
            : '';
        const icon = this.createItemIcon(itemCode);
        const itemId = item.itemId || '';
        return `<tr data-item-id="${itemId}" data-item-name="${this.escapeHtml(displayName)}" data-item-code="${this.escapeHtml(itemCode)}">
        <td class="item-name">${icon}${this.escapeHtml(displayName)}${quality}</td>
        <td class="item-count">${item.quantity || 1}</td>
      </tr>`;
      })
      .join('');

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

    // Make inventory items clickable
    this.attachInventoryClickHandlers();
  },

  renderInventoryDiff(inventory: InventoryItem[]): void {
    const container = document.getElementById('inventory-diff-list');
    if (!container) return;

    if (!inventory || inventory.length === 0) {
      container.innerHTML = '<div class="inventory-empty">No inventory history available</div>';
      return;
    }

    // Group by timestamp
    const byTimestamp: Record<string, InventoryItem[]> = {};
    for (const item of inventory) {
      const ts = item.createdAt || '';
      if (!byTimestamp[ts]) byTimestamp[ts] = [];
      byTimestamp[ts].push(item);
    }

    const timestamps = Object.keys(byTimestamp).sort();

    if (timestamps.length < 2) {
      container.innerHTML = '<div class="inventory-empty">Not enough snapshots to show changes</div>';
      return;
    }

    // Calculate diffs between consecutive snapshots
    const diffs: Array<{ timestamp: string } & InventoryDiff> = [];
    for (let i = 1; i < timestamps.length; i++) {
      const prevSnapshot = byTimestamp[timestamps[i - 1]];
      const currSnapshot = byTimestamp[timestamps[i]];
      const diff = this.calculateDiff(prevSnapshot, currSnapshot);

      if (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0) {
        diffs.push({
          timestamp: timestamps[i],
          ...diff,
        });
      }
    }

    if (diffs.length === 0) {
      container.innerHTML = '<div class="inventory-empty">No inventory changes in this time range</div>';
      return;
    }

    // Render diffs (most recent first)
    const diffHtml = diffs
      .reverse()
      .map((diff) => {
        const time = new Date(diff.timestamp).toLocaleString();

        const addedHtml = diff.added
          .map((item) => {
            const icon = this.createItemIcon(item.code || item.name);
            return `<div class="diff-item diff-added">${icon}<span class="diff-symbol">+</span> ${this.escapeHtml(item.name)} x${item.quantity}${item.quality ? ` (Q${item.quality})` : ''}</div>`;
          })
          .join('');

        const removedHtml = diff.removed
          .map((item) => {
            const icon = this.createItemIcon(item.code || item.name);
            return `<div class="diff-item diff-removed">${icon}<span class="diff-symbol">-</span> ${this.escapeHtml(item.name)} x${item.quantity}${item.quality ? ` (Q${item.quality})` : ''}</div>`;
          })
          .join('');

        const changedHtml = diff.changed
          .map((item) => {
            const icon = this.createItemIcon(item.code || item.name);
            const change = item.quantityChange > 0 ? `+${item.quantityChange}` : item.quantityChange;
            return `<div class="diff-item diff-changed">${icon}<span class="diff-symbol">~</span> ${this.escapeHtml(item.name)} ${change} (now ${item.quantity})</div>`;
          })
          .join('');

        return `
        <div class="inventory-diff-entry">
          <div class="diff-timestamp">${time}</div>
          ${addedHtml}${removedHtml}${changedHtml}
        </div>
      `;
      })
      .join('');

    container.innerHTML = `<div class="diff-list">${diffHtml}</div>`;
  },

  calculateDiff(prevSnapshot: InventoryItem[], currSnapshot: InventoryItem[]): InventoryDiff {
    const added: DiffItem[] = [];
    const removed: DiffItem[] = [];
    const changed: ChangedItem[] = [];

    // Create maps for comparison (using itemName or itemCode as key)
    const prevMap = new Map<string, DiffItem>();
    for (const item of prevSnapshot) {
      const name = item.itemName || item.itemCode || 'unknown';
      const code = item.itemCode || item.itemName || 'unknown';
      const qualityKey = `${name}|${item.quality || ''}`;
      prevMap.set(qualityKey, {
        name: name,
        code: code,
        quantity: item.quantity || 1,
        quality: item.quality,
      });
    }

    const currMap = new Map<string, DiffItem>();
    for (const item of currSnapshot) {
      const name = item.itemName || item.itemCode || 'unknown';
      const code = item.itemCode || item.itemName || 'unknown';
      const qualityKey = `${name}|${item.quality || ''}`;
      currMap.set(qualityKey, {
        name: name,
        code: code,
        quantity: item.quantity || 1,
        quality: item.quality,
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
          quantityChange: curr.quantity - prev.quantity,
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

  escapeHtml(text: string): string {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  getItemIconUrl(itemName: string): string | null {
    if (!itemName) return null;
    // The icon filename matches the item code/name from the game
    return `${this.ICON_BASE_URL}${encodeURIComponent(itemName)}.png`;
  },

  createItemIcon(itemName: string): string {
    const iconUrl = this.getItemIconUrl(itemName);
    if (!iconUrl) return '';
    // Use onerror to hide broken images gracefully
    return `<img src="${iconUrl}" class="item-icon" alt="" onerror="this.style.display='none'">`;
  },

  // Called when time range changes to refresh inventory
  async onTimeRangeChange(): Promise<void> {
    if (this.selectedPlayerId && !this.isLoading) {
      await this.loadAndRenderInventory();
    }
  },

  // Render the movement tab with position timeline
  renderMovementTab(): void {
    const statsContainer = document.getElementById('movement-stats');
    const timelineContainer = document.getElementById('movement-timeline');

    if (!statsContainer || !timelineContainer) return;

    // Get movement data from History module
    const playerId = this.selectedPlayerId;
    const paths = window.History?.paths || {};

    // Find matching player path (try different ID formats)
    let playerPath: { name?: string; points?: Array<{ x: number; z: number; timestamp: string }> } | undefined =
      paths[playerId || ''];
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
      timelineContainer.innerHTML =
        '<div class="movement-empty">No movement data available. Enable "Show Paths" and select a time range to see movement history.</div>';
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
    const durationMs = lastTime.getTime() - firstTime.getTime();
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
    let prevPoint: { x: number; z: number } | null = null;

    const entriesHtml = recentPoints
      .map((point) => {
        const time = new Date(point.timestamp);
        const timeStr = time.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });

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
      })
      .join('');

    timelineContainer.innerHTML = entriesHtml || '<div class="movement-empty">No movement data</div>';
  },

  // Load items for autocomplete
  async loadItems(gameServerId: string): Promise<void> {
    this.gameServerId = gameServerId;
    try {
      this.items = await window.API.getItems(gameServerId);
      console.log(`[PlayerInfo] Loaded ${this.items.length} items for autocomplete`);
    } catch (error) {
      console.error('[PlayerInfo] Failed to load items:', error);
      this.items = [];
    }
  },

  // Update item suggestions in datalist based on search query
  async updateItemSuggestions(query: string): Promise<void> {
    if (!this.gameServerId) return;

    try {
      // Fetch items matching the query
      const items = await window.API.getItems(this.gameServerId, query);
      this.items = items;

      // Update datalist
      const datalist = document.getElementById('item-suggestions');
      if (datalist) {
        datalist.innerHTML = items
          .slice(0, 20)
          .map((item) => `<option value="${this.escapeHtml(item.name)}">`)
          .join('');
      }
    } catch (error) {
      console.error('[PlayerInfo] Failed to fetch item suggestions:', error);
    }
  },

  // Clear item filter
  clearItemFilter(): void {
    this.currentItemSearch = null;
    this.itemSearchResults = [];

    // Clear input
    const input = document.getElementById('item-search') as HTMLInputElement | null;
    if (input) input.value = '';

    // Hide filter indicator
    const indicator = document.getElementById('item-filter-indicator');
    if (indicator) indicator.style.display = 'none';

    // Clear results
    const resultsContainer = document.getElementById('item-search-results-list');
    if (resultsContainer) {
      resultsContainer.innerHTML =
        '<div class="item-search-empty">Search for an item above or click an item in a player\'s inventory to find all players who have had it.</div>';
    }

    // Clear query display
    const queryEl = document.getElementById('item-search-query');
    if (queryEl) queryEl.innerHTML = '';

    // Clear player list filter
    if (window.PlayerList) {
      window.PlayerList.clearItemFilter();
    }
  },

  // Item search functionality - search for players who have had a specific item

  // Search by item ID directly (called when clicking an item in inventory)
  async searchByItemId(itemId: string, itemName: string, startDate?: string, endDate?: string): Promise<void> {
    console.log(`[PlayerInfo] Searching for players with item ID: ${itemId} (${itemName})`);

    this.currentItemSearch = { itemId, itemName };

    // Show loading in the item search tab
    const resultsContainer = document.getElementById('item-search-results-list');
    const queryEl = document.getElementById('item-search-query');

    if (queryEl) {
      queryEl.innerHTML = `Searching for: <strong>${this.escapeHtml(itemName)}</strong>`;
    }
    if (resultsContainer) {
      resultsContainer.innerHTML = '<div class="loading-text">Searching for players...</div>';
    }

    // Show the bottom panel and switch to Item Search top-level tab
    const panel = document.getElementById('bottom-panel');
    if (panel) {
      panel.style.display = 'flex';
    }
    this.switchTopTab('item-search');

    // Update filter indicator
    const indicator = document.getElementById('item-filter-indicator');
    const filterText = document.getElementById('item-filter-text');
    if (indicator && filterText) {
      filterText.textContent = `Searching for: ${itemName}`;
      indicator.style.display = 'flex';
    }

    try {
      // Get time range if not provided
      if (!startDate || !endDate) {
        const range: DateRange = window.TimeRange
          ? window.TimeRange.getDateRange()
          : { start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() };
        startDate = startDate || range.start.toISOString();
        endDate = endDate || range.end.toISOString();
      }

      // Call the API
      const results = await window.API.getPlayersByItem(itemId, startDate, endDate);
      this.itemSearchResults = results;

      // Extract player IDs and update filter
      const playerIds = [...new Set(results.map((r) => r.playerId))];

      // Update player list filter
      if (window.PlayerList) {
        window.PlayerList.setItemFilter(playerIds, itemName);
      }

      // Render results in the Item Search tab
      this.renderItemSearchResults(itemName, results);
    } catch (error) {
      console.error('[PlayerInfo] Item search error:', error);
      if (resultsContainer) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        resultsContainer.innerHTML = `<div class="error-text">Search failed: ${this.escapeHtml(errorMsg)}</div>`;
      }
    }
  },

  // Search by item name (called from search input)
  async searchByItemName(itemName: string, startDate?: string, endDate?: string): Promise<void> {
    console.log(`[PlayerInfo] Searching by item name: "${itemName}"`);

    // We need to find an itemId that matches this name
    // First, check our cached items from autocomplete
    let matchingItem = this.items.find((item) => item.name && item.name.toLowerCase() === itemName.toLowerCase());

    // If not found in items, check inventory history
    if (!matchingItem && this.inventoryHistory && this.inventoryHistory.length > 0) {
      const inventoryMatch = this.inventoryHistory.find(
        (item) =>
          (item.itemName && item.itemName.toLowerCase().includes(itemName.toLowerCase())) ||
          (item.itemCode && item.itemCode.toLowerCase().includes(itemName.toLowerCase()))
      );
      if (inventoryMatch && inventoryMatch.itemId) {
        matchingItem = { id: inventoryMatch.itemId, name: inventoryMatch.itemName || inventoryMatch.itemCode || '' };
        console.log(`[PlayerInfo] Found item ID in inventory cache: ${matchingItem.id}`);
      }
    }

    // If we still don't have an itemId, show a message
    if (!matchingItem || !matchingItem.id) {
      const resultsContainer = document.getElementById('item-search-results-list');
      const queryEl = document.getElementById('item-search-query');

      if (queryEl) {
        queryEl.innerHTML = `Searching for: <strong>${this.escapeHtml(itemName)}</strong>`;
      }

      // Switch to Item Search tab
      const panel = document.getElementById('bottom-panel');
      if (panel) panel.style.display = 'flex';
      this.switchTopTab('item-search');

      if (resultsContainer) {
        resultsContainer.innerHTML = `
          <div class="item-search-hint">
            <p>Item not found. Try selecting from the dropdown suggestions or click on an item in a player's inventory.</p>
          </div>
        `;
      }
      return;
    }

    // We have an itemId, perform the search
    await this.searchByItemId(matchingItem.id, matchingItem.name || itemName, startDate, endDate);
  },

  // Render item search results in the Item Search tab
  showItemSearchResults(itemName: string, results: ItemSearchResult[]): void {
    this.renderItemSearchResults(itemName, results);
  },

  renderItemSearchResults(itemName: string, results: ItemSearchResult[]): void {
    const resultsContainer = document.getElementById('item-search-results-list');
    const queryEl = document.getElementById('item-search-query');

    if (queryEl) {
      queryEl.innerHTML = `Results for: <strong>${this.escapeHtml(itemName)}</strong>`;
    }

    if (!resultsContainer) return;

    if (!results || results.length === 0) {
      resultsContainer.innerHTML =
        '<div class="item-search-empty">No players found with this item in the selected time range.</div>';
      return;
    }

    // Group results by player
    const byPlayer: Record<string, PlayerGroupedResult> = {};
    for (const result of results) {
      const playerId = result.playerId;
      if (!byPlayer[playerId]) {
        byPlayer[playerId] = {
          playerId,
          playerName: result.playerName || 'Unknown',
          entries: [],
        };
      }
      byPlayer[playerId].entries.push({
        quantity: result.quantity || 1,
        quality: result.quality,
        createdAt: result.createdAt || '',
      });
    }

    // Sort entries within each player by time (most recent first)
    for (const playerId in byPlayer) {
      byPlayer[playerId].entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // Sort players by most recent entry
    const sortedPlayers = Object.values(byPlayer).sort((a, b) => {
      const aTime = new Date(a.entries[0].createdAt);
      const bTime = new Date(b.entries[0].createdAt);
      return bTime.getTime() - aTime.getTime();
    });

    // Render player cards
    const html = sortedPlayers
      .map((player) => {
        const entriesHtml = player.entries
          .slice(0, 5)
          .map((entry) => {
            const time = this.formatRelativeTime(entry.createdAt);
            const quality = entry.quality && entry.quality !== '-1' ? ` Q${entry.quality}` : '';
            return `<div class="item-entry">x${entry.quantity}${quality}, ${time}</div>`;
          })
          .join('');

        const moreCount =
          player.entries.length > 5 ? `<div class="item-entry-more">+${player.entries.length - 5} more</div>` : '';

        return `
        <div class="item-player-card" data-player-id="${player.playerId}">
          <div class="item-player-name">${this.escapeHtml(player.playerName)}</div>
          <div class="item-player-entries">
            ${entriesHtml}
            ${moreCount}
          </div>
        </div>
      `;
      })
      .join('');

    resultsContainer.innerHTML = html;

    // Attach click handlers to player cards - click opens player in Player Info tab
    resultsContainer.querySelectorAll('.item-player-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const cardEl = card as HTMLElement;
        const playerId = cardEl.dataset.playerId;

        if (!playerId) return;

        // Show the player's info in the Player Info tab
        await this.showPlayer(playerId);

        // Also focus on the player in the map if available
        if (window.Players && window.Players.focusPlayer) {
          window.Players.focusPlayer(playerId);
        }
      });
    });
  },

  formatRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  },

  // Make inventory items clickable for item search
  attachInventoryClickHandlers(): void {
    const inventoryTable = document.querySelector('.inventory-table tbody');
    if (!inventoryTable) return;

    inventoryTable.querySelectorAll('tr').forEach((row) => {
      row.classList.add('clickable-item');
      row.addEventListener('click', () => {
        const rowEl = row as HTMLElement;
        const itemId = rowEl.dataset.itemId;
        const itemName = rowEl.dataset.itemName;
        const itemCode = rowEl.dataset.itemCode;

        if (itemId) {
          this.searchByItemId(itemId, itemName || itemCode || '');
        } else {
          // Fallback: try to find itemId in inventory history
          const item = this.inventoryHistory.find((i) => i.itemName === itemName || i.itemCode === itemCode);
          if (item && item.itemId) {
            this.searchByItemId(item.itemId, itemName || itemCode || '');
          } else {
            // Last resort: search by name
            this.searchByItemName(itemName || itemCode || '');
          }
        }
      });
    });
  },
};

export { PlayerInfo };
window.PlayerInfo = PlayerInfo;
