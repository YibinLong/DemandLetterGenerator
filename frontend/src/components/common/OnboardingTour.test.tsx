/**
 * Tests for OnboardingTour components
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TourProvider, useTour, ONBOARDING_STEPS } from './OnboardingTour';
import type { TourStep } from './OnboardingTour';

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Test component that uses the tour context
function TestComponent() {
  const { isActive, currentStep, totalSteps, startTour, endTour, nextStep, prevStep } = useTour();

  return (
    <div>
      <div data-testid="status">
        {isActive ? 'Tour Active' : 'Tour Inactive'}
      </div>
      <div data-testid="progress">
        Step {currentStep + 1} of {totalSteps}
      </div>
      <button
        onClick={() =>
          startTour([
            { id: 'step1', title: 'Step 1', content: 'First step content', placement: 'center' },
            { id: 'step2', title: 'Step 2', content: 'Second step content', placement: 'center' },
            { id: 'step3', title: 'Step 3', content: 'Third step content', placement: 'center' },
          ])
        }
      >
        Start Tour
      </button>
      <button onClick={endTour}>End Tour</button>
      <button onClick={nextStep}>Next</button>
      <button onClick={prevStep}>Previous</button>
    </div>
  );
}

describe('TourProvider', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should render children', () => {
    render(
      <TourProvider>
        <div data-testid="child">Child content</div>
      </TourProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should provide tour context', () => {
    render(
      <TourProvider>
        <TestComponent />
      </TourProvider>
    );

    expect(screen.getByTestId('status')).toHaveTextContent('Tour Inactive');
  });
});

describe('useTour', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should throw error when used outside TourProvider', () => {
    const originalError = console.error;
    console.error = () => {};

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useTour must be used within a TourProvider');

    console.error = originalError;
  });

  it('should start tour when startTour is called', async () => {
    render(
      <TourProvider>
        <TestComponent />
      </TourProvider>
    );

    expect(screen.getByTestId('status')).toHaveTextContent('Tour Inactive');

    fireEvent.click(screen.getByText('Start Tour'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('Tour Active');
    });
  });

  it('should show tour overlay when active', async () => {
    render(
      <TourProvider>
        <TestComponent />
      </TourProvider>
    );

    fireEvent.click(screen.getByText('Start Tour'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('First step content')).toBeInTheDocument();
  });

  it('should navigate to next step', async () => {
    render(
      <TourProvider>
        <TestComponent />
      </TourProvider>
    );

    fireEvent.click(screen.getByText('Start Tour'));

    await waitFor(() => {
      expect(screen.getByText('Step 1')).toBeInTheDocument();
    });

    // Click the Next button in the tour tooltip (not the test component's Next button)
    const nextButtons = screen.getAllByText('Next');
    // The tour tooltip's Next button should be the last one
    fireEvent.click(nextButtons[nextButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Step 2')).toBeInTheDocument();
    });
  });

  it('should navigate to previous step', async () => {
    render(
      <TourProvider>
        <TestComponent />
      </TourProvider>
    );

    fireEvent.click(screen.getByText('Start Tour'));

    await waitFor(() => {
      expect(screen.getByText('Step 1')).toBeInTheDocument();
    });

    // Go to step 2 - click the tour tooltip's Next button
    const nextButtons = screen.getAllByText('Next');
    fireEvent.click(nextButtons[nextButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Step 2')).toBeInTheDocument();
    });

    // Go back to step 1 - click the tour tooltip's Back button
    const backButtons = screen.getAllByText('Back');
    fireEvent.click(backButtons[backButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Step 1')).toBeInTheDocument();
    });
  });

  it('should end tour when last step is completed', async () => {
    render(
      <TourProvider>
        <TestComponent />
      </TourProvider>
    );

    fireEvent.click(screen.getByText('Start Tour'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Navigate through all steps using the tour tooltip's buttons
    let nextButtons = screen.getAllByText('Next');
    fireEvent.click(nextButtons[nextButtons.length - 1]);
    await waitFor(() => {
      expect(screen.getByText('Step 2')).toBeInTheDocument();
    });

    nextButtons = screen.getAllByText('Next');
    fireEvent.click(nextButtons[nextButtons.length - 1]);
    await waitFor(() => {
      expect(screen.getByText('Step 3')).toBeInTheDocument();
    });

    // Last step should show "Finish" button
    fireEvent.click(screen.getByText('Finish'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should end tour when close button is clicked', async () => {
    render(
      <TourProvider>
        <TestComponent />
      </TourProvider>
    );

    fireEvent.click(screen.getByText('Start Tour'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Close tour'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should show progress dots', async () => {
    render(
      <TourProvider>
        <TestComponent />
      </TourProvider>
    );

    fireEvent.click(screen.getByText('Start Tour'));

    await waitFor(() => {
      const dots = document.querySelectorAll('.tour-tooltip__dot');
      expect(dots).toHaveLength(3);
    });
  });

  it('should highlight active dot', async () => {
    render(
      <TourProvider>
        <TestComponent />
      </TourProvider>
    );

    fireEvent.click(screen.getByText('Start Tour'));

    await waitFor(() => {
      const activeDot = document.querySelector('.tour-tooltip__dot--active');
      expect(activeDot).toBeInTheDocument();
    });
  });
});

describe('ONBOARDING_STEPS', () => {
  it('should have required step properties', () => {
    ONBOARDING_STEPS.forEach((step: TourStep) => {
      expect(step.id).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.content).toBeTruthy();
    });
  });

  it('should have a welcome step', () => {
    const welcomeStep = ONBOARDING_STEPS.find((step) => step.id === 'welcome');
    expect(welcomeStep).toBeTruthy();
    expect(welcomeStep?.placement).toBe('center');
  });

  it('should have a complete step', () => {
    const completeStep = ONBOARDING_STEPS.find((step) => step.id === 'complete');
    expect(completeStep).toBeTruthy();
    expect(completeStep?.placement).toBe('center');
  });
});
