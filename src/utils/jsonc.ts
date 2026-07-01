/**
 * Simple JSONC (JSON with Comments) parser
 *
 * Strips single-line (//) and multi-line (slash-star) comments from JSONC
 * before parsing with standard JSON.parse.
 */

/**
 * Parse JSONC content by stripping comments and parsing as JSON
 */
export function parseJsonc(content: string): unknown {
  const cleaned = stripJsoncComments(content);
  return JSON.parse(cleaned);
}

/**
 * Strip comments from JSONC content
 * Handles single-line (//) and multi-line comments
 */
export function stripJsoncComments(content: string): string {
  let result = '';
  let i = 0;

  while (i < content.length) {
    // Check for single-line comment
    if (content[i] === '/' && content[i + 1] === '/') {
      // Skip until end of line
      while (i < content.length && content[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Check for multi-line comment start
    if (content[i] === '/' && content[i + 1] === '*') {
      // Skip until end of comment
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    // Handle strings to avoid stripping comments inside strings
    if (content[i] === '"') {
      result += content[i];
      i++;
      while (i < content.length && content[i] !== '"') {
        if (content[i] === '\\') {
          result += content[i];
          i++;
          if (i < content.length) {
            result += content[i];
            i++;
          }
          continue;
        }
        result += content[i];
        i++;
      }
      if (i < content.length) {
        result += content[i];
        i++;
      }
      continue;
    }

    result += content[i];
    i++;
  }

  return result;
}
