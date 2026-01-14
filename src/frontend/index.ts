// Frontend entry point - imports all modules and exports to window

import './types.js';
import { API } from './api.js';
import { App } from './app.js';
import { AreaSearch } from './areaSearch.js';
import { Auth } from './auth.js';
import { ColorUtils } from './colorUtils.js';
import { DomainSwitcher } from './domainSwitcher.js';
import { Heatmap } from './heatmap.js';
import { History } from './history.js';
import { GameMap } from './map.js';
import { PlayerInfo } from './playerInfo.js';
import { PlayerList } from './playerList.js';
import { Players } from './players.js';
import { TimeRange } from './timeRange.js';

// Export all modules to window for global access
window.ColorUtils = ColorUtils;
window.API = API;
window.Auth = Auth;
window.DomainSwitcher = DomainSwitcher;
window.TimeRange = TimeRange;
window.GameMap = GameMap;
window.Players = Players;
window.PlayerList = PlayerList;
window.PlayerInfo = PlayerInfo;
window.History = History;
window.AreaSearch = AreaSearch;
window.Heatmap = Heatmap;
window.App = App;

// Initialize ColorUtils on load
ColorUtils.init();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
