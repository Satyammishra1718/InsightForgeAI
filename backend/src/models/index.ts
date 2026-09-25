/**
 * Data Models & Schemas for InsightForge-AI
 *
 * Core entities for research sessions, findings, and knowledge graphs.
 */

export interface ResearchSession {
  id: string;
  title: string;
  query: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'archived' | 'completed';
}

export interface ResearchFinding {
  id: string;
  sessionId: string;
  sourceUrl?: string;
  title: string;
  content: string;
  confidenceScore: number;
  extractedAt: Date;
}
