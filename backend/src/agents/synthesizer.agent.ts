import { Types } from 'mongoose';
import { AgentState, FinalReportData, SourceReference } from './types.js';
import { LLMService } from '../services/llm.service.js';
import { AgentTrace } from '../models/index.js';

export class SynthesizerAgent {
  public static readonly NAME = 'SynthesizerAgent';

  /**
   * Takes verified claims and distinct research sources, producing a structured
   * final report in Markdown with clear sections and inline citations.
   */
  public static async execute(state: AgentState): Promise<FinalReportData> {
    const verifiedClaims = state.verifiedClaims.filter((c) => c.status === 'verified');

    // Aggregate unique sources from all findings
    const sourceMap = new Map<string, SourceReference>();
    for (const finding of state.researchFindings) {
      for (const src of finding.sources) {
        if (!sourceMap.has(src.url)) {
          sourceMap.set(src.url, src);
        }
      }
    }

    const uniqueSources = Array.from(sourceMap.values());

    const { title, content } = await LLMService.synthesizeReport(
      state.originalQuery,
      verifiedClaims,
      uniqueSources,
    );

    const finalReport: FinalReportData = {
      title,
      content,
      sources: uniqueSources,
    };

    state.finalReport = finalReport;
    state.currentStep = 'synthesis_completed';

    // Persist synthesizer trace to MongoDB
    if (Types.ObjectId.isValid(state.sessionId)) {
      try {
        await AgentTrace.create({
          sessionId: state.sessionId,
          agentName: this.NAME,
          step: 'synthesis',
          input: {
            verifiedClaimsCount: verifiedClaims.length,
            uniqueSourcesCount: uniqueSources.length,
            originalQuery: state.originalQuery,
          },
          output: {
            reportTitle: title,
            characterCount: content.length,
            sectionsCount: (content.match(/^##\s+/gm) || []).length,
          },
          timestamp: new Date(),
        });
      } catch (err) {
        console.warn(`[${this.NAME}] Failed to record AgentTrace to MongoDB:`, err);
      }
    }

    return finalReport;
  }
}
