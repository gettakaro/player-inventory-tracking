// Player marker management

const Players = {
  markers: new Map(),
  inventories: new Map(),  // Store inventory by player ID
  allPlayers: [],  // Store all players for lookup by other modules
  showOnline: true,
  showOffline: true,
  selectedPlayers: new Set(),  // Track selected player IDs for visibility
  refreshInterval: null,
  gameServerId: null,

  // Create custom marker icons
  createIcon(online) {
    const size = 24;
    const color = online ? '#00d4ff' : '#6c757d';

    const personSvg = `
      <svg viewBox="0 0 24 24" width="${size}" height="${size}">
        <circle cx="12" cy="7" r="4" fill="${color}" stroke="white" stroke-width="1"/>
        <path d="M12 14c-5 0-9 2.5-9 5v2h18v-2c0-2.5-4-5-9-5z" fill="${color}" stroke="white" stroke-width="1"/>
      </svg>`;

    return L.divIcon({
      className: 'player-marker-container',
      html: `<div class="player-marker ${online ? 'online' : 'offline'}">${personSvg}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
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

  formatCurrency(amount) {
    if (amount === null || amount === undefined) return null;
    return amount.toLocaleString();
  },

  createInventoryTable(inventory) {
    if (!inventory || !Array.isArray(inventory) || inventory.length === 0) {
      return '<p class="inventory-empty">No inventory data available</p>';
    }

    // The Takaro API returns a flat array of items
    // Group by timestamp to get the most recent snapshot
    const byTimestamp = {};
    for (const item of inventory) {
      const ts = item.createdAt;
      if (!byTimestamp[ts]) byTimestamp[ts] = [];
      byTimestamp[ts].push(item);
    }

    // Get the most recent timestamp's items
    const timestamps = Object.keys(byTimestamp).sort().reverse();
    if (timestamps.length === 0) {
      return '<p class="inventory-empty">No items in inventory</p>';
    }

    const items = byTimestamp[timestamps[0]];

    const rows = items.map(item => {
      const quality = item.quality && item.quality !== '-1' && item.quality !== null
        ? `<span class="item-quality">Q${item.quality}</span>`
        : '';
      return `<tr>
        <td class="item-name">${item.itemName || item.itemCode || 'Unknown'}${quality}</td>
        <td class="item-count">${item.quantity || 1}</td>
      </tr>`;
    }).join('');

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

  createPopupContent(player) {
    const lastSeen = player.lastSeen
      ? new Date(player.lastSeen).toLocaleString()
      : 'Now';

    const profileUrl = player.playerId
      ? `https://dashboard.takaro.io/player/${player.playerId}/info`
      : null;

    const playtime = this.formatPlaytime(player.playtimeSeconds);
    const currency = this.formatCurrency(player.currency);

    // Get inventory for this player (by ID)
    const inventory = this.inventories.get(player.playerId);
    const inventoryHtml = this.createInventoryTable(inventory);

    return `
      <div class="player-popup">
        <h4>${player.name}</h4>
        <p><strong>Position:</strong> X: ${Math.round(player.x)}, Z: ${Math.round(player.z)}</p>
        ${player.y !== null ? `<p><strong>Height:</strong> ${Math.round(player.y)}</p>` : ''}
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

  async update(gameServerId) {
    if (!GameMap.map) return;

    this.gameServerId = gameServerId;

    try {
      // Get all players from Takaro API (now returns both online and offline)
      const players = await API.getPlayers(gameServerId);

      // Store for lookup by other modules (e.g., AreaSearch)
      this.allPlayers = players;

      const currentIds = new Set();
      let onlineCount = 0;
      let offlineCount = 0;

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

        // Skip if player is not selected (only when selections exist)
        if (this.selectedPlayers.size > 0 && !this.selectedPlayers.has(String(player.id))) {
          continue;
        }

        currentIds.add(player.id);
        const pos = GameMap.gameToLatLng(player.x, player.z);

        if (this.markers.has(player.id)) {
          // Update existing marker
          const marker = this.markers.get(player.id);
          marker.setLatLng(pos);
          marker.setIcon(this.createIcon(isOnline));
          marker.getPopup().setContent(this.createPopupContent(player));
        } else {
          // Create new marker
          const marker = L.marker(pos, {
            icon: this.createIcon(isOnline)
          });

          marker.bindPopup(this.createPopupContent(player));

          // Add click handler to show player info panel
          marker.on('click', () => {
            if (window.PlayerInfo) {
              PlayerInfo.showPlayer(player.playerId || player.id);
            }
          });

          marker.addTo(GameMap.map);
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
      document.getElementById('player-count').textContent =
        `Players: ${onlineCount} online, ${offlineCount} offline`;
      document.getElementById('last-update').textContent =
        `Last update: ${new Date().toLocaleTimeString()}`;

      // Sync with player list panel
      if (window.PlayerList) {
        const needsRefresh = !PlayerList.hasInitializedSelection;
        PlayerList.updatePlayers(players);
        // If this was the first initialization, refresh visibility with the new selection
        if (needsRefresh && PlayerList.selectedPlayers.size > 0) {
          this.selectedPlayers = PlayerList.selectedPlayers;
          this.refreshVisibility();
        }
      }

    } catch (error) {
      console.error('Failed to update players:', error);
    }
  },

  async loadPlayerInventory(playerId) {
    try {
      const inventory = await API.getPlayerInventory(playerId);
      this.inventories.set(playerId, inventory);

      // Update the inventory container in the popup if it exists
      const container = document.getElementById(`inventory-${playerId}`);
      if (container) {
        container.innerHTML = this.createInventoryTable(inventory);
      }

      return inventory;
    } catch (error) {
      console.warn('Failed to fetch inventory for player:', playerId, error.message);
      return null;
    }
  },

  setShowOnline(show) {
    this.showOnline = show;
    this.refreshVisibility();
  },

  setShowOffline(show) {
    this.showOffline = show;
    this.refreshVisibility();
  },

  updateSelectionVisibility(selectedSet) {
    this.selectedPlayers = selectedSet;
    this.refreshVisibility();
  },

  refreshVisibility() {
    // Remove all markers and re-add based on visibility
    for (const [id, marker] of this.markers) {
      marker.remove();
    }
    this.markers.clear();

    // Trigger a full update
    if (window.App && window.App.gameServerId) {
      this.update(window.App.gameServerId);
    }
  },

  startAutoRefresh(gameServerId, intervalMs = 30000) {
    this.stopAutoRefresh();

    // Initial update
    this.update(gameServerId);

    // Set up interval
    this.refreshInterval = setInterval(() => {
      this.update(gameServerId);
    }, intervalMs);
  },

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  },

  clear() {
    this.stopAutoRefresh();

    for (const marker of this.markers.values()) {
      marker.remove();
    }
    this.markers.clear();
    this.inventories.clear();

    if (window.PlayerList) {
      PlayerList.clear();
    }
  }
};

// Handle inventory load button clicks (delegated event)
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('load-inventory-btn')) {
    const playerId = e.target.dataset.playerId;

    if (playerId) {
      e.target.disabled = true;
      e.target.textContent = 'Loading...';

      await Players.loadPlayerInventory(playerId);

      e.target.textContent = 'Refresh Inventory';
      e.target.disabled = false;
    }
  }
});

window.Players = Players;
