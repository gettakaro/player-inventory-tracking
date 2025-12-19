// Player list panel management

const PlayerList = {
  isCollapsed: false,
  searchTerm: '',
  players: [],
  selectedPlayers: new Set(),  // Track selected player IDs
  hasInitializedSelection: false,  // Track if we've done initial selection
  collapsedGroups: { online: false, offline: false },  // Track collapsed state

  init() {
    this.setupEventListeners();
    this.restoreState();
  },

  setupEventListeners() {
    // Toggle button
    document.getElementById('player-list-toggle').addEventListener('click', () => {
      this.toggle();
    });

    // Search input (sidebar)
    document.getElementById('player-search').addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase().trim();
      // Sync with top search bar
      const topSearch = document.getElementById('top-player-search');
      if (topSearch && topSearch.value !== e.target.value) {
        topSearch.value = e.target.value;
      }
      this.render();
    });

    // Top search input (in controls bar)
    const topSearch = document.getElementById('top-player-search');
    if (topSearch) {
      topSearch.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.toLowerCase().trim();
        // Sync with sidebar search
        const sidebarSearch = document.getElementById('player-search');
        if (sidebarSearch && sidebarSearch.value !== e.target.value) {
          sidebarSearch.value = e.target.value;
        }
        this.render();
      });
    }

    // Select All / Deselect All buttons and Group checkboxes using event delegation
    const panel = document.getElementById('player-list-panel');
    if (panel) {
      panel.addEventListener('click', (e) => {
        if (e.target.id === 'select-all-btn') {
          this.selectAll();
        } else if (e.target.id === 'deselect-all-btn') {
          this.deselectAll();
        }

        // Handle group header clicks for collapse/expand
        const header = e.target.closest('.player-group-header');
        if (header && !e.target.classList.contains('group-select-checkbox')) {
          const group = header.dataset.group;
          if (group) {
            this.toggleGroup(group);
          }
        }
      });
      panel.addEventListener('change', (e) => {
        if (e.target.id === 'select-all-online') {
          this.selectAllByStatus(true, e.target.checked);
        } else if (e.target.id === 'select-all-offline') {
          this.selectAllByStatus(false, e.target.checked);
        }
      });
    }
  },

  toggle() {
    this.isCollapsed = !this.isCollapsed;
    const panel = document.getElementById('player-list-panel');
    panel.classList.toggle('collapsed', this.isCollapsed);
    this.saveState();
  },

  toggleGroup(group) {
    this.collapsedGroups[group] = !this.collapsedGroups[group];
    const groupEl = document.getElementById(`${group}-players-group`);
    if (groupEl) {
      groupEl.classList.toggle('collapsed', this.collapsedGroups[group]);
    }
    this.saveState();
  },

  saveState() {
    localStorage.setItem('playerListCollapsed', this.isCollapsed);
    localStorage.setItem('playerListCollapsedGroups', JSON.stringify(this.collapsedGroups));
  },

  restoreState() {
    const saved = localStorage.getItem('playerListCollapsed');
    if (saved === 'true') {
      this.isCollapsed = true;
      document.getElementById('player-list-panel').classList.add('collapsed');
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
      } catch (e) {
        // Ignore parse errors
      }
    }
  },

  // Called by Players.update() to sync data
  updatePlayers(players) {
    // Auto-select only online players on very first load
    if (!this.hasInitializedSelection) {
      players.forEach(p => {
        const isOnline = p.online === 1 || p.online === true;
        if (isOnline) {
          this.selectedPlayers.add(String(p.id));
        }
      });
      this.hasInitializedSelection = true;
    } else {
      // Add any new online players to selection (players who just joined)
      players.forEach(p => {
        const isOnline = p.online === 1 || p.online === true;
        if (isOnline && !this.players.find(existing => String(existing.id) === String(p.id))) {
          this.selectedPlayers.add(String(p.id));
        }
      });
    }
    this.players = players;
    this.render();
  },

  render() {
    const onlineList = document.getElementById('online-players-list');
    const offlineList = document.getElementById('offline-players-list');

    // Filter players by search term
    const filteredPlayers = this.players.filter(player => {
      if (!this.searchTerm) return true;
      return player.name.toLowerCase().includes(this.searchTerm);
    });

    // Separate online and offline
    const onlinePlayers = filteredPlayers.filter(p => p.online === 1 || p.online === true);
    const offlinePlayers = filteredPlayers.filter(p => !(p.online === 1 || p.online === true));

    // Sort alphabetically by name
    onlinePlayers.sort((a, b) => a.name.localeCompare(b.name));
    offlinePlayers.sort((a, b) => a.name.localeCompare(b.name));

    // Update selected count
    const selectedCount = filteredPlayers.filter(p => this.isSelected(p.id)).length;
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

  updateGroupCheckbox(checkboxId, players) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox || players.length === 0) {
      if (checkbox) {
        checkbox.checked = false;
        checkbox.indeterminate = false;
      }
      return;
    }
    const selectedCount = players.filter(p => this.isSelected(p.id)).length;
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

  renderPlayerList(players, isOnline) {
    if (players.length === 0) {
      return `<li class="player-list-empty">No ${isOnline ? 'online' : 'offline'} players</li>`;
    }

    return players.map(player => {
      const lastSeen = player.lastSeen
        ? this.formatLastSeen(player.lastSeen)
        : 'Now';

      const coords = (player.x !== null && player.z !== null)
        ? `X: ${Math.round(player.x)}, Z: ${Math.round(player.z)}`
        : 'Unknown location';

      const isChecked = this.isSelected(player.id) ? 'checked' : '';

      return `
        <li class="player-list-item" data-player-id="${player.id}">
          <div class="player-item-row">
            <input type="checkbox" class="player-select-checkbox"
                   data-player-id="${player.id}" ${isChecked} />
            <div class="player-item-info">
              <div class="player-item-name">${this.escapeHtml(player.name)}</div>
              <div class="player-item-coords">${coords}</div>
              ${!isOnline ? `<div class="player-item-lastseen">Last seen: ${lastSeen}</div>` : ''}
            </div>
          </div>
        </li>
      `;
    }).join('');
  },

  attachClickHandlers() {
    // Checkbox handlers
    document.querySelectorAll('.player-select-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleSelection(checkbox.dataset.playerId);
      });
      checkbox.addEventListener('click', (e) => e.stopPropagation());
    });

    // Row click handlers (for map focus)
    document.querySelectorAll('.player-list-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('player-select-checkbox')) {
          this.focusPlayer(item.dataset.playerId);
        }
      });
    });
  },

  focusPlayer(playerId) {
    if (!GameMap.map) return;

    // Try to find marker - check both string and number keys
    let marker = Players.markers.get(playerId);
    if (!marker) {
      marker = Players.markers.get(parseInt(playerId));
    }
    if (!marker) {
      marker = Players.markers.get(String(playerId));
    }

    if (marker) {
      // Pan to player location and open popup
      GameMap.map.setView(marker.getLatLng(), Math.max(GameMap.map.getZoom(), 2));
      marker.openPopup();
    } else {
      // Marker might be hidden - find player in our data and pan to coords
      const player = this.players.find(p => String(p.id) === String(playerId));
      if (player && player.x !== null && player.z !== null) {
        const pos = GameMap.gameToLatLng(player.x, player.z);
        GameMap.map.setView(pos, Math.max(GameMap.map.getZoom(), 2));
      }
    }

    // Show player info panel
    const player = this.players.find(p => String(p.id) === String(playerId));
    if (player && window.PlayerInfo) {
      PlayerInfo.showPlayer(player.playerId || playerId);
    }
  },

  formatLastSeen(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Clear the list (called when logging out)
  clear() {
    this.players = [];
    this.searchTerm = '';
    this.selectedPlayers.clear();
    this.hasInitializedSelection = false;  // Reset so next login selects all
    const searchInput = document.getElementById('player-search');
    if (searchInput) {
      searchInput.value = '';
    }
    const topSearchInput = document.getElementById('top-player-search');
    if (topSearchInput) {
      topSearchInput.value = '';
    }
    this.render();
  },

  // Selection methods
  isSelected(playerId) {
    return this.selectedPlayers.has(String(playerId));
  },

  toggleSelection(playerId) {
    const id = String(playerId);
    if (this.selectedPlayers.has(id)) {
      this.selectedPlayers.delete(id);
    } else {
      this.selectedPlayers.add(id);
    }
    this.render();
    this.notifySelectionChange();
  },

  selectAll() {
    this.getFilteredPlayers().forEach(p => this.selectedPlayers.add(String(p.id)));
    this.render();
    this.notifySelectionChange();
  },

  deselectAll() {
    this.getFilteredPlayers().forEach(p => this.selectedPlayers.delete(String(p.id)));
    this.render();
    this.notifySelectionChange();
  },

  selectAllByStatus(isOnline, select) {
    const players = this.getFilteredPlayers().filter(p => {
      const playerOnline = p.online === 1 || p.online === true;
      return isOnline ? playerOnline : !playerOnline;
    });
    players.forEach(p => {
      if (select) {
        this.selectedPlayers.add(String(p.id));
      } else {
        this.selectedPlayers.delete(String(p.id));
      }
    });
    this.render();
    this.notifySelectionChange();
  },

  getFilteredPlayers() {
    return this.players.filter(p => !this.searchTerm || p.name.toLowerCase().includes(this.searchTerm));
  },

  notifySelectionChange() {
    if (window.Players) {
      Players.updateSelectionVisibility(this.selectedPlayers);
    }
    // Also redraw paths if visible to respect player selection
    if (window.History && History.isVisible) {
      History.drawPaths();
    }
  },

  // Select only specific players (used by area search)
  // playerIds can be either local IDs or Takaro playerIds
  selectOnly(playerIds) {
    // Clear all selections first
    this.selectedPlayers.clear();

    // Convert playerIds (which may be Takaro UUIDs) to local IDs
    playerIds.forEach(searchId => {
      // Try to find player by either id or playerId
      const player = this.players.find(p =>
        String(p.id) === String(searchId) ||
        String(p.playerId) === String(searchId)
      );
      if (player) {
        // Always use the local id for selection
        this.selectedPlayers.add(String(player.id));
      }
    });

    this.render();
    this.notifySelectionChange();
  }
};

window.PlayerList = PlayerList;
