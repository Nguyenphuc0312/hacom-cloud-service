/**
 * Types for realtime monitoring endpoints
 */

/** Summary metrics from all sources */
export interface RealtimeOverview {
  onlineUsers: number | null;
  activeConnections: number | null;
  activeRooms: number | null;
  typingUsersCount: number | null;
  deliveryFailuresPerMinute: number | null;
  reconnectRatePerMinute: number | null;
  lastUpdated: string;
  sources: {
    websocket: 'available' | 'unavailable';
    redis: 'available' | 'unavailable';
    prometheus: 'available' | 'unavailable';
  };
}

/** User online status */
export interface OnlineUser {
  userId: string;
  displayName: string;
  employeeCode: string | null;
  department: string | null;
  /** Live websocket sessions held by this user (multiple tabs/devices count separately). */
  connectionCount: number;
  /** Presence state from the websocket gateway: online | away | idle | dnd | busy. */
  presenceState: string;
  /**
   * Live sessions per device class (web | desktop | mobile) from the gateway.
   *
   * May total LESS than `connectionCount`: sessions opened before the gateway
   * reported platform, or with an unrecognized User-Agent, stay unclassified.
   * Show that shortfall as unknown — never fill it in with a guess.
   */
  platforms: Record<string, number>;
  lastSeenAt: string | null;
  activeRooms: number;
}

/** Paginated response for online users */
export interface OnlineUsersResponse {
  items: OnlineUser[];
  total: number;
  page: number;
  pageSize: number;
  source: 'redis' | 'cache' | 'stale';
  staleReason: string | null;
}

/** User currently typing */
export interface TypingUser {
  userId: string;
  displayName: string;
  roomId: string;
  roomName: string | null;
  typingSince: string;
  expiresIn: number;
}

/** Paginated response for typing users */
export interface TypingUsersResponse {
  items: TypingUser[];
  total: number;
  source: 'redis';
  cacheAge: number | null;
}

/** Active room information */
export interface ActiveRoom {
  roomId: string;
  roomName: string | null;
  roomType: 'direct' | 'group' | 'channel';
  onlineMembers: number;
  typingCount: number;
  messagesLastMinute: number;
  deliveryFailuresLastMinute: number;
  lastActivityAt: string | null;
}

/** Paginated response for active rooms */
export interface ActiveRoomsResponse {
  items: ActiveRoom[];
  total: number;
  activeRoomCount: number;
}

/** Connection details (masked) */
export interface ConnectionInfo {
  connectionId: string;
  device: string;
  ipMasked: string;
  connectedAt: string;
  lastPingAt: string;
}

/** User live state detail */
export interface UserLiveState {
  user: {
    userId: string;
    displayName: string;
    employeeCode: string | null;
    department: string | null;
    email: string | null;
  };
  presence: {
    status: 'online' | 'offline' | 'away';
    connections: ConnectionInfo[];
    lastSeenAt: string | null;
  };
  activity: {
    roomsCurrentlyActive: number;
    typingInRooms: string[];
    messagesLastHour: number | null;
    messagesLast24h: number | null;
  };
  recentErrors: Array<{
    timestamp: string;
    errorType: string;
    requestId: string | null;
  }>;
  auditInfo: {
    inspectedAt: string;
    inspectedBy: string;
    reason: string;
  } | null;
}

/** Room live state detail */
export interface RoomLiveState {
  room: {
    roomId: string;
    name: string | null;
    type: 'direct' | 'group' | 'channel';
    memberCount: number;
  };
  presence: {
    onlineMembers: number;
    totalMembers: number;
    typingUsers: Array<{
      userId: string;
      displayName: string;
      typingSince: string;
    }>;
  };
  activity: {
    messagesLastMinute: number | null;
    messagesLastHour: number | null;
    deliveryFailuresLastMinute: number | null;
  };
  recentActivity: Array<{
    timestamp: string;
    eventType: string;
    userId: string | null;
  }>;
  auditInfo: {
    inspectedAt: string;
    inspectedBy: string;
    reason: string;
  } | null;
}

/** Message traffic over time */
export interface MessageTrafficSeries {
  timestamp: string;
  sent: number;
  delivered: number;
  partialFailure: number;
  terminalFailure: number;
}

export interface MessageTrafficResponse {
  series: MessageTrafficSeries[];
  summary: {
    totalSent: number;
    totalDelivered: number;
    totalPartialFailure: number;
    totalTerminalFailure: number;
    successRate: number | null;
  };
  topRooms: Array<{ roomId: string; roomName: string; count: number }>;
}

/** API traffic metrics */
export interface ApiTrafficResponse {
  requests: {
    total: number;
    perSecond: number;
    byStatus: Record<string, number>;
  };
  latency: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
  topEndpoints: Array<{
    method: string;
    path: string;
    count: number;
    p95: number | null;
  }>;
  slowEndpoints: Array<{
    method: string;
    path: string;
    p95: number;
    count: number;
  }>;
  errorEndpoints: Array<{
    method: string;
    path: string;
    errorCount: number;
    topError: string;
  }>;
  rateLimitHits: number | null;
}

/** Observability infrastructure status */
export interface ObservabilityStatus {
  prometheus: {
    status: 'up' | 'down' | 'degraded';
    targets: Array<{
      job: string;
      instance: string;
      health: 'up' | 'down';
      lastScrape: string | null;
      lastError: string | null;
    }>;
    scrapeInterval: number | null;
    storageRetention: string | null;
  };
  loki: {
    status: 'up' | 'down' | 'degraded';
    ingestionRate: number | null;
    droppedLogs: number | null;
  };
  grafana: {
    status: 'up' | 'down';
    dashboardCount: number | null;
  };
  alertmanager: {
    status: 'up' | 'down';
    activeAlerts: number | null;
    silencedAlerts: number | null;
  };
}
