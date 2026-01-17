// Player list panel management

import type { DateRange, Player } from './types.js';

interface CollapsedGroups {
  online: boolean;
  offline: boolean;
  [key: string]: boolean;
}

interface PlayerListModule {
  isCollapsed: boolean;
  searchTerm: string;
  players: Player[];
  selectedPlayers: Set<string>;
  hasInitializedSelection: boolean;
  collapsedGroups: CollapsedGroups;
  areaFilterActive: boolean;
  areaFilterPlayerIds: Set<string>;
  timeFilterEnabled: boolean;
  itemFilterActive: boolean;
  itemFilterPlayerIds: Set<string>;
  itemFilterName: string;

  init(): void;
  setupEventListeners(): void;
  toggle(): void;
  toggleGroup(group: string): void;
  saveState(): void;
  restoreState(): void;
  updatePlayers(players: Player[]): void;
  render(): void;
  updateGroupCheckbox(checkboxId: string, players: Player[]): void;
  renderPlayerList(players: Player[], isOnline: boolean): string;
  attachClickHandlers(): void;
  focusPlayer(playerId: string): void;
  formatLastSeen(timestamp: string): string;
  escapeHtml(text: string): string;
  clear(): void;
  isSelected(playerId: string | number): boolean;
  toggleSelection(playerId: string | number): void;
  selectAll(): void;
  deselectAll(): void;
  selectAllByStatus(isOnline: boolean, select: boolean): void;
  getFilteredPlayers(): Player[];
  notifySelectionChange(): void;
  selectOnly(playerIds: string[]): void;
  getSelectedTakaroIds(): Set<string>;
  setAreaFilter(playerIds: string[]): void;
  clearAreaFilter(): void;
  onTimeRangeChange(): void;
  updateFilterIndicator(): void;
  setItemFilter(playerIds: string[], itemName: string): void;
  clearItemFilter(): void;
}

const PlayerList: PlayerListModule = {
  isCollapsed: false,
  searchTerm: '',
  players: [],
  selectedPlayers: new Set<string>(), // Track selected player IDs
  hasInitializedSelection: false, // Track if we've done initial selection
  collapsedGroups: { online: false, offline: false }, // Track collapsed state
  areaFilterActive: false, // Track if area filter is active
  areaFilterPlayerIds: new Set<string>(), // Player IDs from area search
  timeFilterEnabled: true, // Filter offline players by time range
  itemFilterActive: false, // Track if item filter is active (set by PlayerInfo)
  itemFilterPlayerIds: new Set<string>(), // Player IDs from item search
  itemFilterName: '', // Name of the item being filtered

  init(): void {
    this.setupEventListeners();
    this.restoreState();
  },

  setupEventListeners(): void {
    // Toggle button
    document.getElementById('player-list-toggle')?.addEventListener('click', () => {
      this.toggle();
    });

    // Search input (sidebar)
    document.getElementById('player-search')?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.searchTerm = target.value.toLowerCase().trim();
      this.render();
    });

    // Select All / Deselect All buttons and Group checkboxes using event delegation
    const panel = document.getElementById('player-list-panel');
    if (panel) {
      panel.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.id === 'select-all-btn') {
          this.selectAll();
        } else if (target.id === 'deselect-all-btn') {
          this.deselectAll();
        }

        // Handle group header clicks for collapse/expand
        const header = target.closest('.player-group-header') as HTMLElement | null;
        if (header && !target.classList.contains('group-select-checkbox')) {
          const group = header.dataset.group;
          if (group) {
            this.toggleGroup(group);
          }
        }
      });
      panel.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.id === 'select-all-online') {
          this.selectAllByStatus(true, target.checked);
        } else if (target.id === 'select-all-offline') {
          this.selectAllByStatus(false, target.checked);
        }
      });
    }
  },

  toggle(): void {
    this.isCollapsed = !this.isCollapsed;
    const panel = document.getElementById('player-list-panel');
    panel?.classList.toggle('collapsed', this.isCollapsed);
    this.saveState();
  },

  toggleGroup(group: string): void {
    this.collapsedGroups[group] = !this.collapsedGroups[group];
    const groupEl = document.getElementById(`${group}-players-group`);
    if (groupEl) {
      groupEl.classList.toggle('collapsed', this.collapsedGroups[group]);
    }
    this.saveState();
  },

  saveState(): void {
    localStorage.setItem('playerListCollapsed', String(this.isCollapsed));
    localStorage.setItem('playerListCollapsedGroups', JSON.stringify(this.collapsedGroups));
  },

  restoreState(): void {
    const saved = localStorage.getItem('playerListCollapsed');
    if (saved === 'true') {
      this.isCollapsed = true;
      document.getElementById('player-list-panel')?.classList.add('collapsed');
    }

    // Restore collapsed groups state
    const savedGroups = localStorage.getItem('playerListCollapsedGroups');
    if (savedGroups) {
      try {
        this.collapsedGroups = JSON.parse(savedGroups);
        // Apply collapsed state to DOM
        if (this.collapsedGroups.online) {
          document.getElementById('online-players-group')?.classList.add('collapsed');
        }
        if (this.collapsedGroups.offline) {
          document.getElementById('offline-players-group')?.classList.add('collapsed');
        }
      } catch (_e) {
        // Ignore parse errors
      }
    }
  },

  // Called by Players.update() to sync data
  updatePlayers(players: Player[]): void {
    // Auto-select only online players on very first load
    if (!this.hasInitializedSelection) {
      players.forEach((p) => {
        const isOnline = p.online === 1 || p.online === true;
        if (isOnline) {
          this.selectedPlayers.add(String(p.id));
        }
      });
      this.hasInitializedSelection = true;
    } else {
      // Add any new online players to selection (players who just joined)
      players.forEach((p) => {
        const isOnline = p.online === 1 || p.online === true;
        if (isOnline && !this.players.find((existing) => String(existing.id) === String(p.id))) {
          this.selectedPlayers.add(String(p.id));
        }
      });
    }
    this.players = players;
    this.render();
  },

  render(): void {
    const onlineList = document.getElementById('online-players-list');
    const offlineList = document.getElementById('offline-players-list');

    if (!onlineList || !offlineList) return;

    // Start with all players
    let filteredPlayers = this.players;

    // Apply time filter based on lastSeen (if TimeRange is available)
    if (this.timeFilterEnabled && window.TimeRange) {
      const { start, end }: DateRange = window.TimeRange.getDateRange();
      const startTime = start.getTime();
      const endTime = end.getTime();

      const beforeCount = filteredPlayers.length;
      filteredPlayers = filteredPlayers.filter((player) => {
        // Always show online players regardless of time filter
        const isOnline = player.online === 1 || player.online === true;
        if (isOnline) return true;

        // For offline players, filter by lastSeen within time range
        if (!player.lastSeen) return false;
        const lastSeenTime = new Date(player.lastSeen).getTime();
        return lastSeenTime >= startTime && lastSeenTime <= endTime;
      });
      console.log(
        `[PlayerList] Time filter: ${beforeCount} → ${filteredPlayers.length} players (range: ${start.toISOString()} to ${end.toISOString()})`
      );
    }

    // Apply area filter if active
    if (this.areaFilterActive) {
      filteredPlayers = filteredPlayers.filter(
        (p) => this.areaFilterPlayerIds.has(String(p.id)) || this.areaFilterPlayerIds.has(String(p.playerId))
      );
    }

    // Apply item filter if active
    if (this.itemFilterActive) {
      filteredPlayers = filteredPlayers.filter(
        (p) => this.itemFilterPlayerIds.has(String(p.id)) || this.itemFilterPlayerIds.has(String(p.playerId))
      );
    }

    // Then filter by search term
    filteredPlayers = filteredPlayers.filter((player) => {
      if (!this.searchTerm) return true;
      return player.name.toLowerCase().includes(this.searchTerm);
    });

    // Separate online and offline
    const onlinePlayers = filteredPlayers.filter((p) => p.online === 1 || p.online === true);
    const offlinePlayers = filteredPlayers.filter((p) => !(p.online === 1 || p.online === true));

    // Sort alphabetically by name
    onlinePlayers.sort((a, b) => a.name.localeCompare(b.name));
    offlinePlayers.sort((a, b) => a.name.localeCompare(b.name));

    // Update selected count
    const selectedCount = filteredPlayers.filter((p) => this.isSelected(p.id)).length;
    const selectedEl = document.getElementById('panel-selected-count');
    if (selectedEl) {
      selectedEl.textContent = `${selectedCount} selected`;
    }

    // Render lists
    onlineList.innerHTML = this.renderPlayerList(onlinePlayers, true);
    offlineList.innerHTML = this.renderPlayerList(offlinePlayers, false);

    // Update group counts
    const onlineCountEl = document.getElementById('online-count');
    const offlineCountEl = document.getElementById('offline-count');
    if (onlineCountEl) onlineCountEl.textContent = `(${onlinePlayers.length})`;
    if (offlineCountEl) offlineCountEl.textContent = `(${offlinePlayers.length})`;

    // Update group checkbox states
    this.updateGroupCheckbox('select-all-online', onlinePlayers);
    this.updateGroupCheckbox('select-all-offline', offlinePlayers);

    // Attach click handlers
    this.attachClickHandlers();
  },

  updateGroupCheckbox(checkboxId: string, players: Player[]): void {
    const checkbox = document.getElementById(checkboxId) as HTMLInputElement | null;
    if (!checkbox || players.length === 0) {
      if (checkbox) {
        checkbox.checked = false;
        checkbox.indeterminate = false;
      }
      return;
    }
    const selectedCount = players.filter((p) => this.isSelected(p.id)).length;
    if (selectedCount === 0) {
      checkbox.checked = false;
      checkbox.indeterminate = false;
    } else if (selectedCount === players.length) {
      checkbox.checked = true;
      checkbox.indeterminate = false;
    } else {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    }
  },

  renderPlayerList(players: Player[], isOnline: boolean): string {
    if (players.length === 0) {
      return `<li class="player-list-empty">No ${isOnline ? 'online' : 'offline'} players</li>`;
    }

    return players
      .map((player) => {
        const lastSeen = player.lastSeen ? this.formatLastSeen(player.lastSeen) : 'Now';

        const hasCoords = player.x !== null && player.z !== null;
        const coords = hasCoords
          ? `X: ${Math.round(player.x)}, Z: ${Math.round(player.z)}`
          : isOnline
            ? 'Loading...'
            : 'Unknown location';

        const isChecked = this.isSelected(player.id) ? 'checked' : '';
        const loadingClass = isOnline && !hasCoords ? 'player-loading' : '';

        // Get player color - online players get unique colors, offline are gray
        const playerColor =
          isOnline && player.playerId
            ? window.ColorUtils.getPlayerColor(player.playerId)
            : window.ColorUtils.offlineColor;

        return `
        <li class="player-list-item ${loadingClass}" data-player-id="${player.id}">
          <div class="player-item-row">
            <input type="checkbox" class="player-select-checkbox"
                   data-player-id="${player.id}" ${isChecked} />
            <span class="player-color-indicator" style="background-color: ${playerColor};"></span>
            <div class="player-item-info">
              <div class="player-item-name">${this.escapeHtml(player.name)}</div>
              <div class="player-item-coords">${coords}</div>
              ${!isOnline ? `<div class="player-item-lastseen">Last seen: ${lastSeen}</div>` : ''}
            </div>
          </div>
        </li>
      `;
      })
      .join('');
  },

  attachClickHandlers(): void {
    // Checkbox handlers
    document.querySelectorAll('.player-select-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        const target = e.target as HTMLInputElement;
        const playerId = target.dataset.playerId;
        if (playerId) {
          this.toggleSelection(playerId);
        }
      });
      checkbox.addEventListener('click', (e) => e.stopPropagation());
    });

    // Row click handlers (for map focus)
    document.querySelectorAll('.player-list-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.classList.contains('player-select-checkbox')) {
          const itemEl = item as HTMLElement;
          const playerId = itemEl.dataset.playerId;
          if (playerId) {
            this.focusPlayer(playerId);
          }
        }
      });
    });
  },

  focusPlayer(playerId: string): void {
    if (!window.GameMap.map) return;

    // Try to find marker - check both string and number keys
    let marker = window.Players.markers.get(playerId);
    if (!marker) {
      marker = window.Players.markers.get(parseInt(playerId, 10));
    }
    if (!marker) {
      marker = window.Players.markers.get(String(playerId));
    }

    if (marker) {
      // Pan to player location and open popup
      window.GameMap.map.setView(marker.getLatLng(), Math.max(window.GameMap.map.getZoom(), 2));
      marker.openPopup();
    } else {
      // Marker might be hidden - find player in our data and pan to coords
      const player = this.players.find((p) => String(p.id) === String(playerId));
      if (player && player.x !== null && player.z !== null) {
        const pos = window.GameMap.gameToLatLng(player.x, player.z);
        window.GameMap.map.setView(pos, Math.max(window.GameMap.map.getZoom(), 2));
      }
    }

    // Show player info panel
    const player = this.players.find((p) => String(p.id) === String(playerId));
    if (player && window.PlayerInfo) {
      window.PlayerInfo.showPlayer(player.playerId || playerId);
    }
  },

  formatLastSeen(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  },

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Clear the list (called when logging out)
  clear(): void {
    this.players = [];
    this.searchTerm = '';
    this.selectedPlayers.clear();
    this.hasInitializedSelection = false; // Reset so next login selects all
    this.areaFilterActive = false;
    this.areaFilterPlayerIds.clear();
    this.itemFilterActive = false;
    this.itemFilterPlayerIds.clear();
    this.itemFilterName = '';
    const searchInput = document.getElementById('player-search') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.value = '';
    }
    this.updateFilterIndicator();
    this.render();
  },

  // Selection methods
  isSelected(playerId: string | number): boolean {
    return this.selectedPlayers.has(String(playerId));
  },

  toggleSelection(playerId: string | number): void {
    const id = String(playerId);
    if (this.selectedPlayers.has(id)) {
      this.selectedPlayers.delete(id);
    } else {
      this.selectedPlayers.add(id);
    }
    this.render();
    this.notifySelectionChange();
  },

  selectAll(): void {
    for (const p of this.getFilteredPlayers()) {
      this.selectedPlayers.add(String(p.id));
    }
    this.render();
    this.notifySelectionChange();
  },

  deselectAll(): void {
    for (const p of this.getFilteredPlayers()) {
      this.selectedPlayers.delete(String(p.id));
    }
    this.render();
    this.notifySelectionChange();
  },

  selectAllByStatus(isOnline: boolean, select: boolean): void {
    const players = this.getFilteredPlayers().filter((p) => {
      const playerOnline = p.online === 1 || p.online === true;
      return isOnline ? playerOnline : !playerOnline;
    });
    players.forEach((p) => {
      if (select) {
        this.selectedPlayers.add(String(p.id));
      } else {
        this.selectedPlayers.delete(String(p.id));
      }
    });
    this.render();
    this.notifySelectionChange();
  },

  getFilteredPlayers(): Player[] {
    let filteredPlayers = this.players;

    // Apply time filter (must match render() logic)
    if (this.timeFilterEnabled && window.TimeRange) {
      const { start, end }: DateRange = window.TimeRange.getDateRange();
      const startTime = start.getTime();
      const endTime = end.getTime();

      filteredPlayers = filteredPlayers.filter((player) => {
        // Always include online players regardless of time filter
        const isOnline = player.online === 1 || player.online === true;
        if (isOnline) return true;

        // For offline players, filter by lastSeen within time range
        if (!player.lastSeen) return false;
        const lastSeenTime = new Date(player.lastSeen).getTime();
        return lastSeenTime >= startTime && lastSeenTime <= endTime;
      });
    }

    // Apply area filter if active
    if (this.areaFilterActive) {
      filteredPlayers = filteredPlayers.filter(
        (p) => this.areaFilterPlayerIds.has(String(p.id)) || this.areaFilterPlayerIds.has(String(p.playerId))
      );
    }

    // Apply item filter if active
    if (this.itemFilterActive) {
      filteredPlayers = filteredPlayers.filter(
        (p) => this.itemFilterPlayerIds.has(String(p.id)) || this.itemFilterPlayerIds.has(String(p.playerId))
      );
    }

    // Apply search filter
    if (this.searchTerm) {
      filteredPlayers = filteredPlayers.filter((p) => p.name.toLowerCase().includes(this.searchTerm));
    }

    return filteredPlayers;
  },

  notifySelectionChange(): void {
    if (window.Players) {
      window.Players.updateSelectionVisibility(this.selectedPlayers);
    }
    // Also redraw paths if visible to respect player selection
    if (window.History?.isVisible) {
      window.History.drawPaths();
    }
    // Refresh heatmap if filtering by selection
    if (window.Heatmap) {
      window.Heatmap.onPlayerSelectionChanged();
    }
  },

  // Select only specific players (used by area search)
  // playerIds can be either local IDs or Takaro playerIds
  selectOnly(playerIds: string[]): void {
    // Clear all selections first
    this.selectedPlayers.clear();

    // Convert playerIds (which may be Takaro UUIDs) to local IDs
    playerIds.forEach((searchId) => {
      // Try to find player by either id or playerId
      const player = this.players.find(
        (p) => String(p.id) === String(searchId) || String(p.playerId) === String(searchId)
      );
      if (player) {
        // Always use the local id for selection
        this.selectedPlayers.add(String(player.id));
      }
    });

    this.render();
    this.notifySelectionChange();
  },

  // Get Takaro playerIds (UUIDs) for selected players that pass current filters
  // selectedPlayers uses POG IDs (PlayerOnGameServer), but paths use playerId (Player UUID)
  getSelectedTakaroIds(): Set<string> {
    const takaroIds = new Set<string>();

    // Get time range for filtering
    let startTime: number | null = null;
    let endTime: number | null = null;
    if (this.timeFilterEnabled && window.TimeRange) {
      const { start, end }: DateRange = window.TimeRange.getDateRange();
      startTime = start.getTime();
      endTime = end.getTime();
    }

    for (const pogId of this.selectedPlayers) {
      const player = this.players.find((p) => String(p.id) === pogId);
      if (!player || !player.playerId) continue;

      // Apply time filter - online players always pass, offline must be in range
      const isOnline = player.online === 1 || player.online === true;
      if (!isOnline && startTime && endTime && player.lastSeen) {
        const lastSeenTime = new Date(player.lastSeen).getTime();
        if (lastSeenTime < startTime || lastSeenTime > endTime) continue;
      }

      takaroIds.add(String(player.playerId));
    }
    return takaroIds;
  },

  // Area filter methods - filter the player list to only show players from area search
  setAreaFilter(playerIds: string[]): void {
    this.areaFilterActive = true;
    this.areaFilterPlayerIds.clear();
    for (const id of playerIds) {
      this.areaFilterPlayerIds.add(String(id));
    }

    this.updateFilterIndicator();
    this.render();
  },

  clearAreaFilter(): void {
    this.areaFilterActive = false;
    this.areaFilterPlayerIds.clear();
    this.updateFilterIndicator();
    this.render();
  },

  // Called when time range changes - re-render with new filter
  onTimeRangeChange(): void {
    this.render();
    this.notifySelectionChange();
  },

  updateFilterIndicator(): void {
    let indicator = document.getElementById('area-filter-indicator');

    if (this.areaFilterActive) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'area-filter-indicator';
        indicator.className = 'area-filter-indicator';
        const header = document.querySelector('.player-list-header');
        if (header) {
          header.appendChild(indicator);
        }
      }

      indicator.innerHTML = `
        <span>Area filter: ${this.areaFilterPlayerIds.size} players</span>
        <button id="clear-area-filter-btn" class="btn btn-sm">Clear</button>
      `;
      indicator.style.display = 'flex';

      // Attach click handler
      const clearBtn = document.getElementById('clear-area-filter-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.clearAreaFilter();
          if (window.AreaSearch) {
            window.AreaSearch.clear();
          }
        });
      }
    } else if (indicator) {
      indicator.style.display = 'none';
    }
  },

  // Item filter methods - called by PlayerInfo when item search completes
  setItemFilter(playerIds: string[], itemName: string): void {
    this.itemFilterActive = true;
    this.itemFilterPlayerIds.clear();
    for (const id of playerIds) {
      this.itemFilterPlayerIds.add(String(id));
    }
    this.itemFilterName = itemName;

    this.render();
  },

  clearItemFilter(): void {
    this.itemFilterActive = false;
    this.itemFilterPlayerIds.clear();
    this.itemFilterName = '';
    this.render();
  },
};

export { PlayerList };
window.PlayerList = PlayerList;
