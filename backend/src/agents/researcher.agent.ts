import { Types } from 'mongoose';
import { AgentState, SubQuestion, ResearchFinding, RetrievedChunkInfo } from './types.js';
import { MCPClientManager } from '../mcp/index.js';
import { LLMService } from '../services/llm.service.js';
import { AgentTrace } from '../models/index.js';

export class ResearcherAgent {
  public static readonly NAME = 'ResearcherAgent';

  /**
   * Researches a single sub-question by routing tool calls through the Model Context Protocol (MCP):
   * 1. Decides which MCP tool(s) to call (retrieve_context and/or web_search)
   * 2. Calls tools through MCPClientManager (tool calls are automatically measured and logged to AgentTrace)
   * 3. Calls LLM to produce draft finding with inline source references
   * 4. Writes a comprehensive AgentTrace record to MongoDB
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

    const chunks: RetrievedChunkInfo[] = [];
    const toolsUsed: string[] = [];

    // 1. Tool Call: retrieve_context via MCP
    if (MCPClientManager.hasTool('retrieve_context')) {
      try {
        const docChunks = await MCPClientManager.callTool<RetrievedChunkInfo[]>(
          'retrieve_context',
          { sessionId, query: subQuestion.question, topK: 5 },
          { sessionId, agentName: this.NAME },
        );

        if (Array.isArray(docChunks)) {
          docChunks.forEach((c) => {
            chunks.push({
              id: c.id,
              text: c.text,
              source: c.source,
              sourceType: c.sourceType || 'document',
              score: c.score,
            });
          });
          toolsUsed.push('retrieve_context');
        }
      } catch (err) {
        console.warn(`[${this.NAME}] MCP retrieve_context invocation error:`, err);
      }
    }

    // 2. Decision logic: Call web_search via MCP if topic requires broad external corroboration
    // or if initial document retrieval yielded limited context
    const qLower = subQuestion.question.toLowerCase();
    const shouldSearchWeb =
      chunks.length < 2 ||
      qLower.includes('benchmark') ||
      qLower.includes('tradeoff') ||
      qLower.includes('trade-off') ||
      qLower.includes('differ') ||
      qLower.includes('compar') ||
      qLower.includes('scal') ||
      qLower.includes('workload');

    if (shouldSearchWeb && MCPClientManager.hasTool('web_search')) {
      try {
        const webResults = await MCPClientManager.callTool<
          Array<{ title: string; url: string; snippet: string }>
        >(
          'web_search',
          { query: subQuestion.question },
          { sessionId, agentName: this.NAME },
        );

        if (Array.isArray(webResults)) {
          webResults.forEach((wr, idx) => {
            chunks.push({
              id: `web-${subQuestion.id}-${idx}`,
              text: `Title: ${wr.title}\nURL: ${wr.url}\n${wr.snippet}`,
              source: wr.url,
              sourceType: 'web',
              score: 0.88,
            });
          });
          toolsUsed.push('web_search');
        }
      } catch (err) {
        console.warn(`[${this.NAME}] MCP web_search invocation error:`, err);
      }
    }

    // 3. Call LLM to produce draft finding with inline citations using MCP-retrieved context
    const draft = await LLMService.researchDraft(subQuestion.question, chunks);

    const finding: ResearchFinding = {
      subQuestionId: subQuestion.id,
      subQuestion: subQuestion.question,
      finding: draft.finding,
      sources: draft.sources,
      retrievedChunks: chunks,
    };

    // 4. Persist individual researcher step trace to MongoDB
    if (Types.ObjectId.isValid(sessionId)) {
      try {
        await AgentTrace.create({
          sessionId,
          agentName: this.NAME,
          step: `research_${subQuestion.id}`,
          input: {
            ...inputPayload,
            toolsCalled: toolsUsed,
          },
          output: {
            subQuestionId: subQuestion.id,
            findingPreview: finding.finding.slice(0, 150),
            sourcesCount: finding.sources.length,
            chunksRetrieved: chunks.length,
            toolsUsed,
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
    // Ensure MCP client is initialized before parallel execution
    await MCPClientManager.initialize();

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
