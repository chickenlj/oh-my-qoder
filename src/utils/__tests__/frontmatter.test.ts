import { describe, it, expect } from 'vitest';
import { stripOptionalQuotes, parseFrontmatter, parseFrontmatterAliases } from '../frontmatter.js';

describe('stripOptionalQuotes', () => {
  it('strips double quotes', () => {
    expect(stripOptionalQuotes('"hello"')).toBe('hello');
  });

  it('strips single quotes', () => {
    expect(stripOptionalQuotes("'hello'")).toBe('hello');
  });

  it('trims whitespace before stripping', () => {
    expect(stripOptionalQuotes('  "hello"  ')).toBe('hello');
  });

  it('does not strip mismatched quotes', () => {
    expect(stripOptionalQuotes('"hello\'')).toBe('"hello\'');
  });

  it('returns unquoted strings as-is', () => {
    expect(stripOptionalQuotes('hello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(stripOptionalQuotes('')).toBe('');
  });

  it('handles string with only quotes', () => {
    expect(stripOptionalQuotes('""')).toBe('');
  });

  it('trims inner whitespace after stripping quotes', () => {
    expect(stripOptionalQuotes('" hello "')).toBe('hello');
  });
});

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const content = `---
name: my-skill
description: A test skill
---
Body content here`;
    const result = parseFrontmatter(content);
    expect(result.metadata).toEqual({
      name: 'my-skill',
      description: 'A test skill',
    });
    expect(result.body).toBe('Body content here');
  });

  it('returns empty metadata when no frontmatter', () => {
    const content = 'Just some plain text';
    const result = parseFrontmatter(content);
    expect(result.metadata).toEqual({});
    expect(result.body).toBe('Just some plain text');
  });

  it('handles quoted values', () => {
    const content = `---
name: "quoted-name"
aliases: 'single-quoted'
---
Body`;
    const result = parseFrontmatter(content);
    expect(result.metadata.name).toBe('quoted-name');
    expect(result.metadata.aliases).toBe('single-quoted');
  });

  it('handles values with colons', () => {
    const content = `---
url: https://example.com:8080/path
---
Body`;
    const result = parseFrontmatter(content);
    expect(result.metadata.url).toBe('https://example.com:8080/path');
  });

  it('skips lines without colons', () => {
    const content = `---
name: valid
this-has-no-value
another: valid-too
---
Body`;
    const result = parseFrontmatter(content);
    expect(result.metadata).toEqual({
      name: 'valid',
      another: 'valid-too',
    });
  });

  it('handles empty frontmatter', () => {
    const content = `---

---
Body`;
    const result = parseFrontmatter(content);
    expect(result.metadata).toEqual({});
    expect(result.body).toBe('Body');
  });

  it('handles Windows-style line endings', () => {
    const content = '---\r\nname: test\r\n---\r\nBody';
    const result = parseFrontmatter(content);
    expect(result.metadata.name).toBe('test');
    expect(result.body).toBe('Body');
  });

  it('handles empty body', () => {
    const content = `---
name: test
---
`;
    const result = parseFrontmatter(content);
    expect(result.metadata.name).toBe('test');
    expect(result.body).toBe('');
  });

  it('handles multiline body', () => {
    const content = `---
name: test
---
Line 1
Line 2
Line 3`;
    const result = parseFrontmatter(content);
    expect(result.body).toBe('Line 1\nLine 2\nLine 3');
  });
});

describe('parseFrontmatterAliases', () => {
  it('parses inline YAML list', () => {
    expect(parseFrontmatterAliases('[foo, bar, baz]')).toEqual(['foo', 'bar', 'baz']);
  });

  it('parses single value', () => {
    expect(parseFrontmatterAliases('my-alias')).toEqual(['my-alias']);
  });

  it('returns empty array for undefined', () => {
    expect(parseFrontmatterAliases(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseFrontmatterAliases('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseFrontmatterAliases('   ')).toEqual([]);
  });

  it('handles quoted items in list', () => {
    expect(parseFrontmatterAliases('["foo", \'bar\']')).toEqual(['foo', 'bar']);
  });

  it('handles empty list', () => {
    expect(parseFrontmatterAliases('[]')).toEqual([]);
  });

  it('handles list with whitespace-only items', () => {
    expect(parseFrontmatterAliases('[foo, , bar]')).toEqual(['foo', 'bar']);
  });

  it('strips quotes from single value', () => {
    expect(parseFrontmatterAliases('"my-alias"')).toEqual(['my-alias']);
  });

  it('handles list with spaces around items', () => {
    expect(parseFrontmatterAliases('[ foo , bar , baz ]')).toEqual(['foo', 'bar', 'baz']);
  });
});
