export interface SubQuestion {
  id: string;
  question: string;
  rationale?: string;
}

export interface SourceReference {
  title: string;
  url: string;
  snippet?: string;
}

export interface RetrievedChunkInfo {
  id: string;
  text: string;
  source: string;
  sourceType?: string;
  score: number;
}

export interface ResearchFinding {
  subQuestionId: string;
  subQuestion: string;
  finding: string;
  sources: SourceReference[];
  retrievedChunks: RetrievedChunkInfo[];
}

export interface VerifiedClaim {
  claim: string;
  status: 'verified' | 'unsupported' | 'contradicted';
  evidence?: string;
  reasoning: string;
  sourceUrl?: string;
  confidence?: number;
}

export interface FinalReportData {
  title: string;
  content: string;
  sources: SourceReference[];
}

/**
 * Shared Agent State that flows through the multi-agent pipeline:
 * { sessionId, originalQuery, subQuestions, researchFindings, verifiedClaims, finalReport }
 */
export interface AgentState {
  sessionId: string;
  originalQuery: string;
  subQuestions: SubQuestion[];
  researchFindings: ResearchFinding[];
  verifiedClaims: VerifiedClaim[];
  finalReport?: FinalReportData;
  error?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  currentStep?: string;
}

export interface AgentStepTrace {
  agentName: string;
  step: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: Date;
}
