// Authentication handling - Supports both Service mode and Cookie mode

import type { AuthStatus, GameServer } from './types.js';

export const Auth = {
  isLoggedIn: false,
  serviceMode: true,
  cookieMode: false,
  availableDomains: [] as Array<{ id: string; name: string }>,
  currentDomain: null as string | null,
  dashboardUrl: 'https://dashboard.takaro.io',
  servers: undefined as GameServer[] | undefined,
  selectedServer: undefined as GameServer | undefined,

  async init(): Promise<boolean> {
    try {
      const status: AuthStatus = await window.API.getAuthStatus();

      this.serviceMode = status.mode === 'service';
      this.cookieMode = status.mode === 'cookie';
      this.dashboardUrl = status.dashboardUrl || 'https://dashboard.takaro.io';

      if (status.authenticated) {
        this.isLoggedIn = true;

        if (this.serviceMode) {
          // Service mode - use provided session
          if (status.sessionId) {
            window.API.setSession(status.sessionId);
          }
          if (status.domain) {
            window.API.setDomain(status.domain);
            this.currentDomain = status.domain;
          }
          this.showLoggedInState();
          // Initialize domain switcher (will be hidden in service mode)
          window.DomainSwitcher.init([], this.currentDomain, true);
        } else {
          // Cookie mode - already authenticated via cookies
          this.availableDomains = status.availableDomains || [];

          // Check if domain selection is needed:
          // 1. User has multiple domains AND no valid domain selected
          // 2. Or backend explicitly says domain selection is needed
          const needsDomainSelection =
            status.needsDomainSelection || (!status.domain && this.availableDomains.length > 1);

          if (needsDomainSelection) {
            this.showDomainSelector();
            return true;
          }

          // If only one domain available, auto-select it
          if (!status.domain && this.availableDomains.length === 1) {
            await window.API.selectDomain(this.availableDomains[0].id);
            location.reload();
            return true;
          }

          if (status.domain) {
            window.API.setDomain(status.domain);
            this.currentDomain = status.domain;
          }
          this.showLoggedInState();
          // Initialize domain switcher for cookie mode
          window.DomainSwitcher.init(this.availableDomains, this.currentDomain, false);
        }

        await this.loadGameServers();
        return true;
      }

      // Not authenticated
      if (this.cookieMode && status.needsLogin && status.loginUrl) {
        this.showLoginRequired(status.loginUrl);
      } else {
        this.showNotConfiguredState();
      }

      return false;
    } catch (error) {
      console.warn('Failed to check auth status:', error);
      this.showNotConfiguredState();
      return false;
    }
  },

  showLoginRequired(loginUrl: string): void {
    const configPanel = document.getElementById('config-panel');
    const mapContainer = document.getElementById('map-container');
    const connectionStatus = document.getElementById('connection-status');
    const serverSelectContainer = document.getElementById('server-select-container');

    if (configPanel) configPanel.style.display = 'block';
    if (mapContainer) mapContainer.style.display = 'none';
    if (connectionStatus) {
      connectionStatus.className = 'status-indicator offline';
      connectionStatus.textContent = 'Not Logged In';
    }
    if (serverSelectContainer) {
      serverSelectContainer.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <p style="color: #ff6b6b; margin-bottom: 15px;">
          Please log in to Takaro first to use this app.
        </p>
        <a href="${loginUrl}" target="_blank" class="btn btn-primary" style="display: inline-block; padding: 10px 20px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px;">
          Log in to Takaro
        </a>
        <p style="color: #888; margin-top: 15px; font-size: 12px;">
          After logging in, refresh this page.
        </p>
      </div>
    `;
    }
  },

  showDomainSelector(): void {
    const configPanel = document.getElementById('config-panel');
    const connectionStatus = document.getElementById('connection-status');
    const container = document.getElementById('server-select-container');

    if (configPanel) configPanel.style.display = 'block';
    if (connectionStatus) {
      connectionStatus.className = 'status-indicator warning';
      connectionStatus.textContent = 'Select Domain';
    }

    if (container) {
      container.innerHTML = `
      <div class="form-group">
        <label for="domain-select">Select Domain</label>
        <select id="domain-select" class="form-control">
          <option value="">Select a domain...</option>
          ${this.availableDomains.map((d) => `<option value="${d.id}">${d.name}</option>`).join('')}
        </select>
      </div>
      <button id="select-domain-btn" class="btn btn-primary" style="margin-top: 10px;">Continue</button>
    `;

      const selectDomainBtn = document.getElementById('select-domain-btn');
      selectDomainBtn?.addEventListener('click', async () => {
        const domainSelect = document.getElementById('domain-select') as HTMLSelectElement | null;
        const domainId = domainSelect?.value;
        if (!domainId) return;

        try {
          await window.API.selectDomain(domainId);
          location.reload(); // Reload to apply domain
        } catch (error) {
          alert(`Failed to select domain: ${(error as Error).message}`);
        }
      });
    }
  },

  showNotConfiguredState(): void {
    const configPanel = document.getElementById('config-panel');
    const mapContainer = document.getElementById('map-container');
    const connectionStatus = document.getElementById('connection-status');
    const serverSelectContainer = document.getElementById('server-select-container');

    if (configPanel) configPanel.style.display = 'block';
    if (mapContainer) mapContainer.style.display = 'none';
    if (connectionStatus) {
      connectionStatus.className = 'status-indicator offline';
      connectionStatus.textContent = 'Not Configured';
    }
    if (serverSelectContainer) {
      serverSelectContainer.innerHTML =
        '<p style="color: #ff6b6b;">Service not configured. Please contact the administrator.</p>';
    }
  },

  showLoggedInState(): void {
    const configPanel = document.getElementById('config-panel');
    const connectionStatus = document.getElementById('connection-status');

    if (configPanel) configPanel.style.display = 'block';
    if (connectionStatus) {
      connectionStatus.className = 'status-indicator online';
      connectionStatus.textContent = 'Connected';
    }
  },

  showMapView(): void {
    const configPanel = document.getElementById('config-panel');
    const mapContainer = document.getElementById('map-container');

    if (configPanel) configPanel.style.display = 'none';
    if (mapContainer) mapContainer.style.display = 'flex';
  },

  async loadGameServers(): Promise<void> {
    const select = document.getElementById('game-server') as HTMLSelectElement | null;
    if (!select) return;

    select.innerHTML = '<option value="">Loading...</option>';

    try {
      const servers = await window.API.getGameServers();
      // Store servers for later reference
      this.servers = servers;

      select.innerHTML = '<option value="">Select a server...</option>';

      servers.forEach((server) => {
        const option = document.createElement('option');
        option.value = server.id;
        option.textContent = `${server.name} (${server.type})`;
        option.dataset.type = server.type;
        select.appendChild(option);
      });

      // Auto-select first server if only one
      if (servers.length === 1) {
        select.value = servers[0].id;
        this.onServerSelected(servers[0].id);
      }
    } catch (error) {
      select.innerHTML = '<option value="">Error loading servers</option>';
      console.error('Failed to load servers:', error);
    }
  },

  onServerSelected(serverId: string): void {
    const startBtn = document.getElementById('start-map-btn') as HTMLElement | null;

    if (!serverId) {
      if (startBtn) startBtn.style.display = 'none';
      return;
    }

    // Find the server
    const server = this.servers?.find((s) => s.id === serverId);

    // Show start button directly - no config needed!
    if (startBtn) startBtn.style.display = 'block';

    // Store selected server info
    this.selectedServer = server;
  },
};

window.Auth = Auth;
