import type { ReactNode } from 'react';

export interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps?: number[];
  variant?: 'horizontal' | 'vertical';
  size?: 'small' | 'medium' | 'large';
  showLabels?: boolean;
  showDescriptions?: boolean;
  onStepClick?: (stepIndex: number) => void;
  allowNavigation?: boolean;
  className?: string;
}

export function StepIndicator({
  steps,
  currentStep,
  completedSteps = [],
  variant = 'horizontal',
  size = 'medium',
  showLabels = true,
  showDescriptions = false,
  onStepClick,
  allowNavigation = false,
  className = '',
}: StepIndicatorProps) {
  const sizeClasses = {
    small: 'step-indicator--small',
    medium: 'step-indicator--medium',
    large: 'step-indicator--large',
  };

  const handleStepClick = (index: number) => {
    if (allowNavigation && onStepClick && (completedSteps.includes(index) || index === currentStep)) {
      onStepClick(index);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (allowNavigation && onStepClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleStepClick(index);
    }
  };

  const getStepStatus = (index: number): 'completed' | 'current' | 'upcoming' => {
    if (completedSteps.includes(index) || index < currentStep) return 'completed';
    if (index === currentStep) return 'current';
    return 'upcoming';
  };

  return (
    <div
      className={`step-indicator step-indicator--${variant} ${sizeClasses[size]} ${className}`}
      role="navigation"
      aria-label="Progress steps"
    >
      <ol className="step-indicator__list" role="list">
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          const isClickable = allowNavigation && (status === 'completed' || status === 'current');

          return (
            <li
              key={step.id}
              className={`step-indicator__item step-indicator__item--${status}`}
              aria-current={status === 'current' ? 'step' : undefined}
            >
              <div
                className={`step-indicator__marker ${isClickable ? 'step-indicator__marker--clickable' : ''}`}
                onClick={() => handleStepClick(index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                aria-label={`Step ${index + 1}: ${step.label}${status === 'completed' ? ' (completed)' : status === 'current' ? ' (current)' : ''}`}
              >
                {status === 'completed' ? (
                  <svg
                    className="step-indicator__check"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span className="step-indicator__number" aria-hidden="true">
                    {index + 1}
                  </span>
                )}
              </div>
              {showLabels && (
                <div className="step-indicator__content">
                  <span className="step-indicator__label">{step.label}</span>
                  {showDescriptions && step.description && (
                    <span className="step-indicator__description">{step.description}</span>
                  )}
                </div>
              )}
              {index < steps.length - 1 && variant === 'horizontal' && (
                <div
                  className={`step-indicator__connector step-indicator__connector--${status === 'completed' ? 'completed' : 'upcoming'}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      <style>{`
        .step-indicator {
          width: 100%;
        }

        .step-indicator__list {
          display: flex;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        /* Horizontal variant */
        .step-indicator--horizontal .step-indicator__list {
          flex-direction: row;
          justify-content: space-between;
        }

        .step-indicator--horizontal .step-indicator__item {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          position: relative;
        }

        .step-indicator--horizontal .step-indicator__connector {
          position: absolute;
          top: 16px;
          left: 50%;
          width: 100%;
          height: 2px;
          background: var(--border-primary, #e5e7eb);
          z-index: 0;
        }

        .step-indicator--horizontal .step-indicator__connector--completed {
          background: var(--color-primary, #3b82f6);
        }

        /* Vertical variant */
        .step-indicator--vertical .step-indicator__list {
          flex-direction: column;
        }

        .step-indicator--vertical .step-indicator__item {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 12px;
          padding-bottom: 24px;
          position: relative;
        }

        .step-indicator--vertical .step-indicator__item:last-child {
          padding-bottom: 0;
        }

        .step-indicator--vertical .step-indicator__item:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 16px;
          top: 32px;
          width: 2px;
          height: calc(100% - 32px);
          background: var(--border-primary, #e5e7eb);
        }

        .step-indicator--vertical .step-indicator__item--completed:not(:last-child)::after {
          background: var(--color-primary, #3b82f6);
        }

        /* Marker styles */
        .step-indicator__marker {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 14px;
          z-index: 1;
          background: var(--bg-primary, #ffffff);
          border: 2px solid var(--border-primary, #e5e7eb);
          color: var(--text-tertiary, #9ca3af);
          transition: all 0.2s;
        }

        .step-indicator__marker--clickable {
          cursor: pointer;
        }

        .step-indicator__marker--clickable:hover {
          border-color: var(--color-primary, #3b82f6);
        }

        .step-indicator__marker--clickable:focus-visible {
          outline: 2px solid var(--color-primary, #3b82f6);
          outline-offset: 2px;
        }

        .step-indicator__item--current .step-indicator__marker {
          background: var(--color-primary, #3b82f6);
          border-color: var(--color-primary, #3b82f6);
          color: white;
        }

        .step-indicator__item--completed .step-indicator__marker {
          background: var(--color-primary, #3b82f6);
          border-color: var(--color-primary, #3b82f6);
          color: white;
        }

        .step-indicator__check {
          width: 16px;
          height: 16px;
        }

        .step-indicator__number {
          font-variant-numeric: tabular-nums;
        }

        /* Content styles */
        .step-indicator__content {
          display: flex;
          flex-direction: column;
          text-align: center;
          margin-top: 8px;
        }

        .step-indicator--vertical .step-indicator__content {
          text-align: left;
          margin-top: 0;
          padding-top: 4px;
        }

        .step-indicator__label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-tertiary, #9ca3af);
        }

        .step-indicator__item--current .step-indicator__label {
          color: var(--color-primary, #3b82f6);
        }

        .step-indicator__item--completed .step-indicator__label {
          color: var(--text-primary, #111827);
        }

        .step-indicator__description {
          font-size: 12px;
          color: var(--text-tertiary, #9ca3af);
          margin-top: 2px;
        }

        /* Size variants */
        .step-indicator--small .step-indicator__marker {
          width: 24px;
          height: 24px;
          font-size: 12px;
        }

        .step-indicator--small .step-indicator__check {
          width: 12px;
          height: 12px;
        }

        .step-indicator--small .step-indicator__label {
          font-size: 11px;
        }

        .step-indicator--small .step-indicator--horizontal .step-indicator__connector {
          top: 12px;
        }

        .step-indicator--large .step-indicator__marker {
          width: 40px;
          height: 40px;
          font-size: 16px;
        }

        .step-indicator--large .step-indicator__check {
          width: 20px;
          height: 20px;
        }

        .step-indicator--large .step-indicator__label {
          font-size: 14px;
        }

        .step-indicator--large .step-indicator--horizontal .step-indicator__connector {
          top: 20px;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .step-indicator--horizontal .step-indicator__label {
            font-size: 10px;
          }

          .step-indicator--horizontal .step-indicator__description {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * ProgressBar - A simple linear progress bar
 */
interface ProgressBarProps {
  progress: number;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
  color?: string;
  label?: ReactNode;
  className?: string;
}

export function ProgressBar({
  progress,
  showLabel = true,
  size = 'medium',
  color,
  label,
  className = '',
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={`progress-bar progress-bar--${size} ${className}`}>
      <div
        className="progress-bar__track"
        role="progressbar"
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === 'string' ? label : `Progress: ${clampedProgress}%`}
      >
        <div
          className="progress-bar__fill"
          style={{
            width: `${clampedProgress}%`,
            backgroundColor: color || undefined
          }}
        />
      </div>
      {showLabel && (
        <span className="progress-bar__label" aria-hidden="true">
          {label || `${Math.round(clampedProgress)}%`}
        </span>
      )}

      <style>{`
        .progress-bar {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .progress-bar__track {
          flex: 1;
          background: var(--bg-tertiary, #f3f4f6);
          border-radius: 9999px;
          overflow: hidden;
        }

        .progress-bar--small .progress-bar__track {
          height: 4px;
        }

        .progress-bar--medium .progress-bar__track {
          height: 8px;
        }

        .progress-bar--large .progress-bar__track {
          height: 12px;
        }

        .progress-bar__fill {
          height: 100%;
          background: var(--color-primary, #3b82f6);
          border-radius: 9999px;
          transition: width 0.3s ease;
        }

        .progress-bar__label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary, #6b7280);
          min-width: 40px;
          text-align: right;
        }
      `}</style>
    </div>
  );
}

export default StepIndicator;
