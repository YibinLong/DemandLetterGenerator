import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';
import { StepIndicator, type Step as StepType } from './StepIndicator';
import { useLiveRegion } from './LiveRegion';

interface WizardStep extends StepType {
  content: ReactNode;
  validate?: () => boolean | Promise<boolean>;
  onEnter?: () => void | Promise<void>;
  onExit?: () => void | Promise<void>;
}

interface WizardContextValue {
  currentStep: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  nextStep: () => Promise<void>;
  prevStep: () => void;
  goToStep: (step: number) => Promise<void>;
  isNavigating: boolean;
  canProceed: boolean;
  setCanProceed: (value: boolean) => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a Wizard');
  }
  return context;
}

interface WizardProps {
  steps: WizardStep[];
  onComplete?: () => void;
  onCancel?: () => void;
  initialStep?: number;
  showStepIndicator?: boolean;
  stepIndicatorVariant?: 'horizontal' | 'vertical';
  allowStepNavigation?: boolean;
  title?: string;
  cancelLabel?: string;
  backLabel?: string;
  nextLabel?: string;
  completeLabel?: string;
  className?: string;
}

export function Wizard({
  steps,
  onComplete,
  onCancel,
  initialStep = 0,
  showStepIndicator = true,
  stepIndicatorVariant = 'horizontal',
  allowStepNavigation = false,
  title,
  cancelLabel = 'Cancel',
  backLabel = 'Back',
  nextLabel = 'Continue',
  completeLabel = 'Complete',
  className = '',
}: WizardProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isNavigating, setIsNavigating] = useState(false);
  const [canProceed, setCanProceed] = useState(true);

  // Try to get live region for announcements, but don't fail if not available
  let announce: ((message: string, priority?: 'polite' | 'assertive') => void) | undefined;
  try {
    const liveRegion = useLiveRegion();
    announce = liveRegion.announce;
  } catch {
    // Live region not available, skip announcements
  }

  const totalSteps = steps.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const currentStepData = steps[currentStep];

  const validateStep = useCallback(async () => {
    if (!currentStepData.validate) return true;
    return await currentStepData.validate();
  }, [currentStepData]);

  const nextStep = useCallback(async () => {
    if (isNavigating) return;

    setIsNavigating(true);
    try {
      const isValid = await validateStep();
      if (!isValid) {
        setIsNavigating(false);
        return;
      }

      // Call onExit for current step
      if (currentStepData.onExit) {
        await currentStepData.onExit();
      }

      if (isLastStep) {
        onComplete?.();
      } else {
        const nextIndex = currentStep + 1;
        setCompletedSteps((prev) => [...new Set([...prev, currentStep])]);
        setCurrentStep(nextIndex);

        // Call onEnter for next step
        if (steps[nextIndex].onEnter) {
          await steps[nextIndex].onEnter();
        }

        announce?.(`Step ${nextIndex + 1} of ${totalSteps}: ${steps[nextIndex].label}`, 'polite');
      }
    } finally {
      setIsNavigating(false);
    }
  }, [
    isNavigating,
    validateStep,
    currentStepData,
    isLastStep,
    onComplete,
    currentStep,
    steps,
    totalSteps,
    announce,
  ]);

  const prevStep = useCallback(() => {
    if (isNavigating || isFirstStep) return;

    const prevIndex = currentStep - 1;
    setCurrentStep(prevIndex);
    announce?.(`Step ${prevIndex + 1} of ${totalSteps}: ${steps[prevIndex].label}`, 'polite');
  }, [isNavigating, isFirstStep, currentStep, announce, totalSteps, steps]);

  const goToStep = useCallback(
    async (step: number) => {
      if (isNavigating || step < 0 || step >= totalSteps) return;
      if (!allowStepNavigation && !completedSteps.includes(step) && step !== currentStep) return;

      setIsNavigating(true);
      try {
        // Only validate if going forward
        if (step > currentStep) {
          const isValid = await validateStep();
          if (!isValid) {
            setIsNavigating(false);
            return;
          }
        }

        if (currentStepData.onExit) {
          await currentStepData.onExit();
        }

        setCurrentStep(step);

        if (steps[step].onEnter) {
          await steps[step].onEnter();
        }

        announce?.(`Step ${step + 1} of ${totalSteps}: ${steps[step].label}`, 'polite');
      } finally {
        setIsNavigating(false);
      }
    },
    [
      isNavigating,
      totalSteps,
      allowStepNavigation,
      completedSteps,
      currentStep,
      validateStep,
      currentStepData,
      steps,
      announce,
    ]
  );

  const stepIndicatorSteps: StepType[] = steps.map((step) => ({
    id: step.id,
    label: step.label,
    description: step.description,
  }));

  return (
    <WizardContext.Provider
      value={{
        currentStep,
        totalSteps,
        isFirstStep,
        isLastStep,
        nextStep,
        prevStep,
        goToStep,
        isNavigating,
        canProceed,
        setCanProceed,
      }}
    >
      <div className={`wizard ${className}`}>
        {title && (
          <div className="wizard__header">
            <h2 className="wizard__title">{title}</h2>
          </div>
        )}

        {showStepIndicator && (
          <div className="wizard__steps">
            <StepIndicator
              steps={stepIndicatorSteps}
              currentStep={currentStep}
              completedSteps={completedSteps}
              variant={stepIndicatorVariant}
              showLabels
              allowNavigation={allowStepNavigation}
              onStepClick={allowStepNavigation ? goToStep : undefined}
            />
          </div>
        )}

        <div className="wizard__content" role="region" aria-label={`Step ${currentStep + 1}: ${currentStepData.label}`}>
          <div className="wizard__step-header">
            <h3 className="wizard__step-title">{currentStepData.label}</h3>
            {currentStepData.description && (
              <p className="wizard__step-description">{currentStepData.description}</p>
            )}
          </div>
          <div className="wizard__step-content">{currentStepData.content}</div>
        </div>

        <div className="wizard__footer">
          <button
            type="button"
            className="wizard__btn wizard__btn--cancel"
            onClick={onCancel}
            disabled={isNavigating}
          >
            {cancelLabel}
          </button>

          <div className="wizard__footer-right">
            {!isFirstStep && (
              <button
                type="button"
                className="wizard__btn wizard__btn--secondary"
                onClick={prevStep}
                disabled={isNavigating}
              >
                {backLabel}
              </button>
            )}

            <button
              type="button"
              className="wizard__btn wizard__btn--primary"
              onClick={nextStep}
              disabled={isNavigating || !canProceed}
            >
              {isNavigating ? (
                <span className="wizard__btn-loading">Processing...</span>
              ) : isLastStep ? (
                completeLabel
              ) : (
                nextLabel
              )}
            </button>
          </div>
        </div>

        <style>{`
          .wizard {
            display: flex;
            flex-direction: column;
            background: var(--bg-primary, #ffffff);
            border-radius: 12px;
            border: 1px solid var(--border-primary, #e5e7eb);
            overflow: hidden;
          }

          .wizard__header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-primary, #e5e7eb);
          }

          .wizard__title {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            color: var(--text-primary, #111827);
          }

          .wizard__steps {
            padding: 24px;
            border-bottom: 1px solid var(--border-primary, #e5e7eb);
            background: var(--bg-secondary, #f9fafb);
          }

          .wizard__content {
            flex: 1;
            padding: 24px;
            min-height: 300px;
          }

          .wizard__step-header {
            margin-bottom: 24px;
          }

          .wizard__step-title {
            margin: 0 0 8px;
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary, #111827);
          }

          .wizard__step-description {
            margin: 0;
            font-size: 14px;
            color: var(--text-secondary, #6b7280);
          }

          .wizard__step-content {
            animation: wizardFadeIn 0.3s ease;
          }

          @keyframes wizardFadeIn {
            from {
              opacity: 0;
              transform: translateX(10px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          .wizard__footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 24px;
            border-top: 1px solid var(--border-primary, #e5e7eb);
            background: var(--bg-secondary, #f9fafb);
          }

          .wizard__footer-right {
            display: flex;
            gap: 12px;
          }

          .wizard__btn {
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 500;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .wizard__btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .wizard__btn--cancel {
            background: transparent;
            border: none;
            color: var(--text-tertiary, #9ca3af);
          }

          .wizard__btn--cancel:hover:not(:disabled) {
            color: var(--text-secondary, #6b7280);
          }

          .wizard__btn--secondary {
            background: white;
            border: 1px solid var(--border-primary, #e5e7eb);
            color: var(--text-primary, #111827);
          }

          .wizard__btn--secondary:hover:not(:disabled) {
            background: var(--bg-secondary, #f9fafb);
            border-color: var(--text-tertiary, #9ca3af);
          }

          .wizard__btn--primary {
            background: var(--color-primary, #3b82f6);
            border: none;
            color: white;
            min-width: 120px;
            justify-content: center;
          }

          .wizard__btn--primary:hover:not(:disabled) {
            background: var(--color-primary-hover, #2563eb);
          }

          .wizard__btn-loading {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .wizard__btn-loading::before {
            content: '';
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: wizardSpinner 0.8s linear infinite;
          }

          @keyframes wizardSpinner {
            to { transform: rotate(360deg); }
          }

          /* Responsive */
          @media (max-width: 640px) {
            .wizard__content {
              padding: 16px;
            }

            .wizard__footer {
              flex-direction: column;
              gap: 12px;
            }

            .wizard__btn--cancel {
              order: 1;
            }

            .wizard__footer-right {
              width: 100%;
            }

            .wizard__btn--secondary,
            .wizard__btn--primary {
              flex: 1;
            }
          }
        `}</style>
      </div>
    </WizardContext.Provider>
  );
}

/**
 * WizardStep - Component for defining step content
 * This is a utility component for cleaner JSX syntax
 */
export function WizardStepContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default Wizard;
