// Player marker management

import type { InventoryItem, Player } from './types.js';

declare const L: typeof import('leaflet');

export const Players = {
  markers: new Map<string | number, L.Marker>(),
  inventories: new Map<string, InventoryItem[]>(),
  allPlayers: [] as Player[],
  showOnline: true,
  showOffline: true,
  selectedPlayers: new Set<string>(),
  refreshInterval: null as ReturnType<typeof setInterval> | null,
  gameServerId: null as string | null,

  // Create custom marker icons with player-specific colors
  createIcon(online: boolean, playerId: string | null = null): L.DivIcon {
    const size = 24;
    // Online players get unique colors based on their ID, offline players are gray
    const color = online && playerId ? window.ColorUtils.getPlayerColor(playerId) : window.ColorUtils.offlineColor;

    const personSvg = `
      <svg viewBox="0 0 24 24" width="${size}" height="${size}">
        <circle cx="12" cy="7" r="4" fill="${color}" stroke="white" stroke-width="1"/>
        <path d="M12 14c-5 0-9 2.5-9 5v2h18v-2c0-2.5-4-5-9-5z" fill="${color}" stroke="white" stroke-width="1"/>
      </svg>`;

    return L.divIcon({
      className: 'player-marker-container',
      html: `<div class="player-marker ${online ? 'online' : 'offline'}">${personSvg}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  },

  formatPlaytime(seconds: number | undefined): string | null {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  },

  formatCurrency(amount: number | undefined | null): string | null {
    if (amount === null || amount === undefined) return null;
    return amount.toLocaleString();
  },

  createInventoryTable(inventory: InventoryItem[] | undefined): string {
    if (!inventory || !Array.isArray(inventory) || inventory.length === 0) {
      return '<p class="inventory-empty">No inventory data available</p>';
    }

    // The Takaro API returns a flat array of items
    // Group by timestamp to get the most recent snapshot
    const byTimestamp: Record<string, InventoryItem[]> = {};
    for (const item of inventory) {
      const ts = item.createdAt || '';
      if (!byTimestamp[ts]) byTimestamp[ts] = [];
      byTimestamp[ts].push(item);
    }

    // Get the most recent timestamp's items
    const timestamps = Object.keys(byTimestamp).sort().reverse();
    if (timestamps.length === 0) {
      return '<p class="inventory-empty">No items in inventory</p>';
    }

    const items = byTimestamp[timestamps[0]];

    const rows = items
      .map((item) => {
        const quality =
          item.quality && item.quality !== '-1' && item.quality !== null
            ? `<span class="item-quality">Q${item.quality}</span>`
            : '';
        return `<tr>
        <td class="item-name">${item.itemName || item.itemCode || 'Unknown'}${quality}</td>
        <td class="item-count">${item.quantity || 1}</td>
      </tr>`;
      })
      .join('');

    return `
      <div class="inventory-section">
        <h5>Inventory (${items.length} items)</h5>
        <div class="inventory-table-wrapper">
          <table class="inventory-table">
            <thead>
              <tr><th>Item</th><th>Qty</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  createPopupContent(player: Player): string {
    const lastSeen = player.lastSeen ? new Date(player.lastSeen).toLocaleString() : 'Now';

    const profileUrl = player.playerId ? `${window.Auth.dashboardUrl}/player/${player.playerId}/info` : null;

    const playtime = this.formatPlaytime(player.playtimeSeconds);
    const currency = this.formatCurrency(player.currency);

    // Get inventory for this player (by ID)
    const inventory = this.inventories.get(player.playerId);
    const inventoryHtml = this.createInventoryTable(inventory);

    return `
      <div class="player-popup">
        <h4>${player.name}</h4>
        <p><strong>Position:</strong> X: ${Math.round(player.x!)}, Z: ${Math.round(player.z!)}</p>
        ${player.y !== null ? `<p><strong>Height:</strong> ${Math.round(player.y!)}</p>` : ''}
        <p>
          <span class="online-status ${player.online ? 'online' : 'offline'}">
            ${player.online ? 'Online' : 'Offline'}
          </span>
        </p>
        ${!player.online ? `<p><strong>Last seen:</strong> ${lastSeen}</p>` : ''}
        ${currency !== null ? `<p><strong>Currency:</strong> ${currency}</p>` : ''}
        ${playtime ? `<p><strong>Playtime:</strong> ${playtime}</p>` : ''}
        ${profileUrl ? `<p><a href="${profileUrl}" target="_blank" class="profile-link">View Takaro Profile</a></p>` : ''}
        <button class="btn btn-sm load-inventory-btn" data-player-id="${player.playerId}">Load Inventory</button>
        <div class="inventory-container" id="inventory-${player.playerId}">${inventoryHtml}</div>
      </div>
    `;
  },

  async update(gameServerId: string): Promise<void> {
    if (!window.GameMap.map) return;

    this.gameServerId = gameServerId;

    try {
      // Get all players from Takaro API (now returns both online and offline)
      const players: Player[] = await window.API.getPlayers(gameServerId);

      // Store for lookup by other modules (e.g., AreaSearch)
      this.allPlayers = players;

      const currentIds = new Set<string | number>();
      let onlineCount = 0;
      let offlineCount = 0;

      // Get time range for filtering offline players
      let startTime: number | null = null;
      let endTime: number | null = null;
      if (window.TimeRange) {
        const { start, end } = window.TimeRange.getDateRange();
        startTime = start.getTime();
        endTime = end.getTime();
      }

      for (const player of players) {
        const isOnline = player.online === 1 || player.online === true;

        // Count all players regardless of coordinates
        if (isOnline) onlineCount++;
        else offlineCount++;

        // Skip map marker if coordinates are invalid (player still appears in list)
        if (player.x === null || player.z === null) continue;

        // Skip based on visibility settings
        if (isOnline && !this.showOnline) continue;
        if (!isOnline && !this.showOffline) continue;

        // Skip offline players outside time range
        if (!isOnline && startTime && endTime && player.lastSeen) {
          const lastSeenTime = new Date(player.lastSeen).getTime();
          if (lastSeenTime < startTime || lastSeenTime > endTime) continue;
        }

        // Skip if player is not selected (only when selections exist)
        if (this.selectedPlayers.size > 0 && !this.selectedPlayers.has(String(player.id))) {
          continue;
        }

        currentIds.add(player.id);
        const pos = window.GameMap.gameToLatLng(player.x, player.z);

        if (this.markers.has(player.id)) {
          // Update existing marker
          const marker = this.markers.get(player.id)!;
          marker.setLatLng(pos);
          marker.setIcon(this.createIcon(isOnline, player.playerId));
          marker.getPopup()?.setContent(this.createPopupContent(player));
        } else {
          // Create new marker
          const marker = L.marker(pos, {
            icon: this.createIcon(isOnline, player.playerId),
          });

          marker.bindPopup(this.createPopupContent(player));

          // Add click handler to show player info panel
          marker.on('click', () => {
            if (window.PlayerInfo) {
              window.PlayerInfo.showPlayer(player.playerId || player.id);
            }
          });

          marker.addTo(window.GameMap.map!);
          this.markers.set(player.id, marker);
        }
      }

      // Remove markers for players no longer in list
      for (const [id, marker] of this.markers) {
        if (!currentIds.has(id)) {
          marker.remove();
          this.markers.delete(id);
        }
      }

      // Update status
      const playerCountEl = document.getElementById('player-count');
      if (playerCountEl) {
        playerCountEl.textContent = `Players: ${onlineCount} online, ${offlineCount} offline`;
      }
      const lastUpdateEl = document.getElementById('last-update');
      if (lastUpdateEl) {
        lastUpdateEl.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
      }

      // Sync with player list panel
      if (window.PlayerList) {
        const needsRefresh = !window.PlayerList.hasInitializedSelection;
        window.PlayerList.updatePlayers(players);
        // If this was the first initialization, refresh visibility with the new selection
        if (needsRefresh && window.PlayerList.selectedPlayers.size > 0) {
          this.selectedPlayers = window.PlayerList.selectedPlayers;
          this.refreshVisibility();
        }
      }
    } catch (error) {
      console.error('Failed to update players:', error);
    }
  },

  async loadPlayerInventory(playerId: string): Promise<InventoryItem[] | null> {
    try {
      const inventory = await window.API.getPlayerInventory(playerId);
      this.inventories.set(playerId, inventory);

      // Update the inventory container in the popup if it exists
      const container = document.getElementById(`inventory-${playerId}`);
      if (container) {
        container.innerHTML = this.createInventoryTable(inventory);
      }

      return inventory;
    } catch (error) {
      console.warn('Failed to fetch inventory for player:', playerId, (error as Error).message);
      return null;
    }
  },

  setShowOnline(show: boolean): void {
    this.showOnline = show;
    this.refreshVisibility();
  },

  setShowOffline(show: boolean): void {
    this.showOffline = show;
    this.refreshVisibility();
  },

  updateSelectionVisibility(selectedSet: Set<string>): void {
    this.selectedPlayers = selectedSet;
    this.refreshVisibility();
  },

  refreshVisibility(): void {
    if (!window.GameMap.map) return;

    // Get time range for filtering offline players
    let startTime: number | null = null;
    let endTime: number | null = null;
    if (window.TimeRange) {
      const { start, end } = window.TimeRange.getDateRange();
      startTime = start.getTime();
      endTime = end.getTime();
    }

    // Toggle visibility of markers without refetching from API
    for (const player of this.allPlayers) {
      // Skip players without valid coordinates
      if (player.x === null || player.z === null) continue;

      const isOnline = player.online === 1 || player.online === true;

      // Determine if marker should be visible
      let shouldShow = true;

      // Check visibility settings
      if (isOnline && !this.showOnline) shouldShow = false;
      if (!isOnline && !this.showOffline) shouldShow = false;

      // Check time range for offline players
      if (!isOnline && startTime && endTime && player.lastSeen) {
        const lastSeenTime = new Date(player.lastSeen).getTime();
        if (lastSeenTime < startTime || lastSeenTime > endTime) shouldShow = false;
      }

      // Check player selection
      if (this.selectedPlayers.size > 0 && !this.selectedPlayers.has(String(player.id))) {
        shouldShow = false;
      }

      const existingMarker = this.markers.get(player.id);

      if (shouldShow) {
        if (existingMarker) {
          // Show existing marker
          if (!window.GameMap.map!.hasLayer(existingMarker)) {
            existingMarker.addTo(window.GameMap.map!);
          }
        } else {
          // Create marker for newly visible player
          const pos = window.GameMap.gameToLatLng(player.x, player.z);
          const marker = L.marker(pos, {
            icon: this.createIcon(isOnline, player.playerId),
          });
          marker.bindPopup(this.createPopupContent(player));
          marker.on('click', () => {
            if (window.PlayerInfo) {
              window.PlayerInfo.showPlayer(player.playerId || player.id);
            }
          });
          marker.addTo(window.GameMap.map!);
          this.markers.set(player.id, marker);
        }
      } else {
        // Hide marker if it exists
        if (existingMarker && window.GameMap.map!.hasLayer(existingMarker)) {
          existingMarker.remove();
        }
      }
    }
  },

  startAutoRefresh(gameServerId: string, intervalMs: number = 30000): void {
    this.stopAutoRefresh();

    // Initial update
    this.update(gameServerId);

    // Set up interval
    this.refreshInterval = setInterval(() => {
      this.update(gameServerId);
    }, intervalMs);
  },

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  },

  clear(): void {
    this.stopAutoRefresh();

    for (const marker of this.markers.values()) {
      marker.remove();
    }
    this.markers.clear();
    this.inventories.clear();

    if (window.PlayerList) {
      window.PlayerList.clear();
    }
  },
};

// Handle inventory load button clicks (delegated event)
document.addEventListener('click', async (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('load-inventory-btn')) {
    const playerId = target.dataset.playerId;

    if (playerId) {
      (target as HTMLButtonElement).disabled = true;
      target.textContent = 'Loading...';

      await Players.loadPlayerInventory(playerId);

      target.textContent = 'Refresh Inventory';
      (target as HTMLButtonElement).disabled = false;
    }
  }
});

window.Players = Players;
