import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  describe('Rendering', () => {
    it('should render the spinner', () => {
      render(<LoadingSpinner />);
      expect(document.querySelector('.spinner')).toBeInTheDocument();
    });

    it('should render text when provided', () => {
      render(<LoadingSpinner text="Loading..." />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should not render text when not provided', () => {
      render(<LoadingSpinner />);
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('should render small spinner', () => {
      const { container } = render(<LoadingSpinner size="small" />);
      const spinner = container.querySelector('.spinner');
      expect(spinner).toHaveStyle({ width: '16px', height: '16px' });
    });

    it('should render medium spinner by default', () => {
      const { container } = render(<LoadingSpinner />);
      const spinner = container.querySelector('.spinner');
      expect(spinner).toHaveStyle({ width: '24px', height: '24px' });
    });

    it('should render large spinner', () => {
      const { container } = render(<LoadingSpinner size="large" />);
      const spinner = container.querySelector('.spinner');
      expect(spinner).toHaveStyle({ width: '40px', height: '40px' });
    });
  });

  describe('Full Page Mode', () => {
    it('should have full-page class when fullPage is true', () => {
      const { container } = render(<LoadingSpinner fullPage />);
      expect(container.querySelector('.full-page')).toBeInTheDocument();
    });

    it('should not have full-page class when fullPage is false', () => {
      const { container } = render(<LoadingSpinner />);
      expect(container.querySelector('.full-page')).not.toBeInTheDocument();
    });
  });
});
