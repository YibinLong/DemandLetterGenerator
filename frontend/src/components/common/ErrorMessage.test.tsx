import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorMessage, getErrorMessage } from './ErrorMessage';

describe('ErrorMessage', () => {
  describe('Rendering', () => {
    it('should render error message', () => {
      render(<ErrorMessage message="Something went wrong" />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should render with custom title for card variant', () => {
      render(<ErrorMessage title="Custom Error" message="Details here" variant="card" />);
      expect(screen.getByText('Custom Error')).toBeInTheDocument();
      expect(screen.getByText('Details here')).toBeInTheDocument();
    });

    it('should have alert role for accessibility', () => {
      render(<ErrorMessage message="Error" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('should render inline variant by default', () => {
      const { container } = render(<ErrorMessage message="Error" />);
      expect(container.querySelector('.error-message-inline')).toBeInTheDocument();
    });

    it('should render card variant', () => {
      const { container } = render(<ErrorMessage message="Error" variant="card" />);
      expect(container.querySelector('.error-message-card')).toBeInTheDocument();
    });

    it('should render toast variant', () => {
      const { container } = render(<ErrorMessage message="Error" variant="toast" />);
      expect(container.querySelector('.error-message-toast')).toBeInTheDocument();
    });
  });

  describe('Retry Button', () => {
    it('should render retry button when onRetry is provided', () => {
      const onRetry = vi.fn();
      render(<ErrorMessage message="Error" onRetry={onRetry} />);
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should call onRetry when retry button is clicked', () => {
      const onRetry = vi.fn();
      render(<ErrorMessage message="Error" onRetry={onRetry} />);
      fireEvent.click(screen.getByText('Try Again'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should not render retry button when onRetry is not provided', () => {
      render(<ErrorMessage message="Error" />);
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });
  });

  describe('Dismiss Button', () => {
    it('should render dismiss button when onDismiss is provided', () => {
      const onDismiss = vi.fn();
      render(<ErrorMessage message="Error" onDismiss={onDismiss} />);
      expect(screen.getByLabelText('Dismiss error')).toBeInTheDocument();
    });

    it('should call onDismiss when dismiss button is clicked', () => {
      const onDismiss = vi.fn();
      render(<ErrorMessage message="Error" onDismiss={onDismiss} />);
      fireEvent.click(screen.getByLabelText('Dismiss error'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });
});

describe('getErrorMessage', () => {
  it('should return error message from Error object', () => {
    const error = new Error('Test error');
    expect(getErrorMessage(error)).toBe('Test error');
  });

  it('should return string error as is', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('should return default message for unknown errors', () => {
    expect(getErrorMessage({})).toBe('An unexpected error occurred. Please try again.');
    expect(getErrorMessage(null)).toBe('An unexpected error occurred. Please try again.');
  });

  it('should handle axios error with response data message', () => {
    const axiosError = new Error('Request failed') as Error & {
      response?: { data?: { message?: string }; status?: number };
    };
    axiosError.response = { data: { message: 'Server error message' } };
    expect(getErrorMessage(axiosError)).toBe('Server error message');
  });

  it('should handle 401 status code', () => {
    const axiosError = new Error('Unauthorized') as Error & {
      response?: { status?: number };
    };
    axiosError.response = { status: 401 };
    expect(getErrorMessage(axiosError)).toBe('Your session has expired. Please log in again.');
  });

  it('should handle 403 status code', () => {
    const axiosError = new Error('Forbidden') as Error & {
      response?: { status?: number };
    };
    axiosError.response = { status: 403 };
    expect(getErrorMessage(axiosError)).toBe('You do not have permission to perform this action.');
  });

  it('should handle 404 status code', () => {
    const axiosError = new Error('Not Found') as Error & {
      response?: { status?: number };
    };
    axiosError.response = { status: 404 };
    expect(getErrorMessage(axiosError)).toBe('The requested resource was not found.');
  });

  it('should handle 500 status code', () => {
    const axiosError = new Error('Server Error') as Error & {
      response?: { status?: number };
    };
    axiosError.response = { status: 500 };
    expect(getErrorMessage(axiosError)).toBe('An internal server error occurred. Please try again later.');
  });

  it('should handle network errors', () => {
    const networkError = new Error('Network Error');
    expect(getErrorMessage(networkError)).toBe('Unable to connect to the server. Please check your internet connection.');
  });
});
