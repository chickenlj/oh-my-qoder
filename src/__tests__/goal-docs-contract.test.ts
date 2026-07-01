import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");

const DOC_ROOTS = ["docs", "skills"] as const;

function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      files.push(...markdownFiles(fullPath));
    } else if (extname(entry.name) === ".md") {
      files.push(fullPath);
    }
  }

  return files;
}

function readMarkdownDocs(): Array<{ path: string; content: string }> {
  return DOC_ROOTS.flatMap((root) => markdownFiles(join(REPO_ROOT, root))).map(
    (file) => ({
      path: relative(REPO_ROOT, file),
      content: readFileSync(file, "utf-8"),
    }),
  );
}

function qoderGoalDocs() {
  return readMarkdownDocs().filter(({ content }) =>
    /Qoder CLI[\s\S]{0,80}\/goal|\/goal[\s\S]{0,80}Qoder CLI/i.test(
      content,
    ),
  );
}

describe("Qoder CLI /goal docs contract", () => {
  it("does not use OpenAI or Codex documentation as authority for Qoder CLI /goal facts", () => {
    const violations = qoderGoalDocs().flatMap(({ path, content }) => {
      const paragraphs = content.split(/\n\s*\n/);
      return paragraphs
        .map((paragraph, index) => ({ paragraph, index }))
        .filter(({ paragraph }) =>
          /Qoder CLI[\s\S]*\/goal|\/goal[\s\S]*Qoder CLI/i.test(paragraph),
        )
        .filter(({ paragraph }) =>
          /OpenAI docs|OpenAI documentation|Codex docs|Codex documentation/i.test(
            paragraph,
          ),
        )
        .filter(
          ({ paragraph }) =>
            !/do not (?:cite|use) (?:OpenAI|Codex|OpenAI\/Codex)/i.test(
              paragraph,
            ),
        )
        .map(
          ({ index, paragraph }) =>
            `${path} paragraph ${index + 1}: ${paragraph.replace(/\s+/g, " ").trim()}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it("keeps Qoder CLI /goal evaluator limitations explicit and evidence-based", () => {
    const violations = qoderGoalDocs().flatMap(({ path, content }) => {
      const forbiddenClaims = [
        /evaluator\s+(?:can|will|does)\s+(?:independently\s+)?(?:run|execute)s?\s+commands/i,
        /evaluator\s+(?:can|will|does)\s+(?:independently\s+)?read\s+files/i,
        /evaluator\s+verifies\s+(?:hidden\s+)?filesystem\s+truth/i,
      ];

      return forbiddenClaims
        .filter((pattern) => pattern.test(content))
        .map(
          (pattern) => `${path}: matched forbidden evaluator claim ${pattern}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it("forbids warn-only loop conflict policy in Qoder CLI /goal docs", () => {
    const violations = qoderGoalDocs().flatMap(({ path, content }) => {
      const issues: string[] = [];

      if (/warn[- ]only|warn\s+and\s+proceed/i.test(content)) {
        issues.push(`${path}: contains warn-only conflict handling`);
      }

      if (/conflict[_ -]policy|loop authority|active loop/i.test(content)) {
        for (const requiredPolicy of [
          "refuse",
          "adopt_existing",
          "artifact_only",
        ]) {
          if (!content.includes(requiredPolicy)) {
            issues.push(`${path}: missing ${requiredPolicy} conflict policy`);
          }
        }
      }

      return issues;
    });

    expect(violations).toEqual([]);
  });
});
