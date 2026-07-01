/**
 * OMQ HUD - Model Element
 *
 * Renders the current model name.
 */

import { cyan } from '../colors.js';
import { truncateToWidth } from '../../utils/string-width.js';
import { DEFAULT_HUD_LABELS, type HudLabels, type ModelFormat } from '../types.js';

/**
 * Extract version from a model ID string.
 * E.g., 'qwen-max-0428' -> null (no embedded version)
 *       'qwen-plus-2025-04-28' -> null
 *       'qwen-turbo-latest' -> null
 *       'qwen-max-v2' -> '2'
 *       'qwen-plus 2.5' -> '2.5'
 */
function extractVersion(modelId: string): string | null {
  // Match hyphenated version patterns like max-v2, plus-v3
  const versionMatch = modelId.match(/(?:max|plus|turbo)-v(\d+(?:\.\d+)?)/i);
  if (versionMatch) return versionMatch[1];

  // Match display name patterns like "Max 2.5", "Plus 3.0"
  const displayMatch = modelId.match(/(?:max|plus|turbo)\s+(\d+(?:\.\d+)?)/i);
  if (displayMatch) return displayMatch[1];

  return null;
}

/**
 * Format model name for display.
 * Converts model IDs to friendly names based on the requested format.
 */
export function formatModelName(modelId: string | null | undefined, format: ModelFormat = 'short'): string | null {
  if (!modelId) return null;

  if (format === 'full') {
    return truncateToWidth(modelId, 40);
  }

  const id = modelId.toLowerCase();
  let shortName: string | null = null;

  if (id.includes('qwen-max') || id.includes('qwen_max')) shortName = 'Max';
  else if (id.includes('qwen-plus') || id.includes('qwen_plus')) shortName = 'Plus';
  else if (id.includes('qwen-turbo') || id.includes('qwen_turbo')) shortName = 'Turbo';

  if (!shortName) {
    // Return original if not recognized (CJK-aware truncation)
    return truncateToWidth(modelId, 20);
  }

  if (format === 'versioned') {
    const version = extractVersion(id);
    if (version) return `${shortName} ${version}`;
  }

  return shortName;
}

/**
 * Render model element.
 */
export function renderModel(
  modelId: string | null | undefined,
  format: ModelFormat = 'versioned',
  labels: Pick<HudLabels, 'model'> = DEFAULT_HUD_LABELS,
): string | null {
  const name = formatModelName(modelId, format);
  if (!name) return null;
  return cyan(`${labels.model}: ${name}`);
}
