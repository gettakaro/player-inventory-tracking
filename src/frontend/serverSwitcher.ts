// Server Switcher - allows users to switch between servers in the header

import type { GameServer } from './types.js';

export const ServerSwitcher = {
  servers: [] as GameServer[],
  currentServerId: null as string | null,

  init(servers: GameServer[], currentServerId: string | null): void {
    this.servers = servers;
    this.currentServerId = currentServerId;

    const selector = document.getElementById('server-switcher') as HTMLSelectElement | null;
    if (!selector) return;

    // Hide if no servers or only one server
    if (servers.length <= 1) {
      selector.style.display = 'none';
      return;
    }

    // Populate options
    selector.innerHTML = servers
      .map(
        (s) => `<option value="${s.id}"${s.id === currentServerId ? ' selected' : ''}>${s.name} (${s.type})</option>`
      )
      .join('');

    // Show selector
    selector.style.display = 'block';

    // Handle change
    selector.addEventListener('change', async () => {
      const newServerId = selector.value;
      if (newServerId && newServerId !== this.currentServerId) {
        await this.switchServer(newServerId);
      }
    });
  },

  show(): void {
    const selector = document.getElementById('server-switcher') as HTMLSelectElement | null;
    if (selector && this.servers.length > 1) {
      selector.style.display = 'block';
    }
  },

  hide(): void {
    const selector = document.getElementById('server-switcher') as HTMLSelectElement | null;
    if (selector) {
      selector.style.display = 'none';
    }
  },

  updateSelection(serverId: string): void {
    this.currentServerId = serverId;
    const selector = document.getElementById('server-switcher') as HTMLSelectElement | null;
    if (selector) {
      selector.value = serverId;
    }
  },

  async switchServer(serverId: string): Promise<void> {
    const server = this.servers.find((s) => s.id === serverId);
    if (!server) return;

    this.currentServerId = serverId;

    // Update Auth's selected server
    window.Auth.selectedServer = server;

    // Cleanup current map state
    if (window.App.isMapInitialized) {
      window.App.cleanup();
    }

    // Start new map with new server
    await window.App.startMap(serverId);
  },
};

window.ServerSwitcher = ServerSwitcher;
