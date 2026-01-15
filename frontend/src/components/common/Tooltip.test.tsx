/**
 * Tests for Tooltip and HelpIcon components
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip, HelpIcon } from './Tooltip';

describe('Tooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render children without tooltip initially', () => {
    render(
      <Tooltip content="Tooltip content">
        <button>Hover me</button>
      </Tooltip>
    );

    expect(screen.getByText('Hover me')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('should show tooltip on mouse enter after delay', async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Tooltip content" delay={100}>
        <button>Hover me</button>
      </Tooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    // Should not show immediately
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    // Advance timer past delay
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Tooltip content')).toBeInTheDocument();
  });

  it('should hide tooltip on mouse leave', async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Tooltip content" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('should show tooltip on focus', async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Tooltip content" delay={0}>
        <button>Focus me</button>
      </Tooltip>
    );

    const trigger = screen.getByText('Focus me').parentElement!;
    fireEvent.focus(trigger);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('should hide tooltip on blur', async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Tooltip content" delay={0}>
        <button>Focus me</button>
      </Tooltip>
    );

    const trigger = screen.getByText('Focus me').parentElement!;
    fireEvent.focus(trigger);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(trigger);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('should not show tooltip when disabled', async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Tooltip content" delay={0} disabled>
        <button>Hover me</button>
      </Tooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('should set aria-describedby when tooltip is visible', async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Tooltip content" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;

    // Before showing tooltip
    expect(trigger).not.toHaveAttribute('aria-describedby');

    fireEvent.mouseEnter(trigger);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(trigger).toHaveAttribute('aria-describedby');

    const tooltipId = trigger.getAttribute('aria-describedby');
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveAttribute('id', tooltipId);
  });
});

describe('HelpIcon', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render help icon button', () => {
    render(<HelpIcon content="Help text" />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Help');
    expect(button).toHaveClass('help-icon');
  });

  it('should show tooltip with content on hover', async () => {
    vi.useFakeTimers();

    render(<HelpIcon content="This is helpful information" />);

    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button.parentElement!);

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('This is helpful information')).toBeInTheDocument();
  });

  it('should support different positions', () => {
    const { rerender } = render(<HelpIcon content="Help" position="top" />);

    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<HelpIcon content="Help" position="bottom" />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<HelpIcon content="Help" position="left" />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<HelpIcon content="Help" position="right" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<HelpIcon content="Help" className="custom-class" />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });
});
