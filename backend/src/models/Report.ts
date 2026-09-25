import { Schema, model, Document, Types } from 'mongoose';

export interface ISource {
  title: string;
  url: string;
  snippet?: string;
}

export interface IReport {
  sessionId: Types.ObjectId | string;
  content: string;
  sources: ISource[];
  createdAt: Date;
}

export interface ReportDocument extends IReport, Document {
  _id: Types.ObjectId;
}

const sourceSchema = new Schema<ISource>(
  {
    title: {
      type: String,
      required: [true, 'Source title is required'],
      trim: true,
    },
    url: {
      type: String,
      required: [true, 'Source URL is required'],
      trim: true,
    },
    snippet: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const reportSchema = new Schema<ReportDocument>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ResearchSession',
      required: [true, 'Session ID is required for report'],
      unique: true,
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Report content is required'],
    },
    sources: {
      type: [sourceSchema],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);

export const Report = model<ReportDocument>('Report', reportSchema);
