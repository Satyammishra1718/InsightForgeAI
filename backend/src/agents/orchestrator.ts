import { ResearchSession, ResearchSessionDocument, Report, ReportDocument, AgentTrace } from '../models/index.js';
import { AgentState } from './types.js';
import { PlannerAgent } from './planner.agent.js';
import { ResearcherAgent } from './researcher.agent.js';
import { CriticAgent } from './critic.agent.js';
import { SynthesizerAgent } from './synthesizer.agent.js';
import { NotFoundError } from '../errors/AppError.js';

export interface ResearchPipelineResult {
  session: ResearchSessionDocument;
  report: ReportDocument;
  state: AgentState;
}

/**
 * Orchestrator function running:
 * Planner -> Researchers (parallel) -> Critic/Verifier -> Synthesizer
 *
 * Updates ResearchSession status at each stage and creates AgentTrace records.
 */
export async function runResearchPipeline(
  sessionId: string,
  query: string,
): Promise<ResearchPipelineResult> {
  const session = await ResearchSession.findById(sessionId);
  if (!session) {
    throw new NotFoundError(`Research session with ID '${sessionId}' not found`);
  }

  // 1. Initialize Shared Agent State
  const state: AgentState = {
    sessionId,
    originalQuery: query || session.query,
    subQuestions: [],
    researchFindings: [],
    verifiedClaims: [],
    status: 'in_progress',
    currentStep: 'started',
  };

  try {
    // 2. Mark session as in_progress
    session.status = 'in_progress';
    await session.save();

    // 3. Stage 1: Planner Agent
    state.currentStep = 'planning';
    await PlannerAgent.execute(state);

    // 4. Stage 2: Parallel Researcher Agents
    state.currentStep = 'research';
    await ResearcherAgent.executeAll(state, 3);

    // 5. Stage 3: Critic / Verifier Agent (Cross-check against RAG context)
    state.currentStep = 'verification';
    await CriticAgent.execute(state);

    // 6. Stage 4: Synthesizer Agent
    state.currentStep = 'synthesis';
    await SynthesizerAgent.execute(state);

    if (!state.finalReport) {
      throw new Error('Synthesizer agent completed without generating a final report.');
    }

    // 7. Persist Report to MongoDB
    const reportDoc = await Report.findOneAndUpdate(
      { sessionId },
      {
        sessionId,
        content: state.finalReport.content,
        sources: state.finalReport.sources,
        createdAt: new Date(),
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );

    // 8. Mark session as completed
    session.status = 'completed';
    await session.save();

    state.status = 'completed';
    state.currentStep = 'finished';

    return {
      session,
      report: reportDoc,
      state,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Orchestrator] Pipeline failed for session ${sessionId}: ${errorMsg}`);

    state.status = 'failed';
    state.error = errorMsg;

    // Update session status to failed
    await ResearchSession.findByIdAndUpdate(sessionId, {
      status: 'failed',
      updatedAt: new Date(),
    }).catch(() => null);

    // Record failure trace in MongoDB
    await AgentTrace.create({
      sessionId,
      agentName: 'Orchestrator',
      step: 'pipeline_failure',
      input: { originalQuery: state.originalQuery, failedAtStep: state.currentStep },
      output: { error: errorMsg },
      timestamp: new Date(),
    }).catch(() => null);

    throw error;
  }
}
