// Authentication handling - Service mode only

const Auth = {
  isLoggedIn: false,
  serviceMode: true,

  async init() {
    // Check if service mode is active (auto-login)
    try {
      const status = await API.getAuthStatus();

      if (status.serviceMode && status.authenticated) {
        // Service mode - already authenticated!
        this.serviceMode = true;
        this.isLoggedIn = true;
        API.setSession(status.sessionId);
        if (status.domain) {
          API.setDomain(status.domain);
        }
        this.showLoggedInState();
        await this.loadGameServers();
        return true;
      }
    } catch (error) {
      console.warn('Failed to check auth status:', error);
    }

    // Not in service mode - show error
    this.showNotConfiguredState();
    return false;
  },

  showNotConfiguredState() {
    document.getElementById('config-panel').style.display = 'block';
    document.getElementById('map-container').style.display = 'none';
    document.getElementById('connection-status').className = 'status-indicator offline';
    document.getElementById('connection-status').textContent = 'Not Configured';
    document.getElementById('server-select-container').innerHTML = '<p style="color: #ff6b6b;">Service not configured. Set TAKARO_USERNAME, TAKARO_PASSWORD, and TAKARO_DOMAIN environment variables on the server.</p>';
  },

  showLoggedInState() {
    document.getElementById('config-panel').style.display = 'block';
    document.getElementById('connection-status').className = 'status-indicator online';
    document.getElementById('connection-status').textContent = 'Connected (Service Mode)';
  },

  showMapView() {
    document.getElementById('config-panel').style.display = 'none';
    document.getElementById('map-container').style.display = 'flex';
  },

  async loadGameServers() {
    const select = document.getElementById('game-server');
    select.innerHTML = '<option value="">Loading...</option>';

    try {
      const servers = await API.getGameServers();
      // Store servers for later reference
      this.servers = servers;

      select.innerHTML = '<option value="">Select a server...</option>';

      servers.forEach(server => {
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

  async onServerSelected(serverId) {
    const startBtn = document.getElementById('start-map-btn');

    if (!serverId) {
      startBtn.style.display = 'none';
      return;
    }

    // Find the server
    const server = this.servers?.find(s => s.id === serverId);

    // Show start button directly - no config needed!
    startBtn.style.display = 'block';

    // Store selected server info
    this.selectedServer = server;
  }
};

window.Auth = Auth;
