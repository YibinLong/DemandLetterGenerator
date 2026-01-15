// Change tracking library tests
import { describe, it, expect } from 'vitest';
import { computeDiff, diffToHtml, getDiffStats } from './change-tracking';
import type { DiffSegment } from './change-tracking';

describe('Change Tracking Library', () => {
  describe('computeDiff', () => {
    it('should detect insertions', () => {
      const oldText = 'Hello world';
      const newText = 'Hello beautiful world';
      const diff = computeDiff(oldText, newText);

      const hasInsertion = diff.some(
        (segment) => segment.type === 'insert' && segment.text.includes('beautiful')
      );
      expect(hasInsertion).toBe(true);
    });

    it('should detect deletions', () => {
      const oldText = 'Hello beautiful world';
      const newText = 'Hello world';
      const diff = computeDiff(oldText, newText);

      const hasDeletion = diff.some(
        (segment) => segment.type === 'delete' && segment.text.includes('beautiful')
      );
      expect(hasDeletion).toBe(true);
    });

    it('should handle identical text', () => {
      const text = 'Hello world';
      const diff = computeDiff(text, text);

      const allEqual = diff.every((segment) => segment.type === 'equal');
      expect(allEqual).toBe(true);
    });

    it('should handle empty strings', () => {
      expect(() => computeDiff('', '')).not.toThrow();
      expect(() => computeDiff('text', '')).not.toThrow();
      expect(() => computeDiff('', 'text')).not.toThrow();
    });

    it('should handle multiple changes', () => {
      const oldText = 'The quick brown fox jumps';
      const newText = 'A slow brown fox leaps';
      const diff = computeDiff(oldText, newText);

      const hasInsert = diff.some((s) => s.type === 'insert');
      const hasDelete = diff.some((s) => s.type === 'delete');
      const hasEqual = diff.some((s) => s.type === 'equal');

      expect(hasInsert).toBe(true);
      expect(hasDelete).toBe(true);
      expect(hasEqual).toBe(true);
    });
  });

  describe('diffToHtml', () => {
    it('should render insertions with green background', () => {
      const diff: DiffSegment[] = [
        { type: 'equal', text: 'Hello ' },
        { type: 'insert', text: 'beautiful ' },
        { type: 'equal', text: 'world' },
      ];
      const html = diffToHtml(diff);

      expect(html).toContain('class="diff-insert"');
      expect(html).toContain('background-color: #d4edda');
      expect(html).toContain('beautiful');
    });

    it('should render deletions with red background and strikethrough', () => {
      const diff: DiffSegment[] = [
        { type: 'equal', text: 'Hello ' },
        { type: 'delete', text: 'ugly ' },
        { type: 'equal', text: 'world' },
      ];
      const html = diffToHtml(diff);

      expect(html).toContain('class="diff-delete"');
      expect(html).toContain('background-color: #f8d7da');
      expect(html).toContain('text-decoration: line-through');
      expect(html).toContain('ugly');
    });

    it('should escape HTML in text', () => {
      const diff: DiffSegment[] = [{ type: 'insert', text: '<script>alert("xss")</script>' }];
      const html = diffToHtml(diff);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should handle empty diff', () => {
      const html = diffToHtml([]);
      expect(html).toBe('');
    });
  });

  describe('getDiffStats', () => {
    it('should count insertions', () => {
      const diff: DiffSegment[] = [
        { type: 'equal', text: 'Hello ' },
        { type: 'insert', text: 'beautiful amazing ' },
        { type: 'equal', text: 'world' },
      ];
      const stats = getDiffStats(diff);

      expect(stats.insertions).toBe(2); // 'beautiful' and 'amazing'
      expect(stats.deletions).toBe(0);
    });

    it('should count deletions', () => {
      const diff: DiffSegment[] = [
        { type: 'equal', text: 'Hello ' },
        { type: 'delete', text: 'ugly terrible ' },
        { type: 'equal', text: 'world' },
      ];
      const stats = getDiffStats(diff);

      expect(stats.deletions).toBe(2); // 'ugly' and 'terrible'
      expect(stats.insertions).toBe(0);
    });

    it('should count unchanged words', () => {
      const diff: DiffSegment[] = [
        { type: 'equal', text: 'Hello world' },
      ];
      const stats = getDiffStats(diff);

      expect(stats.unchanged).toBe(2);
      expect(stats.insertions).toBe(0);
      expect(stats.deletions).toBe(0);
    });

    it('should handle mixed changes', () => {
      const diff: DiffSegment[] = [
        { type: 'equal', text: 'The ' },
        { type: 'delete', text: 'quick ' },
        { type: 'insert', text: 'slow ' },
        { type: 'equal', text: 'fox' },
      ];
      const stats = getDiffStats(diff);

      expect(stats.unchanged).toBe(2); // 'The' and 'fox'
      expect(stats.insertions).toBe(1); // 'slow'
      expect(stats.deletions).toBe(1); // 'quick'
    });

    it('should handle empty diff', () => {
      const stats = getDiffStats([]);

      expect(stats.insertions).toBe(0);
      expect(stats.deletions).toBe(0);
      expect(stats.unchanged).toBe(0);
    });
  });
});

describe('API Functions Exports', () => {
  it('should export all API functions', async () => {
    const module = await import('./change-tracking');

    // Change functions
    expect(typeof module.getChanges).toBe('function');
    expect(typeof module.createChange).toBe('function');
    expect(typeof module.reviewChange).toBe('function');
    expect(typeof module.bulkReviewChanges).toBe('function');
    expect(typeof module.deleteChange).toBe('function');

    // Comment functions
    expect(typeof module.getComments).toBe('function');
    expect(typeof module.createComment).toBe('function');
    expect(typeof module.updateComment).toBe('function');
    expect(typeof module.resolveComment).toBe('function');
    expect(typeof module.deleteComment).toBe('function');

    // Version comparison
    expect(typeof module.compareVersions).toBe('function');

    // Diff utilities
    expect(typeof module.computeDiff).toBe('function');
    expect(typeof module.diffToHtml).toBe('function');
    expect(typeof module.getDiffStats).toBe('function');
  });
});
