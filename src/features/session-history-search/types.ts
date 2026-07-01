export interface SessionHistorySearchOptions {
  query: string;
  limit?: number;
  since?: string;
  sessionId?: string;
  project?: string;
  caseSensitive?: boolean;
  contextChars?: number;
  workingDirectory?: string;
}

export interface SessionHistoryMatch {
  sessionId: string;
  agentId?: string;
  timestamp?: string;
  projectPath?: string;
  sourcePath: string;
  sourceType: 'project-transcript' | 'legacy-transcript' | 'omq-session-summary' | 'omq-session-replay';
  line: number;
  role?: string;
  entryType?: string;
  excerpt: string;
}

export interface SessionHistorySearchReport {
  query: string;
  scope: {
    mode: 'current' | 'project' | 'all';
    project?: string;
    workingDirectory?: string;
    since?: string;
    caseSensitive: boolean;
  };
  searchedFiles: number;
  totalMatches: number;
  results: SessionHistoryMatch[];
}
