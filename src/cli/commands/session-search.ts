import chalk from 'chalk';
import {
  searchSessionHistory,
  type SessionHistorySearchReport,
} from '../../features/session-history-search/index.js';

export interface SessionSearchCommandOptions {
  limit?: number;
  session?: string;
  since?: string;
  project?: string;
  json?: boolean;
  caseSensitive?: boolean;
  context?: number;
  workingDirectory?: string;
}

interface LoggerLike {
  log: (message?: unknown) => void;
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return 'unknown time';
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toISOString();
}

export function formatSessionSearchReport(report: SessionHistorySearchReport): string {
  if (report.totalMatches === 0) {
    return [
      `No session history matches found for ${chalk.cyan(JSON.stringify(report.query))}.`,
      chalk.gray(`Searched ${report.searchedFiles} files in ${report.scope.mode} scope.`),
    ].join('\n');
  }

  const lines: string[] = [
    chalk.blue(`Session history matches for ${JSON.stringify(report.query)}`),
    chalk.gray(`Showing ${report.results.length} of ${report.totalMatches} matches across ${report.searchedFiles} files (${report.scope.mode} scope)`),
    '',
  ];

  report.results.forEach((result, index) => {
    lines.push(`${chalk.bold(`${index + 1}.`)} ${result.sessionId}${result.agentId ? chalk.gray(` [agent:${result.agentId}]`) : ''}`);
    lines.push(`   ${chalk.gray(formatTimestamp(result.timestamp))}`);
    if (result.projectPath) {
      lines.push(`   ${chalk.gray(result.projectPath)}`);
    }
    lines.push(`   ${result.excerpt}`);
    lines.push(`   ${chalk.gray(`${result.sourcePath}:${result.line}`)}`);
    lines.push('');
  });

  return lines.join('\n').trimEnd();
}

export async function sessionSearchCommand(
  query: string,
  options: SessionSearchCommandOptions,
  logger: LoggerLike = console,
): Promise<SessionHistorySearchReport> {
  const report = await searchSessionHistory({
    query,
    limit: options.limit,
    sessionId: options.session,
    since: options.since,
    project: options.project,
    caseSensitive: options.caseSensitive,
    contextChars: options.context,
    workingDirectory: options.workingDirectory,
  });

  logger.log(options.json ? JSON.stringify(report, null, 2) : formatSessionSearchReport(report));
  return report;
}
