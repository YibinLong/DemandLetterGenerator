/**
 * Tests for SkipLink accessibility component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkipLink } from './SkipLink';

describe('SkipLink', () => {
  beforeEach(() => {
    // Create a target element for the skip link
    const target = document.createElement('main');
    target.id = 'main-content';
    target.tabIndex = -1;
    document.body.appendChild(target);
  });

  afterEach(() => {
    const target = document.getElementById('main-content');
    if (target) {
      document.body.removeChild(target);
    }
  });

  it('should render with default text', () => {
    render(<SkipLink targetId="main-content" />);
    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
  });

  it('should render with custom text', () => {
    render(<SkipLink targetId="main-content">Skip navigation</SkipLink>);
    expect(screen.getByText('Skip navigation')).toBeInTheDocument();
  });

  it('should have correct href attribute', () => {
    render(<SkipLink targetId="main-content" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('should focus target element on click', () => {
    render(<SkipLink targetId="main-content" />);
    const link = screen.getByRole('link');
    const target = document.getElementById('main-content');

    // Mock scrollIntoView since it's not implemented in jsdom
    target!.scrollIntoView = vi.fn();
    target!.focus = vi.fn();

    fireEvent.click(link);

    expect(target!.focus).toHaveBeenCalled();
    expect(target!.scrollIntoView).toHaveBeenCalled();
  });

  it('should focus target element on Enter key', () => {
    render(<SkipLink targetId="main-content" />);
    const link = screen.getByRole('link');
    const target = document.getElementById('main-content');

    target!.scrollIntoView = vi.fn();
    target!.focus = vi.fn();

    fireEvent.keyDown(link, { key: 'Enter' });

    expect(target!.focus).toHaveBeenCalled();
  });

  it('should focus target element on Space key', () => {
    render(<SkipLink targetId="main-content" />);
    const link = screen.getByRole('link');
    const target = document.getElementById('main-content');

    target!.scrollIntoView = vi.fn();
    target!.focus = vi.fn();

    fireEvent.keyDown(link, { key: ' ' });

    expect(target!.focus).toHaveBeenCalled();
  });

  it('should be accessible via keyboard', () => {
    render(<SkipLink targetId="main-content" />);
    const link = screen.getByRole('link');

    // The skip link should be a link element
    expect(link.tagName).toBe('A');
  });
});
