import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ResearchSession,
  Report,
  AgentTrace,
  AgentCardInfo,
  AgentProgressEvent,
} from '@/types';

const INITIAL_AGENTS: AgentCardInfo[] = [
  {
    id: 'planner',
    name: 'Planner Agent',
    role: 'Query Decomposition & Strategy',
    description: 'Deconstructs research query into 3-5 distinct, targeted sub-questions.',
    status: 'waiting',
    summary: 'Awaiting research goal initialization...',
  },
  {
    id: 'researcher_1',
    name: 'Researcher 1',
    role: 'RAG Retrieval & Deep Web Mining',
    description: 'Executes semantic vector search and Tavily web retrieval for sub-question 1.',
    status: 'waiting',
    summary: 'Standing by for planned sub-questions...',
  },
  {
    id: 'researcher_2',
    name: 'Researcher 2',
    role: 'Cross-Topic Synthesis & Citations',
    description: 'Retrieves corroborating documents and extracts cited evidence.',
    status: 'waiting',
    summary: 'Standing by for parallel execution...',
  },
  {
    id: 'critic',
    name: 'Critic / Verifier',
    role: 'Fact-Checking & Hallucination Guard',
    description: 'Cross-checks every extracted claim against raw retrieved source chunks.',
    status: 'waiting',
    summary: 'Waiting for preliminary researcher findings...',
  },
  {
    id: 'synthesizer',
    name: 'Synthesizer Agent',
    role: 'Executive Report Generation',
    description: 'Harmonizes verified claims into an authoritative, cited markdown briefing.',
    status: 'waiting',
    summary: 'Waiting for verified claims from Critic...',
  },
];

export function useResearchSession() {
  const [currentSession, setCurrentSession] = useState<ResearchSession | null>(null);
  const [agents, setAgents] = useState<AgentCardInfo[]>(INITIAL_AGENTS);
  const [report, setReport] = useState<Report | null>(null);
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCachedHit, setIsCachedHit] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up WebSocket and polling on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, []);

  const resetState = useCallback(() => {
    setAgents(INITIAL_AGENTS.map((a) => ({ ...a, status: 'waiting', summary: 'Standing by...' })));
    setReport(null);
    setTraces([]);
    setError(null);
    setIsCachedHit(false);
  }, []);

  // Fetch full session details from backend
  const fetchSessionDetails = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sessionData: ResearchSession = data.session;

      setCurrentSession(sessionData);
      if (sessionData.report) {
        setReport(sessionData.report);
      }
      if (sessionData.agentTraces && sessionData.agentTraces.length > 0) {
        setTraces(sessionData.agentTraces);
      }

      if (sessionData.status === 'completed') {
        setIsRunning(false);
        // Mark all agents as done
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            status: 'done',
            summary: a.summary || 'Task completed successfully.',
          })),
        );
        if (pollingTimerRef.current) {
          clearInterval(pollingTimerRef.current);
          pollingTimerRef.current = null;
        }
      } else if (sessionData.status === 'failed') {
        setIsRunning(false);
        setError('Research session failed to complete. Please try running again.');
        if (pollingTimerRef.current) {
          clearInterval(pollingTimerRef.current);
          pollingTimerRef.current = null;
        }
      }

      return sessionData;
    } catch (err) {
      console.warn('Error fetching session details:', err);
      return null;
    }
  }, []);

  // Handle incoming progress event from WebSocket
  const handleProgressEvent = useCallback(
    (event: AgentProgressEvent) => {
      const { agentName, status, summary } = event;

      setAgents((prev) => {
        return prev.map((agent) => {
          const isMatch =
            agent.id === agentName ||
            (agentName.startsWith('researcher') && agent.id.startsWith('researcher') && agent.id === agentName);

          if (isMatch) {
            let nextStatus: AgentCardInfo['status'] = 'waiting';
            if (status === 'started' || status === 'in_progress') nextStatus = 'active';
            else if (status === 'completed') nextStatus = 'done';
            else if (status === 'failed') nextStatus = 'failed';

            return {
              ...agent,
              status: nextStatus,
              summary: summary || agent.summary,
              lastUpdated: new Date().toLocaleTimeString(),
            };
          }

          // Dynamic state propagation
          if (agentName.startsWith('researcher') && agent.id === 'planner') {
            return { ...agent, status: 'done' };
          }
          if (agentName === 'critic' && (agent.id === 'planner' || agent.id.startsWith('researcher'))) {
            return { ...agent, status: 'done' };
          }
          if (agentName === 'synthesizer' && agent.id !== 'synthesizer') {
            return { ...agent, status: 'done' };
          }

          return agent;
        });
      });

      // If synthesizer finishes or pipeline concludes, reload session data
      if (agentName === 'synthesizer' && status === 'completed' && activeSessionIdRef.current) {
        setTimeout(() => {
          if (activeSessionIdRef.current) {
            fetchSessionDetails(activeSessionIdRef.current);
          }
        }, 800);
      }
    },
    [fetchSessionDetails],
  );

  // Connect WebSocket to stream live agent progress
  const connectWebSocket = useCallback(
    (sessionId: string) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        socket = new WebSocket('ws://localhost:5000/ws');
      }

      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
        // Subscribe to session channel
        socket.send(
          JSON.stringify({
            type: 'subscribe',
            sessionId,
          }),
        );
      };

      socket.onmessage = (messageEvent) => {
        try {
          const payload = JSON.parse(messageEvent.data);

          if (payload.type === 'progress' && payload.data) {
            handleProgressEvent(payload.data as AgentProgressEvent);
          } else if (payload.sessionId && payload.agentName) {
            handleProgressEvent(payload as AgentProgressEvent);
          }
        } catch {
          // ignore non-json
        }
      };

      socket.onerror = (err) => {
        console.warn('WebSocket error, falling back to background polling:', err);
      };

      socket.onclose = () => {
        setWsConnected(false);
      };

      // Set up polling fallback to ensure session completes even if WS disconnects
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = setInterval(() => {
        if (activeSessionIdRef.current) {
          fetchSessionDetails(activeSessionIdRef.current);
        }
      }, 2500);
    },
    [fetchSessionDetails, handleProgressEvent],
  );

  // Trigger full research workflow for a query
  const startResearch = useCallback(
    async (queryText: string) => {
      const trimmed = queryText.trim();
      if (!trimmed) return;

      setIsRunning(true);
      setError(null);
      resetState();

      try {
        // Step 1: Create session (POST /api/sessions)
        const createRes = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed }),
        });

        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Failed to create session (HTTP ${createRes.status})`);
        }

        const createData = await createRes.json();
        const session: ResearchSession = createData.session;
        setCurrentSession(session);
        activeSessionIdRef.current = session._id;

        // Step 2: Trigger pipeline run (POST /api/sessions/:id/run)
        const runRes = await fetch(`/api/sessions/${session._id}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cacheable: true }),
        });

        if (!runRes.ok) {
          const errData = await runRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Failed to start research run (HTTP ${runRes.status})`);
        }

        const runData = await runRes.json();

        // Check if hit semantic cache
        if (runData.status === 'completed' && runData.cached) {
          setIsCachedHit(true);
          setIsRunning(false);
          setAgents((prev) =>
            prev.map((a) => ({
              ...a,
              status: 'done',
              summary: 'Retrieved instantly from Redis Semantic Cache.',
            })),
          );
          if (runData.report) {
            setReport(runData.report);
          }
          await fetchSessionDetails(session._id);
          return;
        }

        // Step 3: Connect WebSocket and subscribe
        // Put planner into active state immediately
        setAgents((prev) =>
          prev.map((a) =>
            a.id === 'planner'
              ? { ...a, status: 'active', summary: 'Deconstructing research query into sub-questions...' }
              : a,
          ),
        );

        connectWebSocket(session._id);
      } catch (err) {
        setIsRunning(false);
        setError(
          (err instanceof Error && err.message) || 'An unexpected error occurred while running research',
        );
      }
    },
    [connectWebSocket, fetchSessionDetails, resetState],
  );

  // Load an existing session by ID
  const loadExistingSession = useCallback(
    async (sessionId: string) => {
      setIsRunning(true);
      setError(null);
      resetState();
      activeSessionIdRef.current = sessionId;

      try {
        const sessionData = await fetchSessionDetails(sessionId);
        if (sessionData && sessionData.status !== 'completed' && sessionData.status !== 'failed') {
          // If still running, connect WebSocket to resume progress streaming
          connectWebSocket(sessionId);
        } else {
          setIsRunning(false);
        }
      } catch (err) {
        setIsRunning(false);
        setError((err instanceof Error && err.message) || 'Failed to load session');
      }
    },
    [connectWebSocket, fetchSessionDetails, resetState],
  );

  return {
    currentSession,
    agents,
    report,
    traces,
    isRunning,
    error,
    isCachedHit,
    wsConnected,
    startResearch,
    loadExistingSession,
    resetState,
  };
}
