/**
 * SkipLink component for keyboard navigation
 * Allows users to skip repetitive content (navigation) and jump to main content
 * Required for WCAG 2.1 AA compliance (Success Criterion 2.4.1)
 */

interface SkipLinkProps {
  /** The ID of the target element to skip to */
  targetId: string;
  /** The text to display in the skip link */
  children?: React.ReactNode;
}

export function SkipLink({ targetId, children = 'Skip to main content' }: SkipLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return (
    <>
      <a
        href={`#${targetId}`}
        className="skip-link"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {children}
      </a>
      <style>{`
        .skip-link {
          position: fixed;
          top: -100px;
          left: 50%;
          transform: translateX(-50%);
          padding: 12px 24px;
          background: var(--color-primary, #3b82f6);
          color: white;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border-radius: 0 0 8px 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 9999;
          transition: top 0.2s ease;
        }

        .skip-link:focus {
          top: 0;
          outline: 2px solid white;
          outline-offset: 2px;
        }

        .skip-link:focus-visible {
          top: 0;
        }
      `}</style>
    </>
  );
}

export default SkipLink;
