/**
 * HUD payload byte pressure estimation.
 *
 * Qoder CLI does not expose the exact serialized Anthropic request body to
 * statusline hooks. The HUD can only observe local session artifacts such as the
 * transcript JSONL path. Transcript size is therefore a conservative signal for
 * screenshot/tool-output-heavy sessions, not an exact API payload byte count.
 */

import { existsSync, statSync } from "fs";

export const DASHSCOPE_REQUEST_PAYLOAD_LIMIT_BYTES = 32_000_000;
export const PAYLOAD_WARNING_BYTES = 22_000_000;
export const PAYLOAD_CRITICAL_BYTES = 26_000_000;

export type PayloadPressure = "normal" | "warning" | "critical";

export interface PayloadEstimate {
  /** Approximate local transcript-backed payload pressure in bytes. */
  estimatedBytes: number;
  /** API request payload cap used for the warning label. */
  limitBytes: number;
  /** Threshold bucket for color/message selection. */
  pressure: PayloadPressure;
  /** Human-readable label; includes "est" because this is not exact API bytes. */
  label: string;
}

function toPressure(bytes: number): PayloadPressure {
  if (bytes >= PAYLOAD_CRITICAL_BYTES) return "critical";
  if (bytes >= PAYLOAD_WARNING_BYTES) return "warning";
  return "normal";
}

export function formatPayloadMegabytes(bytes: number): string {
  const mb = bytes / 1_000_000;
  if (mb < 10) return mb.toFixed(1);
  return String(Math.round(mb));
}

export function formatPayloadEstimateLabel(
  estimatedBytes: number,
  limitBytes = DASHSCOPE_REQUEST_PAYLOAD_LIMIT_BYTES,
): string {
  return `payload est ~${formatPayloadMegabytes(estimatedBytes)} MB / ${formatPayloadMegabytes(limitBytes)} MB`;
}

export function createPayloadEstimate(
  estimatedBytes: number,
  limitBytes = DASHSCOPE_REQUEST_PAYLOAD_LIMIT_BYTES,
): PayloadEstimate | null {
  if (!Number.isFinite(estimatedBytes) || estimatedBytes < 0) return null;
  return {
    estimatedBytes,
    limitBytes,
    pressure: toPressure(estimatedBytes),
    label: formatPayloadEstimateLabel(estimatedBytes, limitBytes),
  };
}

export function estimatePayloadFromTranscriptPath(
  transcriptPath: string | null | undefined,
): PayloadEstimate | null {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  try {
    const stat = statSync(transcriptPath);
    if (!stat.isFile()) return null;
    return createPayloadEstimate(stat.size);
  } catch {
    return null;
  }
}
