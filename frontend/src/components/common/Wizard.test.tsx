/**
 * Tests for Wizard component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Wizard, useWizard } from './Wizard';
import { LiveRegionProvider } from './LiveRegion';

// Test step content component
function StepContent({ text }: { text: string }) {
  const { canProceed, setCanProceed, isFirstStep, isLastStep, currentStep } = useWizard();

  return (
    <div>
      <p>{text}</p>
      <p data-testid="step-info">
        Step {currentStep + 1}, First: {isFirstStep ? 'yes' : 'no'}, Last: {isLastStep ? 'yes' : 'no'}
      </p>
      <button onClick={() => setCanProceed(!canProceed)}>Toggle Can Proceed</button>
    </div>
  );
}

const mockSteps = [
  {
    id: 'step1',
    label: 'First Step',
    description: 'Description for step 1',
    content: <StepContent text="Content for step 1" />,
  },
  {
    id: 'step2',
    label: 'Second Step',
    description: 'Description for step 2',
    content: <StepContent text="Content for step 2" />,
  },
  {
    id: 'step3',
    label: 'Third Step',
    description: 'Description for step 3',
    content: <StepContent text="Content for step 3" />,
  },
];

// Wrapper component to provide LiveRegion context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <LiveRegionProvider>{children}</LiveRegionProvider>;
}

describe('Wizard', () => {
  it('should render with title', () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} title="Test Wizard" />
      </TestWrapper>
    );

    expect(screen.getByText('Test Wizard')).toBeInTheDocument();
  });

  it('should render step indicator', () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    expect(screen.getByRole('navigation', { name: 'Progress steps' })).toBeInTheDocument();
  });

  it('should render first step content', () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    // "First Step" appears in both step indicator and step title, so use getAllByText
    expect(screen.getAllByText('First Step').length).toBeGreaterThan(0);
    expect(screen.getByText('Content for step 1')).toBeInTheDocument();
  });

  it('should show Continue button on non-last steps', () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.queryByText('Complete')).not.toBeInTheDocument();
  });

  it('should not show Back button on first step', () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    expect(screen.queryByText('Back')).not.toBeInTheDocument();
  });

  it('should navigate to next step when Continue is clicked', async () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => {
      expect(screen.getByText('Content for step 2')).toBeInTheDocument();
    });
  });

  it('should show Back button on non-first steps', async () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  });

  it('should navigate back when Back is clicked', async () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    // Go to step 2
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => {
      expect(screen.getByText('Content for step 2')).toBeInTheDocument();
    });

    // Go back to step 1
    fireEvent.click(screen.getByText('Back'));

    await waitFor(() => {
      expect(screen.getByText('Content for step 1')).toBeInTheDocument();
    });
  });

  it('should show Complete button on last step', async () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    // Navigate to last step
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Content for step 2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Content for step 3')).toBeInTheDocument();
    });

    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('should call onComplete when Complete is clicked', async () => {
    const handleComplete = vi.fn();

    render(
      <TestWrapper>
        <Wizard steps={mockSteps} onComplete={handleComplete} />
      </TestWrapper>
    );

    // Navigate to last step
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Content for step 2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Content for step 3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Complete'));

    await waitFor(() => {
      expect(handleComplete).toHaveBeenCalled();
    });
  });

  it('should call onCancel when Cancel is clicked', () => {
    const handleCancel = vi.fn();

    render(
      <TestWrapper>
        <Wizard steps={mockSteps} onCancel={handleCancel} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText('Cancel'));

    expect(handleCancel).toHaveBeenCalled();
  });

  it('should use custom labels', () => {
    render(
      <TestWrapper>
        <Wizard
          steps={mockSteps}
          cancelLabel="Exit"
          backLabel="Previous"
          nextLabel="Next Step"
          completeLabel="Finish"
        />
      </TestWrapper>
    );

    expect(screen.getByText('Exit')).toBeInTheDocument();
    expect(screen.getByText('Next Step')).toBeInTheDocument();
  });

  it('should start at specified initial step', () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} initialStep={1} />
      </TestWrapper>
    );

    expect(screen.getByText('Content for step 2')).toBeInTheDocument();
  });

  it('should hide step indicator when showStepIndicator is false', () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} showStepIndicator={false} />
      </TestWrapper>
    );

    expect(screen.queryByRole('navigation', { name: 'Progress steps' })).not.toBeInTheDocument();
  });

  it('should disable Continue button when canProceed is false', async () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    // Toggle canProceed to false
    fireEvent.click(screen.getByText('Toggle Can Proceed'));

    await waitFor(() => {
      expect(screen.getByText('Continue')).toBeDisabled();
    });
  });

  it('should run step validation before proceeding', async () => {
    const validateFn = vi.fn().mockResolvedValue(true);

    const stepsWithValidation = [
      {
        id: 'step1',
        label: 'Step 1',
        content: <div>Step 1</div>,
        validate: validateFn,
      },
      {
        id: 'step2',
        label: 'Step 2',
        content: <div>Step 2</div>,
      },
    ];

    render(
      <TestWrapper>
        <Wizard steps={stepsWithValidation} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => {
      expect(validateFn).toHaveBeenCalled();
    });
  });

  it('should not proceed when validation fails', async () => {
    const validateFn = vi.fn().mockResolvedValue(false);

    const stepsWithValidation = [
      {
        id: 'step1',
        label: 'Step 1',
        content: <div>Step 1 Content</div>,
        validate: validateFn,
      },
      {
        id: 'step2',
        label: 'Step 2',
        content: <div>Step 2 Content</div>,
      },
    ];

    render(
      <TestWrapper>
        <Wizard steps={stepsWithValidation} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => {
      expect(validateFn).toHaveBeenCalled();
    });

    // Should still be on step 1
    expect(screen.getByText('Step 1 Content')).toBeInTheDocument();
  });
});

describe('useWizard', () => {
  it('should throw error when used outside Wizard', () => {
    const originalError = console.error;
    console.error = () => {};

    const TestComponent = () => {
      useWizard();
      return null;
    };

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useWizard must be used within a Wizard');

    console.error = originalError;
  });

  it('should provide correct step information', () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    // First step
    expect(screen.getByTestId('step-info')).toHaveTextContent('Step 1, First: yes, Last: no');
  });

  it('should update step information on navigation', async () => {
    render(
      <TestWrapper>
        <Wizard steps={mockSteps} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => {
      expect(screen.getByTestId('step-info')).toHaveTextContent('Step 2, First: no, Last: no');
    });

    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => {
      expect(screen.getByTestId('step-info')).toHaveTextContent('Step 3, First: no, Last: yes');
    });
  });
});
