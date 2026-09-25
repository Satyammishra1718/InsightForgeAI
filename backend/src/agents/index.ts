/**
 * Agent Scaffolding for InsightForge-AI
 *
 * Future implementations will introduce specialized autonomous agents:
 * - OrchestratorAgent: High-level research coordinator
 * - SearchAgent: Web research and retrieval agent
 * - SynthesisAgent: Summarization and report drafting agent
 * - FactCheckAgent: Cross-verification of agent claims
 */

export interface AgentContext {
  userId?: string;
  sessionId: string;
  query: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResponse {
  agentName: string;
  output: string;
  status: 'completed' | 'failed' | 'pending';
}

export interface IAgent {
  name: string;
  description: string;
  execute(context: AgentContext): Promise<AgentResponse>;
}
