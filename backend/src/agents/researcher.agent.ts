import { Types } from 'mongoose';
import { AgentState, SubQuestion, ResearchFinding, RetrievedChunkInfo } from './types.js';
import { retrieveContext } from '../rag/index.js';
import { LLMService } from '../services/llm.service.js';
import { AgentTrace } from '../models/index.js';

export class ResearcherAgent {
  public static readonly NAME = 'ResearcherAgent';

  /**
   * Researches a single sub-question:
   * 1. Pulls relevant chunks from RAG module via retrieveContext()
   * 2. Calls LLM to produce draft finding with inline source references
   * 3. Writes an AgentTrace record to MongoDB
   */
  public static async executeSingle(
    sessionId: string,
    subQuestion: SubQuestion,
  ): Promise<ResearchFinding> {
    const inputPayload = {
      subQuestionId: subQuestion.id,
      question: subQuestion.question,
      sessionId,
    };

    // 1. Retrieve RAG chunks for this sub-question scoped to this session
    let rawChunks = await retrieveContext(sessionId, subQuestion.question, 5);

    // If no session-specific chunks found, attempt fallback search across general collection
    if (rawChunks.length === 0) {
      try {
        rawChunks = await retrieveContext('', subQuestion.question, 3);
      } catch {
        // Fallback search optional
      }
    }

    const chunks: RetrievedChunkInfo[] = rawChunks.map((c) => ({
      id: c.id,
      text: c.text,
      source: c.source,
      sourceType: c.sourceType,
      score: c.score,
    }));

    // 2. Call LLM to produce draft finding with inline citations
    const draft = await LLMService.researchDraft(subQuestion.question, chunks);

    const finding: ResearchFinding = {
      subQuestionId: subQuestion.id,
      subQuestion: subQuestion.question,
      finding: draft.finding,
      sources: draft.sources,
      retrievedChunks: chunks,
    };

    // 3. Persist individual researcher trace to MongoDB
    if (Types.ObjectId.isValid(sessionId)) {
      try {
        await AgentTrace.create({
          sessionId,
          agentName: this.NAME,
          step: `research_${subQuestion.id}`,
          input: inputPayload,
          output: {
            subQuestionId: subQuestion.id,
            findingPreview: finding.finding.slice(0, 150),
            sourcesCount: finding.sources.length,
            chunksRetrieved: chunks.length,
          },
          timestamp: new Date(),
        });
      } catch (err) {
        console.warn(`[${this.NAME}] Failed to record AgentTrace to MongoDB:`, err);
      }
    }

    return finding;
  }

  /**
   * Runs 2-3 researcher agents in parallel using Promise.allSettled.
   * If one researcher fails, the others still complete successfully.
   */
  public static async executeAll(
    state: AgentState,
    maxParallel = 3,
  ): Promise<ResearchFinding[]> {
    const questionsToRun = state.subQuestions.slice(0, maxParallel);

    // Run parallel researchers with error isolation
    const results = await Promise.allSettled(
      questionsToRun.map((sq) => this.executeSingle(state.sessionId, sq)),
    );

    const successfulFindings: ResearchFinding[] = [];
    const failures: Array<{ subQuestionId: string; error: string }> = [];

    results.forEach((res, idx) => {
      const sq = questionsToRun[idx];
      if (res.status === 'fulfilled') {
        successfulFindings.push(res.value);
      } else {
        const errorMsg = res.reason instanceof Error ? res.reason.message : String(res.reason);
        console.warn(`[${this.NAME}] Researcher for ${sq.id} failed: ${errorMsg}`);
        failures.push({ subQuestionId: sq.id, error: errorMsg });
      }
    });

    if (successfulFindings.length === 0 && questionsToRun.length > 0) {
      throw new Error(`All parallel researcher agents failed: ${JSON.stringify(failures)}`);
    }

    state.researchFindings = successfulFindings;
    state.currentStep = 'research_completed';

    return successfulFindings;
  }
}
