// Domain Switcher - allows users to switch between domains in cookie mode

interface Domain {
  id: string;
  name: string;
}

export const DomainSwitcher = {
  domains: [] as Domain[],
  currentDomain: null as string | null,
  serviceMode: false,

  init(domains: Domain[], currentDomain: string | null, serviceMode: boolean): void {
    this.domains = domains;
    this.currentDomain = currentDomain;
    this.serviceMode = serviceMode;

    const selector = document.getElementById('domain-selector') as HTMLSelectElement | null;
    if (!selector) return;

    // Hide in service mode or if only one domain
    if (serviceMode || domains.length <= 1) {
      selector.style.display = 'none';
      return;
    }

    // Populate options
    selector.innerHTML = domains
      .map((d) => `<option value="${d.id}"${d.id === currentDomain ? ' selected' : ''}>${d.name}</option>`)
      .join('');

    // Show selector
    selector.style.display = 'block';

    // Handle change
    selector.addEventListener('change', async () => {
      const newDomainId = selector.value;
      if (newDomainId && newDomainId !== this.currentDomain) {
        await this.switchDomain(newDomainId);
      }
    });
  },

  async switchDomain(domainId: string): Promise<void> {
    try {
      await window.API.selectDomain(domainId);
      // Reload page to apply new domain
      location.reload();
    } catch (error) {
      console.error('Failed to switch domain:', error);
      alert(`Failed to switch domain: ${(error as Error).message}`);
    }
  },
};

window.DomainSwitcher = DomainSwitcher;
