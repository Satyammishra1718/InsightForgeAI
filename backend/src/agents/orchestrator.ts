import { ResearchSession, ResearchSessionDocument, Report, ReportDocument, AgentTrace } from '../models/index.js';
import { AgentState, SubQuestion, ResearchFinding, VerifiedClaim, FinalReportData } from './types.js';
import { NotFoundError } from '../errors/AppError.js';
import { createSessionLogger } from '../utils/logger.js';

export interface ResearchPipelineResult {
  session: ResearchSessionDocument;
  report: ReportDocument;
  state: AgentState;
}

interface PythonServiceResponse {
  sessionId: string;
  query: string;
  status: string;
  report: {
    title: string;
    content: string;
    executiveSummary?: string;
    sections?: Array<{ heading: string; body: string; citations?: string[] }>;
    sources?: Array<{ title: string; url: string; snippet?: string }>;
  };
  subQuestions?: string[];
  researchFindings?: Array<{
    subQuestionId: string;
    subQuestion: string;
    findings: string;
    sources?: Array<{ title: string; url: string; snippet?: string }>;
  }>;
  verifiedClaims?: Array<{
    claim: string;
    status: string;
    reason?: string;
    sources?: Array<{ title: string; url: string; snippet?: string }>;
  }>;
  flaggedClaims?: Array<{
    claim: string;
    status: string;
    reason?: string;
    sources?: Array<{ title: string; url: string; snippet?: string }>;
  }>;
  traces?: Array<{
    agentName: string;
    step: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    timestamp: string;
  }>;
}

/**
 * Orchestrator delegating to the Python FastAPI LangGraph Microservice:
 * Planner -> Parallel Researchers -> Critic -> Synthesizer
 *
 * Persists AgentTrace and Report documents into MongoDB upon completion.
 */
export async function runResearchPipeline(
  sessionId: string,
  query: string,
): Promise<ResearchPipelineResult> {
  const session = await ResearchSession.findById(sessionId);
  if (!session) {
    throw new NotFoundError(`Research session with ID '${sessionId}' not found`);
  }

  const agentServiceUrl = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000';
  const targetQuery = query || session.query;

  // 1. Mark session as in_progress
  session.status = 'in_progress';
  await session.save();

  const sessLog = createSessionLogger(sessionId, { component: 'Orchestrator', query: targetQuery });

  try {
    sessLog.info({ agentServiceUrl }, 'Invoking LangGraph Python service at /run-research');

    const response = await fetch(`${agentServiceUrl}/run-research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        query: targetQuery,
      }),
      // Without a timeout a stuck LLM call would hold the BullMQ job (and its lock renewals) forever.
      signal: AbortSignal.timeout(Number(process.env.AGENT_SERVICE_TIMEOUT_MS) || 300_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Agent service responded with status ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as PythonServiceResponse;

    // 2. Persist all AgentTraces into MongoDB, replacing any from a previous run of
    // this session (re-runs used to append a second, interleaved set of traces).
    await AgentTrace.deleteMany({ sessionId });
    if (Array.isArray(data.traces) && data.traces.length > 0) {
      const traceDocs = data.traces.map((t) => ({
        sessionId,
        agentName: t.agentName,
        step: t.step,
        input: t.input || {},
        output: t.output || {},
        timestamp: t.timestamp ? new Date(t.timestamp) : new Date(),
      }));
      await AgentTrace.insertMany(traceDocs);
      sessLog.info({ traceCount: traceDocs.length }, 'Persisted AgentTrace records to MongoDB');
    }

    // 3. Persist Report into MongoDB
    const reportSources = (data.report.sources || []).map((s) => ({
      title: s.title || 'Source',
      url: s.url || '',
      snippet: s.snippet || '',
    }));

    const reportDoc = await Report.findOneAndUpdate(
      { sessionId },
      {
        sessionId,
        content: data.report.content || '',
        sources: reportSources,
        createdAt: new Date(),
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );

    // 4. Update session status to completed
    session.status = 'completed';
    await session.save();

    // 5. Assemble formatted AgentState for caller
    const subQuestions: SubQuestion[] = (data.subQuestions || []).map((q, idx) => ({
      id: `sq_${idx + 1}`,
      question: q,
    }));

    const researchFindings: ResearchFinding[] = (data.researchFindings || []).map((rf) => ({
      subQuestionId: rf.subQuestionId,
      subQuestion: rf.subQuestion,
      finding: rf.findings,
      sources: (rf.sources || []).map((s) => ({
        title: s.title,
        url: s.url,
        snippet: s.snippet,
      })),
      retrievedChunks: [],
    }));

    const verifiedClaims: VerifiedClaim[] = (data.verifiedClaims || []).map((vc) => ({
      claim: vc.claim,
      status: (vc.status === 'verified' ? 'verified' : 'unsupported') as 'verified' | 'unsupported',
      reasoning: vc.reason || '',
    }));

    // Include flagged claims in verifiedClaims array for auditability
    if (Array.isArray(data.flaggedClaims)) {
      for (const fc of data.flaggedClaims) {
        verifiedClaims.push({
          claim: fc.claim,
          status: 'unsupported',
          reasoning: fc.reason || 'Flagged by Critic as unsupported or hyperbolic',
        });
      }
    }

    const finalReport: FinalReportData = {
      title: data.report.title || targetQuery,
      content: data.report.content || '',
      sources: reportSources,
    };

    const state: AgentState = {
      sessionId,
      originalQuery: targetQuery,
      subQuestions,
      researchFindings,
      verifiedClaims,
      finalReport,
      status: 'completed',
      currentStep: 'finished',
    };

    return {
      session,
      report: reportDoc,
      state,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    sessLog.error({ err: error, errorMsg }, 'Microservice execution failed for session');

    // Session status is decided by the queue worker: only it knows whether BullMQ
    // will retry this job, so marking 'failed' here reported transient errors as final.

    // Record failure trace in MongoDB
    await AgentTrace.create({
      sessionId,
      agentName: 'Orchestrator',
      step: 'pipeline_failure',
      input: { originalQuery: targetQuery },
      output: { error: errorMsg },
      timestamp: new Date(),
    }).catch(() => null);

    throw error;
  }
}
