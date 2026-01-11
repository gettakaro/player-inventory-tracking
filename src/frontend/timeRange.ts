// Time Range Selector Module

import type { DateRange, TimePreset } from './types.js';

interface TimeRangeState {
  preset: string;
  customStart: string | null;
  customEnd: string | null;
}

type TimeRangeCallback = (start: Date, end: Date, preset: string) => void;

interface TimeRangeType {
  presets: TimePreset[];
  currentPreset: string;
  customStart: Date | null;
  customEnd: Date | null;
  onChangeCallback: TimeRangeCallback | null;
  initialized: boolean;
  init(onChangeCallback: TimeRangeCallback): void;
  setupEventListeners(): void;
  updateCustomInputsVisibility(): void;
  updateInputValues(): void;
  formatForInput(date: Date): string;
  getDateRange(): DateRange;
  validateCustomRange(): boolean;
  triggerChange(): void;
  saveState(): void;
  restoreState(): void;
  getCurrentLabel(): string;
}

export const TimeRange: TimeRangeType = {
  // Preset definitions (value in milliseconds, null for custom)
  // Organized by: Seconds, Minutes, Hours, Days, Custom
  presets: [
    // Seconds
    { id: '30s', label: 'Last 30 seconds', value: 30 * 1000, group: 'seconds' },
    { id: '60s', label: 'Last 60 seconds', value: 60 * 1000, group: 'seconds' },
    // Minutes
    { id: '1m', label: 'Last 1 minute', value: 1 * 60 * 1000, group: 'minutes' },
    { id: '5m', label: 'Last 5 minutes', value: 5 * 60 * 1000, group: 'minutes' },
    { id: '15m', label: 'Last 15 minutes', value: 15 * 60 * 1000, group: 'minutes' },
    { id: '30m', label: 'Last 30 minutes', value: 30 * 60 * 1000, group: 'minutes' },
    // Hours
    { id: '1h', label: 'Last 1 hour', value: 60 * 60 * 1000, group: 'hours' },
    { id: '3h', label: 'Last 3 hours', value: 3 * 60 * 60 * 1000, group: 'hours' },
    { id: '6h', label: 'Last 6 hours', value: 6 * 60 * 60 * 1000, group: 'hours' },
    { id: '12h', label: 'Last 12 hours', value: 12 * 60 * 60 * 1000, group: 'hours' },
    { id: '24h', label: 'Last 24 hours', value: 24 * 60 * 60 * 1000, group: 'hours' },
    // Days
    { id: '2d', label: 'Last 2 days', value: 2 * 24 * 60 * 60 * 1000, group: 'days' },
    { id: '7d', label: 'Last 7 days', value: 7 * 24 * 60 * 60 * 1000, group: 'days' },
    // Custom
    { id: 'custom', label: 'Custom date range...', value: null, group: 'custom' },
  ],

  currentPreset: '30s',
  customStart: null,
  customEnd: null,
  onChangeCallback: null,
  initialized: false,

  init(onChangeCallback: TimeRangeCallback): void {
    if (this.initialized) return;
    this.initialized = true;

    this.onChangeCallback = onChangeCallback;
    this.restoreState();
    this.setupEventListeners();
    this.updateCustomInputsVisibility();
    this.updateInputValues();
  },

  setupEventListeners(): void {
    const selector = document.getElementById('time-range-preset') as HTMLSelectElement | null;
    const startInput = document.getElementById('start-date') as HTMLInputElement | null;
    const endInput = document.getElementById('end-date') as HTMLInputElement | null;
    const applyBtn = document.getElementById('apply-range-btn') as HTMLButtonElement | null;

    if (!selector) return;

    // Preset change handler
    selector.addEventListener('change', (e) => {
      this.currentPreset = (e.target as HTMLSelectElement).value;
      this.updateCustomInputsVisibility();
      this.updateInputValues();
      this.saveState();

      // Auto-apply for presets (not custom)
      if (this.currentPreset !== 'custom') {
        this.triggerChange();
      }
    });

    if (!applyBtn || !startInput || !endInput) return;

    // Apply button handler
    applyBtn.addEventListener('click', () => {
      if (this.currentPreset === 'custom') {
        this.customStart = new Date(startInput.value);
        this.customEnd = new Date(endInput.value);
        this.saveState();
      }
      this.triggerChange();
    });

    // Custom input change handlers - auto-apply on change
    startInput.addEventListener('change', () => {
      if (this.validateCustomRange()) {
        this.customStart = new Date(startInput.value);
        this.customEnd = new Date(endInput.value);
        this.saveState();
        this.triggerChange();
      }
    });
    endInput.addEventListener('change', () => {
      if (this.validateCustomRange()) {
        this.customStart = new Date(startInput.value);
        this.customEnd = new Date(endInput.value);
        this.saveState();
        this.triggerChange();
      }
    });
  },

  updateCustomInputsVisibility(): void {
    const customInputs = document.getElementById('custom-date-inputs');
    const isCustom = this.currentPreset === 'custom';

    if (customInputs) {
      customInputs.style.display = isCustom ? 'flex' : 'none';
    }
  },

  updateInputValues(): void {
    const startInput = document.getElementById('start-date') as HTMLInputElement | null;
    const endInput = document.getElementById('end-date') as HTMLInputElement | null;

    if (!startInput || !endInput) return;

    const { start, end } = this.getDateRange();
    startInput.value = this.formatForInput(start);
    endInput.value = this.formatForInput(end);
  },

  formatForInput(date: Date): string {
    // Format for datetime-local input (YYYY-MM-DDTHH:MM)
    return date.toISOString().slice(0, 16);
  },

  getDateRange(): DateRange {
    if (this.currentPreset === 'custom') {
      return {
        start: this.customStart || new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: this.customEnd || new Date(),
      };
    }

    const preset = this.presets.find((p) => p.id === this.currentPreset);
    const now = new Date();
    const start = new Date(now.getTime() - (preset ? preset.value || 0 : 24 * 60 * 60 * 1000));

    return { start, end: now };
  },

  validateCustomRange(): boolean {
    const startInput = document.getElementById('start-date') as HTMLInputElement | null;
    const endInput = document.getElementById('end-date') as HTMLInputElement | null;
    const applyBtn = document.getElementById('apply-range-btn') as HTMLButtonElement | null;

    if (!startInput || !endInput || !applyBtn) return false;

    if (!startInput.value || !endInput.value) {
      applyBtn.disabled = true;
      return false;
    }

    const start = new Date(startInput.value);
    const end = new Date(endInput.value);

    if (start >= end) {
      startInput.classList.add('input-error');
      applyBtn.disabled = true;
      return false;
    }

    startInput.classList.remove('input-error');
    applyBtn.disabled = false;
    return true;
  },

  triggerChange(): void {
    if (this.onChangeCallback) {
      const { start, end } = this.getDateRange();
      this.onChangeCallback(start, end, this.currentPreset);
    }
  },

  // Persistence
  saveState(): void {
    const state: TimeRangeState = {
      preset: this.currentPreset,
      customStart: this.customStart ? this.customStart.toISOString() : null,
      customEnd: this.customEnd ? this.customEnd.toISOString() : null,
    };
    localStorage.setItem('timeRangeState', JSON.stringify(state));
  },

  restoreState(): void {
    try {
      const saved = localStorage.getItem('timeRangeState');
      if (saved) {
        const state: TimeRangeState = JSON.parse(saved);
        this.currentPreset = state.preset || '24h';
        this.customStart = state.customStart ? new Date(state.customStart) : null;
        this.customEnd = state.customEnd ? new Date(state.customEnd) : null;

        // Update dropdown
        const selector = document.getElementById('time-range-preset') as HTMLSelectElement | null;
        if (selector) {
          selector.value = this.currentPreset;
        }
      }
    } catch (e) {
      console.warn('Failed to restore time range state:', e);
    }
  },

  getCurrentLabel(): string {
    const preset = this.presets.find((p) => p.id === this.currentPreset);
    return preset ? preset.label : 'Last 24 hours';
  },
};

window.TimeRange = TimeRange;
