import { ResearchSession, ResearchSessionDocument, Report, AgentTrace } from '../models/index.js';
import { NotFoundError } from '../errors/AppError.js';
import { CreateSessionInput, ListSessionsQuery } from '../validators/session.validator.js';

export interface PaginatedSessions {
  sessions: ResearchSessionDocument[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class SessionService {
  /**
   * Create a new research session with status 'pending'
   */
  public static async createSession(input: CreateSessionInput): Promise<ResearchSessionDocument> {
    const session = await ResearchSession.create({
      query: input.query,
      userId: input.userId,
      status: 'pending',
    });

    return session;
  }

  /**
   * List all sessions with pagination, sorted most recent first
   */
  public static async listSessions(options: ListSessionsQuery): Promise<PaginatedSessions> {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (options.status) {
      filter.status = options.status;
    }

    const [sessions, total] = await Promise.all([
      ResearchSession.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email')
        .lean(),
      ResearchSession.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      sessions: sessions as unknown as ResearchSessionDocument[],
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Get single session with its report and agent traces if available
   */
  public static async getSessionById(id: string) {
    const session = await ResearchSession.findById(id).populate('userId', 'name email').lean();

    if (!session) {
      throw new NotFoundError(`Research session with ID '${id}' not found`);
    }

    const [report, agentTraces] = await Promise.all([
      Report.findOne({ sessionId: id }).lean(),
      AgentTrace.find({ sessionId: id }).sort({ timestamp: 1 }).lean(),
    ]);

    return {
      ...session,
      report: report || null,
      agentTraces: agentTraces || [],
    };
  }

  /**
   * Delete a session and clean up its associated reports and agent traces
   */
  public static async deleteSession(id: string) {
    const session = await ResearchSession.findById(id);

    if (!session) {
      throw new NotFoundError(`Research session with ID '${id}' not found`);
    }

    await Promise.all([
      session.deleteOne(),
      Report.deleteMany({ sessionId: id }),
      AgentTrace.deleteMany({ sessionId: id }),
    ]);

    return {
      message: 'Research session and associated traces/reports deleted successfully',
      id,
    };
  }
}
