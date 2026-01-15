/**
 * Tests for StepIndicator and ProgressBar components
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepIndicator, ProgressBar } from './StepIndicator';

const mockSteps = [
  { id: 'step1', label: 'Step 1', description: 'First step' },
  { id: 'step2', label: 'Step 2', description: 'Second step' },
  { id: 'step3', label: 'Step 3', description: 'Third step' },
];

describe('StepIndicator', () => {
  it('should render all steps', () => {
    render(<StepIndicator steps={mockSteps} currentStep={0} />);

    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByText('Step 3')).toBeInTheDocument();
  });

  it('should mark current step as active', () => {
    render(<StepIndicator steps={mockSteps} currentStep={1} />);

    const stepItems = screen.getAllByRole('listitem');
    expect(stepItems[1]).toHaveClass('step-indicator__item--current');
  });

  it('should mark completed steps', () => {
    render(<StepIndicator steps={mockSteps} currentStep={2} completedSteps={[0, 1]} />);

    const stepItems = screen.getAllByRole('listitem');
    expect(stepItems[0]).toHaveClass('step-indicator__item--completed');
    expect(stepItems[1]).toHaveClass('step-indicator__item--completed');
    expect(stepItems[2]).toHaveClass('step-indicator__item--current');
  });

  it('should have correct ARIA attributes', () => {
    render(<StepIndicator steps={mockSteps} currentStep={1} />);

    const navigation = screen.getByRole('navigation');
    expect(navigation).toHaveAttribute('aria-label', 'Progress steps');

    const currentStep = screen.getAllByRole('listitem')[1];
    expect(currentStep).toHaveAttribute('aria-current', 'step');
  });

  it('should call onStepClick when allowNavigation is true', () => {
    const handleStepClick = vi.fn();
    render(
      <StepIndicator
        steps={mockSteps}
        currentStep={2}
        completedSteps={[0, 1]}
        allowNavigation
        onStepClick={handleStepClick}
      />
    );

    // Click on a completed step
    const stepButtons = screen.getAllByRole('button');
    fireEvent.click(stepButtons[0]);

    expect(handleStepClick).toHaveBeenCalledWith(0);
  });

  it('should not call onStepClick when allowNavigation is false', () => {
    const handleStepClick = vi.fn();
    render(
      <StepIndicator
        steps={mockSteps}
        currentStep={2}
        completedSteps={[0, 1]}
        allowNavigation={false}
        onStepClick={handleStepClick}
      />
    );

    // Should not have any buttons
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('should support keyboard navigation', () => {
    const handleStepClick = vi.fn();
    render(
      <StepIndicator
        steps={mockSteps}
        currentStep={1}
        completedSteps={[0]}
        allowNavigation
        onStepClick={handleStepClick}
      />
    );

    const stepButtons = screen.getAllByRole('button');
    fireEvent.keyDown(stepButtons[0], { key: 'Enter' });

    expect(handleStepClick).toHaveBeenCalledWith(0);
  });

  it('should render in vertical variant', () => {
    render(<StepIndicator steps={mockSteps} currentStep={0} variant="vertical" />);

    const stepIndicator = screen.getByRole('navigation');
    expect(stepIndicator).toHaveClass('step-indicator--vertical');
  });

  it('should render in different sizes', () => {
    const { rerender } = render(
      <StepIndicator steps={mockSteps} currentStep={0} size="small" />
    );

    let stepIndicator = screen.getByRole('navigation');
    expect(stepIndicator).toHaveClass('step-indicator--small');

    rerender(<StepIndicator steps={mockSteps} currentStep={0} size="large" />);
    stepIndicator = screen.getByRole('navigation');
    expect(stepIndicator).toHaveClass('step-indicator--large');
  });

  it('should show descriptions when showDescriptions is true', () => {
    render(
      <StepIndicator steps={mockSteps} currentStep={0} showDescriptions />
    );

    expect(screen.getByText('First step')).toBeInTheDocument();
    expect(screen.getByText('Second step')).toBeInTheDocument();
  });
});

describe('ProgressBar', () => {
  it('should render with correct progress', () => {
    render(<ProgressBar progress={50} />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
  });

  it('should clamp progress to 0-100', () => {
    const { rerender } = render(<ProgressBar progress={150} />);

    let progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '100');

    rerender(<ProgressBar progress={-50} />);
    progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
  });

  it('should show default label with percentage', () => {
    render(<ProgressBar progress={75} />);

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('should show custom label', () => {
    render(<ProgressBar progress={50} label="Loading..." />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should hide label when showLabel is false', () => {
    render(<ProgressBar progress={50} showLabel={false} />);

    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });

  it('should have correct aria attributes', () => {
    render(<ProgressBar progress={60} label="Custom label" />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    expect(progressBar).toHaveAttribute('aria-label', 'Custom label');
  });

  it('should render in different sizes', () => {
    const { rerender } = render(<ProgressBar progress={50} size="small" />);

    let container = screen.getByRole('progressbar').parentElement;
    expect(container).toHaveClass('progress-bar--small');

    rerender(<ProgressBar progress={50} size="large" />);
    container = screen.getByRole('progressbar').parentElement;
    expect(container).toHaveClass('progress-bar--large');
  });
});
