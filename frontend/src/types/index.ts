export type SessionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface Source {
  title: string;
  url: string;
  snippet: string;
}

export interface Report {
  _id?: string;
  sessionId: string;
  content: string;
  sources: Source[];
  createdAt: string;
}

export interface AgentTrace {
  _id?: string;
  sessionId: string;
  agentName: string;
  step: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: string;
}

export interface ResearchSession {
  _id: string;
  userId?: { name: string; email: string } | string;
  query: string;
  status: SessionStatus;
  /** Human-readable failure reason, set when status is 'failed'. */
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  report?: Report | null;
  agentTraces?: AgentTrace[];
}

export interface AgentProgressEvent {
  sessionId: string;
  agentName: string;
  step: string;
  status: 'started' | 'in_progress' | 'completed' | 'failed';
  summary: string;
  timestamp: string;
}

export type AgentStateStatus = 'waiting' | 'active' | 'done' | 'failed';

export interface AgentCardInfo {
  id: string;
  name: string;
  role: string;
  description: string;
  status: AgentStateStatus;
  summary?: string;
  lastUpdated?: string;
  details?: Record<string, unknown>;
}

export interface PaginatedSessionsResponse {
  sessions: ResearchSession[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
