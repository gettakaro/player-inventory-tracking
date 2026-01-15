// Player marker management

import type { Player } from './types.js';

declare const L: typeof import('leaflet');

export const Players = {
  markers: new Map<string | number, L.Marker>(),
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

  createPopupContent(player: Player): string {
    const lastSeen = player.lastSeen ? new Date(player.lastSeen).toLocaleString() : 'Now';

    const profileUrl = player.playerId ? `${window.Auth.dashboardUrl}/player/${player.playerId}/info` : null;

    const playtime = this.formatPlaytime(player.playtimeSeconds);
    const currency = this.formatCurrency(player.currency);

    // Generate unique ID for this popup instance
    const popupId = `popup-${player.playerId || player.id}`;

    return `
      <div class="player-popup" data-player-id="${player.playerId}" data-popup-id="${popupId}">
        <h4>${player.name}</h4>
        <p><strong>Position:</strong> X: ${Math.round(player.x ?? 0)}, Z: ${Math.round(player.z ?? 0)}</p>
        ${player.y !== null ? `<p><strong>Height:</strong> ${Math.round(player.y)}</p>` : ''}
        <p>
          <span class="online-status ${player.online ? 'online' : 'offline'}">
            ${player.online ? 'Online' : 'Offline'}
          </span>
        </p>
        ${!player.online ? `<p><strong>Last seen:</strong> ${lastSeen}</p>` : ''}
        ${currency !== null ? `<p><strong>Currency:</strong> <span class="popup-currency-display">${currency}</span></p>` : ''}
        ${playtime ? `<p><strong>Playtime:</strong> ${playtime}</p>` : ''}
        ${profileUrl ? `<p><a href="${profileUrl}" target="_blank" class="profile-link">View Takaro Profile</a></p>` : ''}

        <!-- Admin Actions Section -->
        <div class="popup-actions">
          <button type="button" class="btn btn-sm popup-toggle-actions" data-toggle="actions-${popupId}">
            Admin Actions
          </button>

          <div id="actions-${popupId}" class="popup-actions-panel" style="display: none;">
            <!-- Give Item Form -->
            <div class="popup-action-section">
              <h5>Give Item</h5>
              <div class="popup-form">
                <input type="text"
                       class="popup-input popup-item-search"
                       placeholder="Item name..."
                       list="popup-items-${popupId}"
                       data-popup-id="${popupId}" />
                <datalist id="popup-items-${popupId}"></datalist>
                <div class="popup-form-row">
                  <div class="popup-field">
                    <label>Amount</label>
                    <input type="number"
                           class="popup-input popup-item-amount"
                           value="1"
                           min="1" />
                  </div>
                  <div class="popup-field">
                    <label>Quality (1-6)</label>
                    <input type="text"
                           class="popup-input popup-item-quality"
                           value="1" />
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-primary popup-give-item">Give Item</button>
              </div>
            </div>

            <!-- Add Currency Form -->
            <div class="popup-action-section">
              <h5>Add Currency</h5>
              <div class="popup-form popup-form-inline">
                <input type="number"
                       class="popup-input popup-currency-amount"
                       placeholder="Amount"
                       min="1" />
                <button type="button" class="btn btn-sm btn-primary popup-add-currency">Add</button>
              </div>
            </div>

            <!-- Status Message -->
            <div class="popup-status" id="status-${popupId}"></div>
          </div>
        </div>
      </div>
    `;
  },

  async update(gameServerId: string): Promise<void> {
    if (!window.GameMap.map) return;

    this.gameServerId = gameServerId;

    try {
      // Get time range for filtering - now passed to API for server-side filtering
      let startIso: string | undefined;
      let endIso: string | undefined;
      let startTime: number | null = null;
      let endTime: number | null = null;
      if (window.TimeRange) {
        const { start, end } = window.TimeRange.getDateRange();
        startIso = start.toISOString();
        endIso = end.toISOString();
        startTime = start.getTime();
        endTime = end.getTime();
      }

      // Show loading indicator
      const playerCountEl = document.getElementById('player-count');
      if (playerCountEl) {
        playerCountEl.textContent = 'Loading players...';
      }

      // Get players with server-side filtering by date range
      const players: Player[] = await window.API.getPlayers(gameServerId, startIso, endIso);

      // Store for lookup by other modules (e.g., AreaSearch)
      this.allPlayers = players;

      // Filter players for markers and count
      const playersToRender: Array<{ player: Player; isOnline: boolean }> = [];
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

        // Skip offline players outside time range
        if (!isOnline && startTime && endTime && player.lastSeen) {
          const lastSeenTime = new Date(player.lastSeen).getTime();
          if (lastSeenTime < startTime || lastSeenTime > endTime) continue;
        }

        // Skip if player is not selected (only when selections exist)
        if (this.selectedPlayers.size > 0 && !this.selectedPlayers.has(String(player.id))) {
          continue;
        }

        playersToRender.push({ player, isOnline });
      }

      // Update status immediately so user sees progress
      if (playerCountEl) {
        playerCountEl.textContent = `Players: ${onlineCount} online, ${offlineCount} offline`;
      }

      // Sync with player list panel early (non-blocking for marker creation)
      if (window.PlayerList) {
        const needsRefresh = !window.PlayerList.hasInitializedSelection;
        // Defer PlayerList update slightly to not block marker rendering
        setTimeout(() => {
          window.PlayerList.updatePlayers(players);
          if (needsRefresh && window.PlayerList.selectedPlayers.size > 0) {
            this.selectedPlayers = window.PlayerList.selectedPlayers;
            this.refreshVisibility();
          }
        }, 0);
      }

      // Process markers in batches to avoid blocking UI
      const BATCH_SIZE = 50;
      const currentIds = new Set<string | number>();

      for (let i = 0; i < playersToRender.length; i += BATCH_SIZE) {
        const batch = playersToRender.slice(i, i + BATCH_SIZE);

        for (const { player, isOnline } of batch) {
          currentIds.add(player.id);
          // player.x and player.z are guaranteed to be non-null here (filtered earlier)
          const pos = window.GameMap.gameToLatLng(player.x as number, player.z as number);

          const existingMarker = this.markers.get(player.id);
          if (existingMarker) {
            // Update existing marker
            const marker = existingMarker;
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

            if (window.GameMap.map) {
              marker.addTo(window.GameMap.map);
            }
            this.markers.set(player.id, marker);
          }
        }

        // Yield to browser between batches (allows UI to update/respond)
        if (i + BATCH_SIZE < playersToRender.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Remove markers for players no longer in list
      for (const [id, marker] of this.markers) {
        if (!currentIds.has(id)) {
          marker.remove();
          this.markers.delete(id);
        }
      }

      // Update last update time
      const lastUpdateEl = document.getElementById('last-update');
      if (lastUpdateEl) {
        lastUpdateEl.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
      }
    } catch (error) {
      console.error('Failed to update players:', error);
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
          if (window.GameMap.map && !window.GameMap.map.hasLayer(existingMarker)) {
            existingMarker.addTo(window.GameMap.map);
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
          if (window.GameMap.map) {
            marker.addTo(window.GameMap.map);
          }
          this.markers.set(player.id, marker);
        }
      } else {
        // Hide marker if it exists
        if (existingMarker && window.GameMap.map?.hasLayer(existingMarker)) {
          existingMarker.remove();
        }
      }
    }
  },

  startAutoRefresh(gameServerId: string, intervalMs: number = 30000): void {
    this.stopAutoRefresh();

    // Initial update - don't block, let it run in background
    // This allows the map to be visible immediately while players load
    this.update(gameServerId);

    // Set up interval for subsequent updates
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

  // Load ALL players (slow for large servers, but complete)
  async loadAllPlayers(): Promise<void> {
    if (!this.gameServerId || !window.GameMap.map) return;

    const btn = document.getElementById('load-all-players-btn') as HTMLButtonElement | null;
    const playerCountEl = document.getElementById('player-count');

    try {
      // Update UI to show loading
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Loading...';
      }
      if (playerCountEl) {
        playerCountEl.textContent = 'Loading all players (this may take a while)...';
      }

      // Fetch ALL players
      const players: Player[] = await window.API.getPlayers(this.gameServerId, undefined, undefined, true);

      // Store for lookup by other modules
      this.allPlayers = players;

      // Count players
      let onlineCount = 0;
      let offlineCount = 0;
      for (const player of players) {
        if (player.online === 1 || player.online === true) onlineCount++;
        else offlineCount++;
      }

      // Update status
      if (playerCountEl) {
        playerCountEl.textContent = `Players: ${onlineCount} online, ${offlineCount} offline (ALL loaded)`;
      }

      // Sync with player list panel
      if (window.PlayerList) {
        window.PlayerList.updatePlayers(players);
      }

      // Refresh map markers
      this.refreshVisibility();
    } catch (error) {
      console.error('Failed to load all players:', error);
      if (playerCountEl) {
        playerCountEl.textContent = 'Failed to load all players';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Load All';
      }
    }
  },

  clear(): void {
    this.stopAutoRefresh();

    for (const marker of this.markers.values()) {
      marker.remove();
    }
    this.markers.clear();

    if (window.PlayerList) {
      window.PlayerList.clear();
    }
  },

  // Set up event delegation for popup interactions
  setupPopupEventDelegation(): void {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    // Debounce timer for item search
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Handle click events
    mapContainer.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      // Handle toggle actions button
      if (target.classList.contains('popup-toggle-actions')) {
        const panelId = target.dataset.toggle;
        if (panelId) {
          const panel = document.getElementById(panelId);
          if (panel) {
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? 'block' : 'none';
            target.textContent = isHidden ? 'Hide Actions' : 'Admin Actions';
          }
        }
        return;
      }

      // Handle Give Item button
      if (target.classList.contains('popup-give-item')) {
        const popup = target.closest('.player-popup') as HTMLElement;
        if (!popup) return;

        const playerId = popup.dataset.playerId;
        const popupId = popup.dataset.popupId;
        const itemInput = popup.querySelector('.popup-item-search') as HTMLInputElement;
        const amountInput = popup.querySelector('.popup-item-amount') as HTMLInputElement;
        const qualityInput = popup.querySelector('.popup-item-quality') as HTMLInputElement;

        if (!playerId || !popupId || !itemInput?.value || !amountInput?.value) {
          if (popupId) this.showPopupStatus(popupId, 'Please fill in item name and amount', 'error');
          return;
        }

        if (!this.gameServerId) return;

        const btn = target as HTMLButtonElement;
        try {
          btn.disabled = true;
          btn.textContent = 'Giving...';

          await window.API.giveItem(
            this.gameServerId,
            playerId,
            itemInput.value,
            parseInt(amountInput.value, 10),
            qualityInput?.value || '1'
          );

          this.showPopupStatus(popupId, `Gave ${amountInput.value}x ${itemInput.value}`, 'success');
          itemInput.value = '';
          amountInput.value = '1';
        } catch (error) {
          this.showPopupStatus(popupId, error instanceof Error ? error.message : 'Failed', 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Give Item';
        }
        return;
      }

      // Handle Add Currency button
      if (target.classList.contains('popup-add-currency')) {
        const popup = target.closest('.player-popup') as HTMLElement;
        if (!popup) return;

        const playerId = popup.dataset.playerId;
        const popupId = popup.dataset.popupId;
        const currencyInput = popup.querySelector('.popup-currency-amount') as HTMLInputElement;

        if (!playerId || !popupId || !currencyInput?.value) {
          if (popupId) this.showPopupStatus(popupId, 'Please enter a currency amount', 'error');
          return;
        }

        if (!this.gameServerId) return;

        const btn = target as HTMLButtonElement;
        try {
          btn.disabled = true;
          btn.textContent = 'Adding...';

          const amount = parseInt(currencyInput.value, 10);
          await window.API.addCurrency(this.gameServerId, playerId, amount);

          this.showPopupStatus(popupId, `Added ${amount} currency`, 'success');
          currencyInput.value = '';

          // Update currency display in popup
          const currencyDisplay = popup.querySelector('.popup-currency-display');
          if (currencyDisplay) {
            const currentCurrency = parseInt(currencyDisplay.textContent?.replace(/,/g, '') || '0', 10);
            currencyDisplay.textContent = (currentCurrency + amount).toLocaleString();
          }

          // Refresh player data
          this.update(this.gameServerId);
        } catch (error) {
          this.showPopupStatus(popupId, error instanceof Error ? error.message : 'Failed', 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Add';
        }
        return;
      }
    });

    // Handle item search input with debounce
    mapContainer.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;

      if (target.classList.contains('popup-item-search')) {
        clearTimeout(searchTimeout);
        const query = target.value.trim();
        const popupId = target.dataset.popupId;

        if (query.length >= 2 && popupId && this.gameServerId) {
          const serverId = this.gameServerId;
          searchTimeout = setTimeout(async () => {
            try {
              const items = await window.API.getItems(serverId, query);
              const datalist = document.getElementById(`popup-items-${popupId}`);
              if (datalist) {
                datalist.innerHTML = items
                  .slice(0, 20)
                  .map((item) => `<option value="${item.name}">`)
                  .join('');
              }
            } catch (error) {
              console.error('Failed to fetch items:', error);
            }
          }, 300);
        }
      }
    });
  },

  // Show status message in popup
  showPopupStatus(popupId: string, message: string, type: 'success' | 'error'): void {
    const statusEl = document.getElementById(`status-${popupId}`);
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `popup-status popup-status-${type}`;

      // Auto-clear after 3 seconds
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'popup-status';
      }, 3000);
    }
  },

  // Focus on a player marker on the map
  focusPlayer(playerId: string): void {
    const player = this.allPlayers.find(
      (p) => String(p.playerId) === String(playerId) || String(p.id) === String(playerId)
    );

    if (player && player.x !== null && player.z !== null && window.GameMap.map) {
      const pos = window.GameMap.gameToLatLng(player.x, player.z);
      window.GameMap.map.setView(pos, window.GameMap.map.getZoom());

      // Open the popup
      const marker = this.markers.get(player.id);
      if (marker) {
        marker.openPopup();
      }
    }
  },
};

window.Players = Players;
