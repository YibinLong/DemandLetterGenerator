// Vitest test setup file
import '@testing-library/jest-dom';

// Mock browser APIs that TipTap needs
class MockRange {
  setStart() {}
  setEnd() {}
  getBoundingClientRect() {
    return {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    };
  }
  getClientRects() {
    return {
      item: () => null,
      length: 0,
      [Symbol.iterator]: function* () {},
    };
  }
}

// Mock document.createRange
document.createRange = () => new MockRange() as unknown as Range;

// Mock getSelection
window.getSelection = () => ({
  addRange: () => {},
  removeAllRanges: () => {},
  getRangeAt: () => new MockRange(),
  anchorNode: null,
  anchorOffset: 0,
  focusNode: null,
  focusOffset: 0,
  isCollapsed: true,
  rangeCount: 0,
  type: 'None',
  collapse: () => {},
  collapseToEnd: () => {},
  collapseToStart: () => {},
  containsNode: () => false,
  deleteFromDocument: () => {},
  empty: () => {},
  extend: () => {},
  setBaseAndExtent: () => {},
  selectAllChildren: () => {},
  setPosition: () => {},
  toString: () => '',
} as unknown as Selection);

// Mock scrollIntoView
Element.prototype.scrollIntoView = () => {};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock elementFromPoint for ProseMirror
document.elementFromPoint = () => null;
