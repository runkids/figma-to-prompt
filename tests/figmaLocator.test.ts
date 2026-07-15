import { describe, expect, it } from 'vitest';
import { buildFigmaNodeUrl, figmaNodeIdToUrlParam } from '../src/shared/figmaLocator';

describe('Figma MCP locators', () => {
  it('keeps colon-form IDs for API arguments but converts URL parameters to hyphens', () => {
    expect(figmaNodeIdToUrlParam('123:456')).toBe('123-456');
    expect(buildFigmaNodeUrl('file-key', '123:456')).toBe(
      'https://www.figma.com/design/file-key/figma-to-prompt-capture?node-id=123-456',
    );
  });

  it('normalizes a supplied source URL when only that locator is available', () => {
    expect(buildFigmaNodeUrl(
      null,
      '4:56',
      'https://www.figma.com/design/source-key/example?node-id=1-2',
    )).toBe('https://www.figma.com/design/source-key/example?node-id=4-56');
  });

  it('returns null for a local draft without a remote locator', () => {
    expect(buildFigmaNodeUrl(null, '1:2')).toBeNull();
  });
});
