/**
 * @fileoverview Multi-Tab Coordination Hook
 *
 * Phase 3: Coordinates state across browser tabs to reduce redundant API calls.
 *
 * Features:
 * - Tab activity awareness (active tab gets real-time updates, others reduce polling)
 * - Shared conversation state via BroadcastChannel + localStorage
 * - Prevents multiple tabs from making the same API calls simultaneously
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useChatStore } from "../stores";

const TAB_COORDINATION_CHANNEL = "tab-coordination";
const TAB_STATE_KEY = "tab:coordination:state";
const TAB_ID = Math.random().toString(36).slice(2, 10);
const HEARTBEAT_INTERVAL_MS = 5000;
const TAB_TIMEOUT_MS = 15000;

export interface TabState {
  tabId: string;
  isActive: boolean;
  selectedConversationId: string | null;
  lastHeartbeat: number;
  isIdle: boolean;
}

interface TabCoordinationState {
  activeTabs: Map<string, TabState>;
  isThisTabActive: boolean;
  thisTabId: string;
}

const MAX_TABS = 10;

/**
 * Hook for coordinating state across multiple browser tabs.
 * Reduces redundant API calls by having only the active tab make real-time requests.
 */
export const useMultiTabCoordination = () => {
  // Helper to parse initial tab states (for useState initializer)
  // Note: This function intentionally reads localStorage during initialization
  // to determine initial tab state. This is a valid use case for initialization.
  const parseInitialTabStates = (): Map<string, TabState> => {
    try {
      const stored = localStorage.getItem(TAB_STATE_KEY);
      if (!stored) return new Map();
      const parsed = JSON.parse(stored) as Record<string, TabState>;
      // eslint-disable-next-line react-hooks/purity -- Intentional: initialization requires current time
      const now = Date.now();
      const result = new Map<string, TabState>();

      Object.values(parsed).forEach((tab: TabState) => {
        if (now - tab.lastHeartbeat < TAB_TIMEOUT_MS) {
          result.set(tab.tabId, tab);
        }
      });

      return result;
    } catch {
      return new Map();
    }
  };

  const getInitialIsActive = (tabs: Map<string, TabState>): boolean => {
    let newestTime = 0;
    let newestTabId: string | null = null;

    for (const entry of tabs) {
      const tab = entry[1];
      if (tab.isActive && tab.lastHeartbeat > newestTime) {
        newestTime = tab.lastHeartbeat;
        newestTabId = tab.tabId;
      }
    }

    return newestTabId === TAB_ID;
  };

  const initialTabs = parseInitialTabStates();

  const [state, setState] = useState<TabCoordinationState>({
    activeTabs: initialTabs,
    isThisTabActive: getInitialIsActive(initialTabs),
    thisTabId: TAB_ID,
  });

  const selectedConversationId = useChatStore(
    (s) => s.selectedConversationId,
  );
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const thisTabStateRef = useRef<TabState>({
    tabId: TAB_ID,
    isActive: true,
    selectedConversationId: null,
    lastHeartbeat: 0,
    isIdle: false,
  });

  // Parse tab state from storage
  const parseTabStates = useCallback((): Map<string, TabState> => {
    try {
      const stored = localStorage.getItem(TAB_STATE_KEY);
      if (!stored) return new Map();
      const parsed = JSON.parse(stored) as Record<string, TabState>;
      const now = Date.now();
      const result = new Map<string, TabState>();

      Object.values(parsed).forEach((tab: TabState) => {
        if (now - tab.lastHeartbeat < TAB_TIMEOUT_MS) {
          result.set(tab.tabId, tab);
        }
      });

      return result;
    } catch {
      return new Map();
    }
  }, []);

  // Save tab states to storage
  const saveTabStates = useCallback((tabs: Map<string, TabState>) => {
    try {
      const obj: Record<string, TabState> = {};
      tabs.forEach((tab, id) => {
        obj[id] = tab;
      });
      // Only keep last MAX_TABS entries
      const keys = Object.keys(obj);
      if (keys.length > MAX_TABS) {
        const sorted = keys.sort(
          (a, b) => obj[b].lastHeartbeat - obj[a].lastHeartbeat,
        );
        sorted.slice(MAX_TABS).forEach((k) => delete obj[k]);
      }
      localStorage.setItem(TAB_STATE_KEY, JSON.stringify(obj));
    } catch {
      // localStorage may fail in private browsing
    }
  }, []);

  // Determine which tab should be "active" (makes real-time requests)
  const determineActiveTab = useCallback(
    (tabs: Map<string, TabState>): string | null => {
      let newestTabId: string | null = null;
      let newestTime = 0;

      for (const entry of tabs) {
        const tab = entry[1];
        if (tab.isActive && tab.lastHeartbeat > newestTime) {
          newestTime = tab.lastHeartbeat;
          newestTabId = tab.tabId;
        }
      }

      return newestTabId;
    },
    [],
  );

  // Update local state
  const updateStateFromTabs = useCallback(
    (tabs: Map<string, TabState>) => {
      const activeTabId = determineActiveTab(tabs);
      setState((prev) => ({
        ...prev,
        isThisTabActive: activeTabId === TAB_ID,
        activeTabs: tabs,
      }));
    },
    [determineActiveTab],
  );

  // Send heartbeat to storage and BroadcastChannel
  const sendHeartbeat = useCallback(() => {
    const now = Date.now();
    thisTabStateRef.current.lastHeartbeat = now;
    thisTabStateRef.current.selectedConversationId = selectedConversationId;

    const tabs = parseTabStates();
    tabs.set(TAB_ID, { ...thisTabStateRef.current });
    saveTabStates(tabs);

    // Broadcast to other tabs
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({
          type: "heartbeat",
          tabId: TAB_ID,
          state: thisTabStateRef.current,
          timestamp: now,
        });
      } catch {
        // Channel may be closed
      }
    }
  }, [selectedConversationId, parseTabStates, saveTabStates]);

  // Setup effect
  useEffect(() => {
    // Initialize BroadcastChannel
    if (typeof BroadcastChannel !== "undefined") {
      channelRef.current = new BroadcastChannel(TAB_COORDINATION_CHANNEL);
      channelRef.current.onmessage = (event: MessageEvent<{
        type: string;
        tabId: string;
        state?: TabState;
        timestamp: number;
      }>) => {
        const { type, tabId, state: incomingState } = event.data;

        if (tabId === TAB_ID) return; // Ignore own messages

        if (type === "heartbeat") {
          const tabs = parseTabStates();
          if (incomingState) {
            tabs.set(tabId, incomingState);
          } else {
            tabs.delete(tabId);
          }
          saveTabStates(tabs);
          updateStateFromTabs(tabs);
        }
      };
    }

    // Start heartbeat interval
    heartbeatRef.current = setInterval(() => {
      if (document.hidden) {
        // Skip heartbeat write when hidden - only read to detect other tabs' state
        const tabs = parseTabStates();
        updateStateFromTabs(tabs);
        return;
      }
      sendHeartbeat();
      const tabs = parseTabStates();
      updateStateFromTabs(tabs);
    }, HEARTBEAT_INTERVAL_MS);

    // Listen for visibility changes
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      thisTabStateRef.current.isActive = isVisible;
      thisTabStateRef.current.isIdle = document.hidden;
      sendHeartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle beforeunload
    const handleBeforeUnload = () => {
      const tabs = parseTabStates();
      tabs.delete(TAB_ID);
      saveTabStates(tabs);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      if (channelRef.current) {
        channelRef.current.close();
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);

      // Clean up this tab's state
      const tabs = parseTabStates();
      tabs.delete(TAB_ID);
      saveTabStates(tabs);
    };
  }, [parseTabStates, saveTabStates, updateStateFromTabs, sendHeartbeat]);

  // Broadcast conversation changes when selected conversation changes
  useEffect(() => {
    const currentConvId = selectedConversationId;
    thisTabStateRef.current.selectedConversationId = currentConvId;
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({
          type: "conversation_change",
          tabId: TAB_ID,
          conversationId: currentConvId,
          timestamp: Date.now(),
        });
      } catch {
        // Channel may be closed
      }
    }
  }, [selectedConversationId]);

  return {
    /** Unique ID for this tab */
    thisTabId: TAB_ID,
    /** Whether this tab is the "active" tab (should make real-time requests) */
    isThisTabActive: state.isThisTabActive,
    /** Whether this tab is currently visible */
    isVisible: document.visibilityState === "visible",
    /** Map of all active tabs */
    activeTabs: state.activeTabs,
    /** Number of active tabs */
    activeTabCount: state.activeTabs.size,
    /** Broadcast a custom message to other tabs */
    broadcast: (message: unknown) => {
      if (channelRef.current) {
        try {
          channelRef.current.postMessage({
            type: "custom",
            tabId: TAB_ID,
            payload: message,
            timestamp: Date.now(),
          });
        } catch {
          // Channel may be closed
        }
      }
    },
  };
};

/**
 * Hook to check if this tab should perform real-time operations.
 * Only the most recently active tab should make WebSocket/API requests.
 */
export const useIsPrimaryTab = () => {
  const { isThisTabActive, isVisible, activeTabCount } = useMultiTabCoordination();

  return {
    /** Whether this tab should handle real-time updates */
    shouldHandleRealtime: isThisTabActive && isVisible,
    /** Number of tabs open */
    tabCount: activeTabCount,
    /** Whether this is the only tab */
    isOnlyTab: activeTabCount <= 1,
  };
};

export default useMultiTabCoordination;
