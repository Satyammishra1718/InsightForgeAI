import { Types } from 'mongoose';
import { AgentState, SubQuestion } from './types.js';
import { LLMService } from '../services/llm.service.js';
import { AgentTrace } from '../models/index.js';

export class PlannerAgent {
  public static readonly NAME = 'PlannerAgent';

  /**
   * Takes the user's original query, calls LLM to break it into 3-5 focused sub-questions,
   * stores them in the session state, and writes an AgentTrace to MongoDB.
   */
  public static async execute(state: AgentState): Promise<SubQuestion[]> {
    const inputPayload = {
      query: state.originalQuery,
      sessionId: state.sessionId,
    };

    const subQuestions = await LLMService.planSubQuestions(state.originalQuery);

    state.subQuestions = subQuestions;
    state.currentStep = 'planning_completed';

    // Persist trace to MongoDB if sessionId is a valid MongoDB ObjectId
    if (Types.ObjectId.isValid(state.sessionId)) {
      try {
        await AgentTrace.create({
          sessionId: state.sessionId,
          agentName: this.NAME,
          step: 'planning',
          input: inputPayload,
          output: {
            subQuestionsCount: subQuestions.length,
            subQuestions,
          },
          timestamp: new Date(),
        });
      } catch (err) {
        console.warn(`[${this.NAME}] Failed to record AgentTrace to MongoDB:`, err);
      }
    }

    return subQuestions;
  }
}
