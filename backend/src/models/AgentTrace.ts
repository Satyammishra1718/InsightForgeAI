import { Schema, model, Document, Types } from 'mongoose';

export interface IAgentTrace {
  sessionId: Types.ObjectId | string;
  agentName: string;
  step: number | string;
  input: unknown;
  output: unknown;
  timestamp: Date;
}

export interface AgentTraceDocument extends IAgentTrace, Document {
  _id: Types.ObjectId;
}

const agentTraceSchema = new Schema<AgentTraceDocument>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ResearchSession',
      required: [true, 'Session ID is required for agent trace'],
      index: true,
    },
    agentName: {
      type: String,
      required: [true, 'Agent name is required'],
      trim: true,
    },
    step: {
      type: Schema.Types.Mixed,
      required: [true, 'Step identifier or number is required'],
    },
    input: {
      type: Schema.Types.Mixed,
      default: {},
    },
    output: {
      type: Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  },
);

// Compound index for chronologically fetching traces of a session
agentTraceSchema.index({ sessionId: 1, timestamp: 1 });

export const AgentTrace = model<AgentTraceDocument>('AgentTrace', agentTraceSchema);
