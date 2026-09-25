import { Types } from 'mongoose';
import { AgentState, VerifiedClaim, ResearchFinding } from './types.js';
import { LLMService } from '../services/llm.service.js';
import { AgentTrace } from '../models/index.js';

export interface VerificationResult {
  verified: VerifiedClaim[];
  flagged: VerifiedClaim[];
}

export class CriticAgent {
  public static readonly NAME = 'CriticAgent';

  /**
   * Takes all researcher findings, extracts claims, and strictly cross-checks
   * each claim against retrieved source chunks to flag unsupported or contradicted assertions.
   */
  public static async execute(
    state: AgentState,
    injectedFindings?: ResearchFinding[],
  ): Promise<VerificationResult> {
    const findings = injectedFindings || state.researchFindings;

    const findingsWithChunks = findings.map((f) => ({
      subQuestion: f.subQuestion,
      finding: f.finding,
      chunks: f.retrievedChunks,
    }));

    const verifiedClaims = await LLMService.verifyClaims(findingsWithChunks);

    const verified = verifiedClaims.filter((c) => c.status === 'verified');
    const flagged = verifiedClaims.filter((c) => c.status !== 'verified');

    state.verifiedClaims = verifiedClaims;
    state.currentStep = 'verification_completed';

    // Persist critic trace to MongoDB
    if (Types.ObjectId.isValid(state.sessionId)) {
      try {
        await AgentTrace.create({
        sessionId: state.sessionId,
        agentName: this.NAME,
        step: 'verification',
        input: {
          findingsCount: findings.length,
          totalClaimsEvaluated: verifiedClaims.length,
        },
        output: {
          verifiedCount: verified.length,
          flaggedCount: flagged.length,
          flaggedClaims: flagged.map((f) => ({
            claim: f.claim,
            status: f.status,
            reasoning: f.reasoning,
          })),
          verifiedSummary: verified.slice(0, 3).map((v) => ({
            claim: v.claim,
            evidence: v.evidence?.slice(0, 100),
          })),
        },
        timestamp: new Date(),
      });
    } catch (err) {
      console.warn(`[${this.NAME}] Failed to record AgentTrace to MongoDB:`, err);
    }
  }

    return { verified, flagged };
  }
}
