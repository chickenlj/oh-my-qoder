import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compactOmqStartupGuidance,
  generateConfigSchema,
  loadConfig,
  loadContextFromFiles,
} from "../loader.js";
import { saveAndClear, restore } from "./test-helpers.js";

const ALL_KEYS = [
  "OMQ_ROUTING_FORCE_INHERIT",
  "OMQ_ROUTING_FORCE_INHERIT",
  "QODER_MODEL",
  "DASHSCOPE_MODEL",
  "DASHSCOPE_BASE_URL",
  "OMQ_ROUTING_FORCE_INHERIT",
  "OMQ_MODEL_HIGH",
  "OMQ_MODEL_MEDIUM",
  "OMQ_MODEL_LOW",
  "DASHSCOPE_DEFAULT_MAX_MODEL",
  "DASHSCOPE_DEFAULT_PLUS_MODEL",
  "DASHSCOPE_DEFAULT_TURBO_MODEL",
  "DASHSCOPE_DEFAULT_MAX_MODEL",
  "DASHSCOPE_DEFAULT_PLUS_MODEL",
  "DASHSCOPE_DEFAULT_TURBO_MODEL",
  "OMQ_DELEGATION_ROUTING_ENABLED",
  "OMQ_DELEGATION_ROUTING_DEFAULT_PROVIDER",
] as const;

// ---------------------------------------------------------------------------
// Auto-forceInherit for Bedrock / Vertex (issues #1201, #1025)
// ---------------------------------------------------------------------------
describe("loadConfig() — auto-forceInherit for non-standard providers", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveAndClear(ALL_KEYS);
  });
  afterEach(() => {
    restore(saved);
  });

  it("auto-enables forceInherit for global. Bedrock inference profile with [1m] suffix", () => {
    process.env.DASHSCOPE_MODEL = "dashscope/qwen-plus[1m]";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(true);
  });

  it("auto-enables forceInherit when OMQ_ROUTING_FORCE_INHERIT=true", () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = "true";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(true);
  });

  it("auto-enables forceInherit for us. Bedrock region prefix", () => {
    process.env.DASHSCOPE_MODEL = "dashscope/qwen-max-v1";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(true);
  });

  it("auto-enables forceInherit for Bedrock inference-profile ARN model IDs", () => {
    process.env.DASHSCOPE_MODEL =
      "dashscope/qwen-max";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(true);
  });

  it("auto-enables forceInherit when OMQ_ROUTING_FORCE_INHERIT=true", () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = "true";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(true);
  });

  it("does NOT auto-enable forceInherit for non-Claude Anthropic family-default tier env vars", () => {
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = "kimi-k2.6:cloud";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(false);
    expect(config.agents?.executor?.model).toBe("kimi-k2.6:cloud");
  });

  it("does NOT auto-enable forceInherit for non-Claude OMQ tier env vars", () => {
    process.env.OMQ_MODEL_MEDIUM = "glm-5.1:cloud";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(false);
    expect(config.agents?.executor?.model).toBe("glm-5.1:cloud");
  });

  it("does NOT auto-enable forceInherit when direct Claude QODER_MODEL beats stale DASHSCOPE_MODEL", () => {
    process.env.QODER_MODEL = "qwen-plus";
    process.env.DASHSCOPE_MODEL = "kimi-k2.6:cloud";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(false);
  });

  it("does NOT auto-enable forceInherit when direct Claude QODER_MODEL beats stale OMQ tier env vars", () => {
    process.env.QODER_MODEL = "qwen-plus";
    process.env.OMQ_MODEL_MEDIUM = "glm-5.1:cloud";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(false);
  });

  it("does NOT auto-enable forceInherit when direct Claude DASHSCOPE_MODEL beats stale OMQ tier env vars", () => {
    process.env.DASHSCOPE_MODEL = "qwen-plus";
    process.env.OMQ_MODEL_MEDIUM = "glm-5.1:cloud";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(false);
  });

  it("does NOT auto-enable forceInherit for standard Anthropic API usage", () => {
    process.env.DASHSCOPE_MODEL = "qwen-plus";
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(false);
  });

  it("does NOT auto-enable forceInherit when no provider env vars are set", () => {
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(false);
  });

  it("respects explicit OMQ_ROUTING_FORCE_INHERIT=false even on Bedrock", () => {
    // When user explicitly sets the var (even to false), auto-detection is skipped.
    // This matches the guard: process.env.OMQ_ROUTING_FORCE_INHERIT === undefined
    process.env.DASHSCOPE_MODEL = "dashscope/qwen-plus[1m]";
    process.env.OMQ_ROUTING_FORCE_INHERIT = "false";
    const config = loadConfig();
    // env var is defined → auto-detection skipped → remains at default (false)
    expect(config.routing?.forceInherit).toBe(false);
  });

  it("maps Bedrock family env vars into agent defaults and routing tiers", () => {
    process.env.DASHSCOPE_DEFAULT_MAX_MODEL =
      "dashscope/qwen-max-v1:0";
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL =
      "dashscope/qwen-plus-v1:0";
    process.env.DASHSCOPE_DEFAULT_TURBO_MODEL =
      "dashscope/qwen-turbo-v1:0";

    const config = loadConfig();

    expect(config.agents?.architect?.model).toBe(
      "dashscope/qwen-max-v1:0",
    );
    expect(config.agents?.executor?.model).toBe(
      "dashscope/qwen-plus-v1:0",
    );
    expect(config.agents?.explore?.model).toBe(
      "dashscope/qwen-turbo-v1:0",
    );
    expect(config.routing?.tierModels?.HIGH).toBe(
      "dashscope/qwen-max-v1:0",
    );
    expect(config.routing?.tierModels?.MEDIUM).toBe(
      "dashscope/qwen-plus-v1:0",
    );
    expect(config.routing?.tierModels?.LOW).toBe(
      "dashscope/qwen-turbo-v1:0",
    );
  });

  it("supports Anthropic family-default env vars for tiered routing defaults", () => {
    process.env.DASHSCOPE_DEFAULT_MAX_MODEL = "qwen-max-custom";
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = "qwen-plus-custom";
    process.env.DASHSCOPE_DEFAULT_TURBO_MODEL = "qwen-turbo-custom";

    const config = loadConfig();

    expect(config.agents?.architect?.model).toBe("qwen-max-custom");
    expect(config.agents?.executor?.model).toBe("qwen-plus-custom");
    expect(config.agents?.explore?.model).toBe("qwen-turbo-custom");
  });
});

describe("startup context compaction", () => {
  it("compacts only OMQ-style guidance in loadContextFromFiles while preserving key sections", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-loader-context-"));

    try {
      const omqAgentsPath = join(tempDir, "AGENTS.md");
      const omqGuidance = `# oh-my-qoder - Intelligent Multi-Agent Orchestration

<guidance_schema_contract>
schema
</guidance_schema_contract>

<operating_principles>
- keep this
</operating_principles>

<agent_catalog>
- verbose agent catalog
- verbose agent catalog
</agent_catalog>

<skills>
- verbose skills catalog
- verbose skills catalog
</skills>

<team_compositions>
- verbose team compositions
</team_compositions>

<verification>
- verify this stays
</verification>`;

      writeFileSync(omqAgentsPath, omqGuidance);

      const loaded = loadContextFromFiles([omqAgentsPath]);

      expect(loaded).toContain("<operating_principles>");
      expect(loaded).toContain("<verification>");
      expect(loaded).not.toContain("<agent_catalog>");
      expect(loaded).not.toContain("<skills>");
      expect(loaded).not.toContain("<team_compositions>");
      expect(loaded.length).toBeLessThan(
        omqGuidance.length + `## Context from ${omqAgentsPath}\n\n`.length - 40,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("caps aggregated context across multiple files", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-loader-context-aggregate-"));

    try {
      const fileA = join(tempDir, "AGENTS.md");
      const fileB = join(tempDir, "nested", "CLAUDE.md");
      require("node:fs").mkdirSync(join(tempDir, "nested"), { recursive: true });
      const largeSection = `# oh-my-qoder - Intelligent Multi-Agent Orchestration

<guidance_schema_contract>schema</guidance_schema_contract>

<operating_principles>
${"- keep this\n".repeat(900)}
</operating_principles>

<verification>
- verify
</verification>`;
      writeFileSync(fileA, largeSection);
      writeFileSync(fileB, largeSection);

      const loaded = loadContextFromFiles([fileA, fileB]);

      expect(loaded.length).toBeLessThanOrEqual(12000);
      expect(loaded).toContain(`## Context from ${fileA}`);
      expect(loaded).toContain('startup context budget');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("caps very large OMQ guidance after preserving high-value sections", () => {
    const largeOmq = `# oh-my-qoder - Intelligent Multi-Agent Orchestration

<guidance_schema_contract>
schema
</guidance_schema_contract>

<operating_principles>
${"- keep this principle\n".repeat(1200)}
</operating_principles>

<agent_catalog>
${"- drop catalog\n".repeat(1000)}
</agent_catalog>

<verification>
- verify this stays before truncation
</verification>`;

    const compacted = compactOmqStartupGuidance(largeOmq);

    expect(compacted.length).toBeLessThanOrEqual(8000);
    expect(compacted).toContain("<operating_principles>");
    expect(compacted).not.toContain("<agent_catalog>");
    expect(compacted).toContain("OMQ startup guidance truncated");
  });

  it("leaves non-OMQ guidance unchanged even if it uses similar tags", () => {
    const nonOmq = `# Project guide

<skills>
Keep this custom section.
</skills>`;

    expect(compactOmqStartupGuidance(nonOmq)).toBe(nonOmq);
  });
});

describe("plan output configuration", () => {
  let saved: Record<string, string | undefined>;
  let originalCwd: string;

  beforeEach(() => {
    saved = saveAndClear(ALL_KEYS);
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    restore(saved);
  });

  it("includes plan output defaults", () => {
    const config = loadConfig();
    expect(config.planOutput).toEqual({
      directory: ".omq/plans",
      filenameTemplate: "{{name}}.md",
    });
  });

  it("includes teleport defaults", () => {
    const config = loadConfig();
    expect(config.teleport).toEqual({
      symlinkNodeModules: true,
    });
  });

  it("loads plan output overrides from project config", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-plan-output-"));

    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          planOutput: {
            directory: "docs/plans",
            filenameTemplate: "plan-{{name}}.md",
          },
        }),
      );

      process.chdir(tempDir);

      const config = loadConfig();
      expect(config.planOutput).toEqual({
        directory: "docs/plans",
        filenameTemplate: "plan-{{name}}.md",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("company context configuration", () => {
  let saved: Record<string, string | undefined>;
  let originalCwd: string;

  beforeEach(() => {
    saved = saveAndClear(ALL_KEYS);
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    restore(saved);
  });

  it("includes the default prompt-level fallback", () => {
    const config = loadConfig();
    expect(config.companyContext).toEqual({
      onError: "warn",
    });
  });

  it("loads company context overrides from project config", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-company-context-"));

    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          companyContext: {
            tool: "mcp__vendor__get_company_context",
            onError: "fail",
          },
        }),
      );

      process.chdir(tempDir);

      const config = loadConfig();
      expect(config.companyContext).toEqual({
        tool: "mcp__vendor__get_company_context",
        onError: "fail",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("exposes companyContext in the generated config schema", () => {
    const schema = generateConfigSchema() as {
      properties?: Record<string, { properties?: Record<string, unknown> }>;
    };

    expect(schema.properties?.companyContext).toBeDefined();
    expect(schema.properties?.companyContext?.properties?.tool).toBeDefined();
    expect(schema.properties?.companyContext?.properties?.onError).toBeDefined();
  });
});

describe("team.roleRouting (Option E)", () => {
  let saved: Record<string, string | undefined>;
  let originalCwd: string;

  beforeEach(() => {
    saved = saveAndClear([...ALL_KEYS, "OMQ_TEAM_ROLE_OVERRIDES"] as const);
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    restore(saved);
  });

  it("includes default empty team block in built config", () => {
    const config = loadConfig();
    expect(config.team).toBeDefined();
    expect(config.team?.roleRouting).toEqual({});
    expect(config.team?.ops).toEqual({});
  });

  it("merges per-role file overrides into team.roleRouting", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-team-routing-"));
    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          team: {
            roleRouting: {
              critic: { provider: "codex", model: "gpt-5.3-codex" },
              "code-reviewer": { provider: "gemini" },
            },
          },
        }),
      );
      process.chdir(tempDir);
      const config = loadConfig();
      expect(config.team?.roleRouting?.critic).toEqual({
        provider: "codex",
        model: "gpt-5.3-codex",
      });
      expect(config.team?.roleRouting?.["code-reviewer"]).toEqual({
        provider: "gemini",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts cursor as team defaultAgentType and roleRouting provider", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-team-routing-cursor-"));
    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          team: {
            ops: { defaultAgentType: "cursor" },
            roleRouting: {
              executor: { provider: "cursor" },
            },
          },
        }),
      );
      process.chdir(tempDir);
      const config = loadConfig();
      expect(config.team?.ops?.defaultAgentType).toBe("cursor");
      expect(config.team?.roleRouting?.executor).toEqual({ provider: "cursor" });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("OMQ_TEAM_ROLE_OVERRIDES env wins over file config", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-team-routing-env-"));
    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          team: { roleRouting: { critic: { provider: "qwen", model: "HIGH" } } },
        }),
      );
      process.env.OMQ_TEAM_ROLE_OVERRIDES = JSON.stringify({
        critic: { provider: "codex" },
      });
      process.chdir(tempDir);
      const config = loadConfig();
      expect(config.team?.roleRouting?.critic?.provider).toBe("codex");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("OMQ_TEAM_ROLE_OVERRIDES with invalid JSON is ignored with warning", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      process.env.OMQ_TEAM_ROLE_OVERRIDES = "{not valid json";
      const config = loadConfig();
      expect(config.team?.roleRouting).toEqual({});
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("OMQ_TEAM_ROLE_OVERRIDES"),
      );
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it("rejects invalid provider value with descriptive error", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-team-bad-provider-"));
    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          team: { roleRouting: { critic: { provider: "openai" } } },
        }),
      );
      process.chdir(tempDir);
      expect(() => loadConfig()).toThrow(/team\.roleRouting\.critic\.provider/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects orchestrator.provider override (orchestrator is pinned to claude)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-team-orch-pin-"));
    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          team: {
            roleRouting: { orchestrator: { provider: "codex", model: "HIGH" } },
          },
        }),
      );
      process.chdir(tempDir);
      expect(() => loadConfig()).toThrow(/orchestrator: key "provider" is not allowed/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects unknown agent name", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-team-bad-agent-"));
    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          team: { roleRouting: { executor: { agent: "nonExistentAgent" } } },
        }),
      );
      process.chdir(tempDir);
      expect(() => loadConfig()).toThrow(/team\.roleRouting\.executor\.agent/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts 'reviewer' alias and preserves the raw key for later alias-aware resolution", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-team-alias-"));
    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          team: { roleRouting: { reviewer: { provider: "codex" } } },
        }),
      );
      process.chdir(tempDir);
      // Should not throw — alias normalizes to code-reviewer canonical role.
      const config = loadConfig();
      expect(config.team?.roleRouting).toBeDefined();
      // Validator preserves the user's key as-written; runtime/stage routing
      // must therefore resolve aliases from the stored raw map too.
      const r = config.team?.roleRouting as Record<string, unknown>;
      expect(r["reviewer"]).toEqual({ provider: "codex" });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported team.ops.defaultAgentType values", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-team-default-agent-type-"));
    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          team: { ops: { defaultAgentType: "executor" } },
        }),
      );
      process.chdir(tempDir);
      expect(() => loadConfig()).toThrow(/team\.ops\.defaultAgentType/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects unknown role with descriptive error", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-team-bad-role-"));
    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          team: { roleRouting: { "totally-fake-role": { provider: "qwen" } } },
        }),
      );
      process.chdir(tempDir);
      expect(() => loadConfig()).toThrow(/unknown role "totally-fake-role"/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("delegation routing deprecation warnings", () => {
  let saved: Record<string, string | undefined>;
  let originalCwd: string;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    saved = saveAndClear(ALL_KEYS);
    originalCwd = process.cwd();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    consoleWarnSpy.mockRestore();
    restore(saved);
  });

  it("warns when env delegation default provider is deprecated", () => {
    process.env.OMQ_DELEGATION_ROUTING_DEFAULT_PROVIDER = "gemini";

    loadConfig();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("delegationRouting to Codex/Gemini is deprecated"),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Use /team for Codex/Gemini CLI workers instead."),
    );
  });

  it("warns when project config uses deprecated delegation role provider", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omq-delegation-routing-warning-"));

    try {
      const qoderDir = join(tempDir, ".qoder");
      require("node:fs").mkdirSync(qoderDir, { recursive: true });
      writeFileSync(
        join(qoderDir, "omq.jsonc"),
        JSON.stringify({
          delegationRouting: {
            enabled: true,
            roles: {
              explore: {
                provider: "codex",
                tool: "Task",
              },
            },
          },
        }),
      );

      process.chdir(tempDir);
      loadConfig();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("delegationRouting to Codex/Gemini is deprecated"),
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
