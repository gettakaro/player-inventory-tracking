// Shared types for frontend

// Injected by esbuild at build time from package.json
declare const __APP_VERSION__: string;

export interface Player {
  id: string;
  playerId: string;
  name: string;
  steamId?: string;
  x: number | null;
  y: number | null;
  z: number | null;
  ping?: number;
  currency?: number;
  playtimeSeconds?: number;
  lastSeen?: string;
  online: boolean | number;
}

export interface GameServer {
  id: string;
  name: string;
  type: string;
}

export interface MapInfo {
  worldSize: number;
  maxZoom: number;
  [key: string]: unknown;
}

export interface MovementPoint {
  x: number;
  y: number;
  z: number;
  timestamp: string;
}

export interface MovementPath {
  name: string;
  points: MovementPoint[];
}

export interface InventoryItem {
  itemId?: string;
  itemName?: string;
  itemCode?: string;
  quantity?: number;
  quality?: string | number | null;
  createdAt?: string;
}

export interface AreaSearchResult {
  playerId: string;
  playerName?: string;
  x: number;
  y: number;
  z: number;
  createdAt?: string;
}

export interface ItemSearchResult {
  playerId: string;
  playerName?: string;
  quantity?: number;
  quality?: string | number | null;
  createdAt?: string;
}

export interface Item {
  id: string;
  name: string;
  code?: string;
}

export interface AuthStatus {
  mode: 'service' | 'cookie';
  serviceMode: boolean;
  authenticated: boolean;
  domain?: string | null;
  sessionId?: string | null;
  availableDomains?: Array<{ id: string; name: string }>;
  needsLogin?: boolean;
  loginUrl?: string;
  dashboardUrl?: string;
}

export interface TimePreset {
  id: string;
  label: string;
  value: number | null;
  group: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// Declare global window extensions
declare global {
  interface Window {
    L: typeof import('leaflet');
    App: typeof import('./app').App;
    API: typeof import('./api').API;
    Auth: typeof import('./auth').Auth;
    GameMap: typeof import('./map').GameMap;
    Players: typeof import('./players').Players;
    PlayerList: typeof import('./playerList').PlayerList;
    PlayerInfo: typeof import('./playerInfo').PlayerInfo;
    History: typeof import('./history').History;
    AreaSearch: typeof import('./areaSearch').AreaSearch;
    Heatmap: typeof import('./heatmap').Heatmap;
    ColorUtils: typeof import('./colorUtils').ColorUtils;
    TimeRange: typeof import('./timeRange').TimeRange;
  }
}
