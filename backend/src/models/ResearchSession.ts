import { Schema, model, Document, Types } from 'mongoose';

export type SessionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface IResearchSession {
  userId?: Types.ObjectId | string;
  query: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchSessionDocument extends IResearchSession, Document {
  _id: Types.ObjectId;
}

const researchSessionSchema = new Schema<ResearchSessionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    query: {
      type: String,
      required: [true, 'Session query is required'],
      trim: true,
      maxlength: [2000, 'Query cannot exceed 2000 characters'],
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'in_progress', 'completed', 'failed'],
        message: '{VALUE} is not a supported session status',
      },
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Compound index for efficient paginated sorting
researchSessionSchema.index({ createdAt: -1 });

export const ResearchSession = model<ResearchSessionDocument>(
  'ResearchSession',
  researchSessionSchema,
);
