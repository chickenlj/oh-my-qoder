import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, truncateSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  PAYLOAD_CRITICAL_BYTES,
  PAYLOAD_WARNING_BYTES,
  createPayloadEstimate,
  estimatePayloadFromTranscriptPath,
  formatPayloadEstimateLabel,
} from "../../hud/payload-estimate.js";

describe("HUD payload estimate", () => {
  it("formats approximate MB labels without claiming exact bytes", () => {
    expect(formatPayloadEstimateLabel(22_400_000)).toBe(
      "payload est ~22 MB / 32 MB",
    );
    expect(formatPayloadEstimateLabel(1_500_000)).toBe(
      "payload est ~1.5 MB / 32 MB",
    );
  });

  it("classifies warning and critical thresholds at 22MB and 26MB", () => {
    expect(createPayloadEstimate(PAYLOAD_WARNING_BYTES - 1)?.pressure).toBe(
      "normal",
    );
    expect(createPayloadEstimate(PAYLOAD_WARNING_BYTES)?.pressure).toBe(
      "warning",
    );
    expect(createPayloadEstimate(PAYLOAD_CRITICAL_BYTES)?.pressure).toBe(
      "critical",
    );
  });

  it("estimates from available transcript file size and ignores missing files", () => {
    const dir = mkdtempSync(join(tmpdir(), "omq-payload-est-"));
    try {
      const transcriptPath = join(dir, "transcript.jsonl");
      writeFileSync(transcriptPath, "");
      truncateSync(transcriptPath, PAYLOAD_WARNING_BYTES);

      expect(estimatePayloadFromTranscriptPath(transcriptPath)).toMatchObject({
        estimatedBytes: PAYLOAD_WARNING_BYTES,
        pressure: "warning",
      });
      expect(
        estimatePayloadFromTranscriptPath(join(dir, "missing.jsonl")),
      ).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
