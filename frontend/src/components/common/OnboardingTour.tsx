import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap, useEscapeKey } from '../../lib/accessibility';

export interface TourStep {
  id: string;
  target?: string; // CSS selector for the target element
  title: string;
  content: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  highlightPadding?: number;
  disableInteraction?: boolean;
  nextLabel?: string;
  prevLabel?: string;
  skipLabel?: string;
}

interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  startTour: (steps: TourStep[]) => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  markTourComplete: (tourId: string) => void;
  isTourComplete: (tourId: string) => boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}

interface TourProviderProps {
  children: ReactNode;
  storageKey?: string;
}

export function TourProvider({ children, storageKey = 'completed-tours' }: TourProviderProps) {
  const [isActive, setIsActive] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedTours, setCompletedTours] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  });

  const startTour = useCallback((tourSteps: TourStep[]) => {
    if (tourSteps.length === 0) return;
    setSteps(tourSteps);
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const endTour = useCallback(() => {
    setIsActive(false);
    setSteps([]);
    setCurrentStep(0);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      endTour();
    }
  }, [currentStep, steps.length, endTour]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback(
    (step: number) => {
      if (step >= 0 && step < steps.length) {
        setCurrentStep(step);
      }
    },
    [steps.length]
  );

  const markTourComplete = useCallback(
    (tourId: string) => {
      const updated = [...new Set([...completedTours, tourId])];
      setCompletedTours(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    },
    [completedTours, storageKey]
  );

  const isTourComplete = useCallback(
    (tourId: string) => completedTours.includes(tourId),
    [completedTours]
  );

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStep,
        totalSteps: steps.length,
        startTour,
        endTour,
        nextStep,
        prevStep,
        goToStep,
        markTourComplete,
        isTourComplete,
      }}
    >
      {children}
      {isActive && steps.length > 0 && (
        <TourOverlay step={steps[currentStep]} stepNumber={currentStep} totalSteps={steps.length} />
      )}
    </TourContext.Provider>
  );
}

interface TourOverlayProps {
  step: TourStep;
  stepNumber: number;
  totalSteps: number;
}

function TourOverlay({ step, stepNumber, totalSteps }: TourOverlayProps) {
  const { endTour, nextStep, prevStep } = useTour();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState({ top: 0, left: 0 });
  const dialogRef = useFocusTrap<HTMLDivElement>(true);

  useEscapeKey(endTour, true);

  // Find and track target element
  useEffect(() => {
    if (!step.target) {
      setTargetRect(null);
      return;
    }

    const updateTargetRect = () => {
      const element = document.querySelector(step.target!);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
      }
    };

    updateTargetRect();

    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [step.target]);

  // Calculate tooltip position
  useEffect(() => {
    if (!targetRect && step.placement !== 'center') return;

    const tooltipWidth = 320;
    const tooltipHeight = 200; // Approximate
    const spacing = 16;
    const padding = step.highlightPadding || 8;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    if (!targetRect || step.placement === 'center') {
      // Center in viewport
      top = (viewportHeight - tooltipHeight) / 2;
      left = (viewportWidth - tooltipWidth) / 2;
    } else {
      const placement = step.placement || 'bottom';

      switch (placement) {
        case 'top':
          top = targetRect.top - padding - tooltipHeight - spacing;
          left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
          break;
        case 'bottom':
          top = targetRect.bottom + padding + spacing;
          left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
          break;
        case 'left':
          top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
          left = targetRect.left - padding - tooltipWidth - spacing;
          break;
        case 'right':
          top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
          left = targetRect.right + padding + spacing;
          break;
      }

      // Constrain to viewport
      left = Math.max(16, Math.min(left, viewportWidth - tooltipWidth - 16));
      top = Math.max(16, Math.min(top, viewportHeight - tooltipHeight - 16));
    }

    setTooltipCoords({ top, left });
  }, [targetRect, step.placement, step.highlightPadding]);

  const isFirstStep = stepNumber === 0;
  const isLastStep = stepNumber === totalSteps - 1;
  const padding = step.highlightPadding || 8;

  return createPortal(
    <div className="tour-overlay" aria-modal="true" role="dialog" aria-label={`Tour step ${stepNumber + 1} of ${totalSteps}`}>
      {/* Overlay with cutout */}
      <div className="tour-backdrop">
        {targetRect && (
          <div
            className="tour-spotlight"
            style={{
              top: targetRect.top - padding,
              left: targetRect.left - padding,
              width: targetRect.width + padding * 2,
              height: targetRect.height + padding * 2,
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      <div
        ref={dialogRef}
        className="tour-tooltip"
        style={{
          top: tooltipCoords.top,
          left: tooltipCoords.left,
        }}
      >
        <div className="tour-tooltip__header">
          <h3 className="tour-tooltip__title">{step.title}</h3>
          <button
            type="button"
            className="tour-tooltip__close"
            onClick={endTour}
            aria-label="Close tour"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="tour-tooltip__content">{step.content}</div>

        <div className="tour-tooltip__footer">
          <div className="tour-tooltip__progress">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`tour-tooltip__dot ${i === stepNumber ? 'tour-tooltip__dot--active' : ''} ${i < stepNumber ? 'tour-tooltip__dot--completed' : ''}`}
                aria-hidden="true"
              />
            ))}
          </div>

          <div className="tour-tooltip__actions">
            {!isFirstStep && (
              <button type="button" className="tour-tooltip__btn tour-tooltip__btn--secondary" onClick={prevStep}>
                {step.prevLabel || 'Back'}
              </button>
            )}
            <button type="button" className="tour-tooltip__btn tour-tooltip__btn--primary" onClick={nextStep}>
              {isLastStep ? 'Finish' : step.nextLabel || 'Next'}
            </button>
          </div>
        </div>

        <span className="tour-tooltip__step-indicator" aria-live="polite">
          Step {stepNumber + 1} of {totalSteps}
        </span>
      </div>

      <style>{`
        .tour-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
        }

        .tour-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          transition: opacity 0.2s;
        }

        .tour-spotlight {
          position: fixed;
          border-radius: 8px;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
          pointer-events: none;
          transition: all 0.3s ease;
        }

        .tour-tooltip {
          position: fixed;
          width: 320px;
          max-width: calc(100vw - 32px);
          background: var(--bg-primary, #ffffff);
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
          animation: tourSlideIn 0.3s ease;
          z-index: 10001;
        }

        @keyframes tourSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .tour-tooltip__header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 16px 16px 0;
        }

        .tour-tooltip__title {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .tour-tooltip__close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 6px;
          color: var(--text-tertiary, #9ca3af);
          cursor: pointer;
          transition: all 0.15s;
        }

        .tour-tooltip__close:hover {
          background: var(--bg-secondary, #f3f4f6);
          color: var(--text-primary, #111827);
        }

        .tour-tooltip__content {
          padding: 12px 16px 16px;
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-secondary, #6b7280);
        }

        .tour-tooltip__footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-top: 1px solid var(--border-primary, #e5e7eb);
        }

        .tour-tooltip__progress {
          display: flex;
          gap: 6px;
        }

        .tour-tooltip__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--border-primary, #e5e7eb);
          transition: all 0.2s;
        }

        .tour-tooltip__dot--active {
          background: var(--color-primary, #3b82f6);
          transform: scale(1.25);
        }

        .tour-tooltip__dot--completed {
          background: var(--color-primary, #3b82f6);
        }

        .tour-tooltip__actions {
          display: flex;
          gap: 8px;
        }

        .tour-tooltip__btn {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .tour-tooltip__btn--primary {
          background: var(--color-primary, #3b82f6);
          color: white;
          border: none;
        }

        .tour-tooltip__btn--primary:hover {
          background: var(--color-primary-hover, #2563eb);
        }

        .tour-tooltip__btn--secondary {
          background: transparent;
          color: var(--text-secondary, #6b7280);
          border: 1px solid var(--border-primary, #e5e7eb);
        }

        .tour-tooltip__btn--secondary:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .tour-tooltip__step-indicator {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        /* Dark theme */
        :root.dark .tour-tooltip,
        [data-theme='dark'] .tour-tooltip {
          background: var(--bg-primary, #1f2937);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }
      `}</style>
    </div>,
    document.body
  );
}

/**
 * OnboardingTour - Pre-configured onboarding tour for new users
 */
export const ONBOARDING_STEPS: TourStep[] = [
  {
    id: 'welcome',
    placement: 'center',
    title: 'Welcome to Demand Letter Generator!',
    content: (
      <>
        <p>Let's take a quick tour to help you get started with creating AI-powered demand letters.</p>
        <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-tertiary)' }}>
          This tour will only take about a minute.
        </p>
      </>
    ),
    nextLabel: "Let's Go!",
  },
  {
    id: 'dashboard',
    target: '.stats-grid',
    placement: 'bottom',
    title: 'Your Dashboard',
    content: 'View your stats at a glance - see how many demand letters, documents, and templates you have.',
  },
  {
    id: 'quick-actions',
    target: '.actions-list',
    placement: 'left',
    title: 'Quick Actions',
    content: 'Use these shortcuts to quickly create new demand letters, upload documents, or manage templates.',
  },
  {
    id: 'navigation',
    target: '.sidebar',
    placement: 'right',
    title: 'Navigation',
    content: 'Use the sidebar to navigate between different sections of the application.',
  },
  {
    id: 'create-letter',
    target: '[href="/demand-letters/new"]',
    placement: 'bottom',
    title: 'Create Your First Letter',
    content: 'Click here to start creating your first AI-powered demand letter. You\'ll be guided through the process step by step.',
  },
  {
    id: 'complete',
    placement: 'center',
    title: "You're All Set!",
    content: (
      <>
        <p>You're ready to start creating demand letters. Here are some tips:</p>
        <ul style={{ margin: '12px 0 0', paddingLeft: '20px' }}>
          <li>Upload your source documents first</li>
          <li>Create templates for consistency</li>
          <li>Use AI refinement for improvements</li>
        </ul>
      </>
    ),
    nextLabel: 'Get Started',
  },
];

export default TourProvider;
