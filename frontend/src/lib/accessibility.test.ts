/**
 * Tests for accessibility utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  getLuminance,
  getContrastRatio,
  meetsContrastRequirements,
  generateId,
  getInteractiveProps,
  CONTRAST_RATIOS,
} from './accessibility';

describe('accessibility utilities', () => {
  describe('hexToRgb', () => {
    it('should convert hex colors to RGB', () => {
      expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
      expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
      expect(hexToRgb('#3b82f6')).toEqual([59, 130, 246]);
    });

    it('should handle hex without hash', () => {
      expect(hexToRgb('ffffff')).toEqual([255, 255, 255]);
    });

    it('should return null for invalid hex', () => {
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#12')).toBeNull();
    });
  });

  describe('getLuminance', () => {
    it('should calculate relative luminance correctly', () => {
      // White should have luminance close to 1
      expect(getLuminance(255, 255, 255)).toBeCloseTo(1, 1);

      // Black should have luminance of 0
      expect(getLuminance(0, 0, 0)).toBeCloseTo(0, 5);
    });
  });

  describe('getContrastRatio', () => {
    it('should calculate contrast ratio between colors', () => {
      // Black and white should have maximum contrast (21:1)
      const ratio = getContrastRatio([255, 255, 255], [0, 0, 0]);
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('should return 1 for identical colors', () => {
      const ratio = getContrastRatio([128, 128, 128], [128, 128, 128]);
      expect(ratio).toBeCloseTo(1, 5);
    });
  });

  describe('meetsContrastRequirements', () => {
    it('should return true for high contrast colors', () => {
      // Black on white meets all requirements
      expect(meetsContrastRequirements('#000000', '#ffffff')).toBe(true);
      expect(meetsContrastRequirements('#000000', '#ffffff', true)).toBe(true);
    });

    it('should handle low contrast correctly', () => {
      // Light gray on white doesn't meet normal text requirements
      expect(meetsContrastRequirements('#d0d0d0', '#ffffff')).toBe(false);
    });

    it('should have different thresholds for large text', () => {
      // Some colors might pass for large text but not normal text
      expect(CONTRAST_RATIOS.normalText).toBe(4.5);
      expect(CONTRAST_RATIOS.largeText).toBe(3);
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should use custom prefix', () => {
      const id = generateId('test');
      expect(id.startsWith('test-')).toBe(true);
    });
  });

  describe('getInteractiveProps', () => {
    it('should return correct props for interactive elements', () => {
      const onClick = () => {};
      const props = getInteractiveProps(onClick, 'Click me');

      expect(props.role).toBe('button');
      expect(props.tabIndex).toBe(0);
      expect(props.onClick).toBe(onClick);
      expect(props['aria-label']).toBe('Click me');
    });

    it('should handle keydown events', () => {
      let clicked = false;
      const onClick = () => { clicked = true; };
      const props = getInteractiveProps(onClick);

      // Simulate Enter key
      const enterEvent = { key: 'Enter', preventDefault: () => {} } as React.KeyboardEvent;
      props.onKeyDown(enterEvent);
      expect(clicked).toBe(true);

      // Reset and test Space key
      clicked = false;
      const spaceEvent = { key: ' ', preventDefault: () => {} } as React.KeyboardEvent;
      props.onKeyDown(spaceEvent);
      expect(clicked).toBe(true);
    });

    it('should not include aria-label if not provided', () => {
      const props = getInteractiveProps(() => {});
      expect(props['aria-label']).toBeUndefined();
    });
  });

  describe('CONTRAST_RATIOS', () => {
    it('should have correct WCAG 2.1 AA values', () => {
      expect(CONTRAST_RATIOS.normalText).toBe(4.5);
      expect(CONTRAST_RATIOS.largeText).toBe(3);
      expect(CONTRAST_RATIOS.uiComponents).toBe(3);
    });
  });
});
