// Authentication handling - Supports both Service mode and Cookie mode

const Auth = {
  isLoggedIn: false,
  serviceMode: true,
  cookieMode: false,
  availableDomains: [],

  async init() {
    try {
      const status = await API.getAuthStatus();

      this.serviceMode = status.mode === 'service';
      this.cookieMode = status.mode === 'cookie';

      if (status.authenticated) {
        this.isLoggedIn = true;

        if (this.serviceMode) {
          // Service mode - use provided session
          API.setSession(status.sessionId);
          if (status.domain) {
            API.setDomain(status.domain);
          }
          this.showLoggedInState('Service Mode');
        } else {
          // Cookie mode - already authenticated via cookies
          this.availableDomains = status.availableDomains || [];

          if (!status.domain && this.availableDomains.length > 0) {
            // No domain selected - show domain selector
            this.showDomainSelector();
            return true;
          }

          if (status.domain) {
            API.setDomain(status.domain);
          }
          this.showLoggedInState('Cookie Mode');
        }

        await this.loadGameServers();
        return true;
      }

      // Not authenticated
      if (this.cookieMode && status.needsLogin) {
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

  showLoginRequired(loginUrl) {
    document.getElementById('config-panel').style.display = 'block';
    document.getElementById('map-container').style.display = 'none';
    document.getElementById('connection-status').className = 'status-indicator offline';
    document.getElementById('connection-status').textContent = 'Not Logged In';
    document.getElementById('server-select-container').innerHTML = `
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
  },

  showDomainSelector() {
    document.getElementById('config-panel').style.display = 'block';
    document.getElementById('connection-status').className = 'status-indicator warning';
    document.getElementById('connection-status').textContent = 'Select Domain';

    const container = document.getElementById('server-select-container');
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

    document.getElementById('select-domain-btn').addEventListener('click', async () => {
      const domainId = document.getElementById('domain-select').value;
      if (!domainId) return;

      try {
        await API.selectDomain(domainId);
        location.reload(); // Reload to apply domain
      } catch (error) {
        alert(`Failed to select domain: ${error.message}`);
      }
    });
  },

  showNotConfiguredState() {
    document.getElementById('config-panel').style.display = 'block';
    document.getElementById('map-container').style.display = 'none';
    document.getElementById('connection-status').className = 'status-indicator offline';
    document.getElementById('connection-status').textContent = 'Not Configured';
    document.getElementById('server-select-container').innerHTML =
      '<p style="color: #ff6b6b;">Service not configured. Please contact the administrator.</p>';
  },

  showLoggedInState(modeLabel) {
    document.getElementById('config-panel').style.display = 'block';
    document.getElementById('connection-status').className = 'status-indicator online';
    document.getElementById('connection-status').textContent = `Connected (${modeLabel})`;
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

  async onServerSelected(serverId) {
    const startBtn = document.getElementById('start-map-btn');

    if (!serverId) {
      startBtn.style.display = 'none';
      return;
    }

    // Find the server
    const server = this.servers?.find((s) => s.id === serverId);

    // Show start button directly - no config needed!
    startBtn.style.display = 'block';

    // Store selected server info
    this.selectedServer = server;
  },
};

window.Auth = Auth;
