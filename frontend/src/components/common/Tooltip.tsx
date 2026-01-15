import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  delay?: number;
  disabled?: boolean;
  className?: string;
  maxWidth?: number;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  disabled = false,
  className = '',
  maxWidth = 250,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [actualPosition, setActualPosition] = useState<TooltipPosition>(position);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const spacing = 8;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newPosition = position;
    let top = 0;
    let left = 0;

    // Calculate initial position
    const positions: Record<TooltipPosition, { top: number; left: number }> = {
      top: {
        top: triggerRect.top - tooltipRect.height - spacing,
        left: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
      },
      bottom: {
        top: triggerRect.bottom + spacing,
        left: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
      },
      left: {
        top: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
        left: triggerRect.left - tooltipRect.width - spacing,
      },
      right: {
        top: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
        left: triggerRect.right + spacing,
      },
    };

    // Check if tooltip fits in viewport and adjust if needed
    const positionCheck = positions[position];
    const fitsTop = positionCheck.top > 0;
    const fitsBottom = positionCheck.top + tooltipRect.height < viewportHeight;
    const fitsLeft = positionCheck.left > 0;
    const fitsRight = positionCheck.left + tooltipRect.width < viewportWidth;

    if (position === 'top' && !fitsTop) {
      newPosition = 'bottom';
    } else if (position === 'bottom' && !fitsBottom) {
      newPosition = 'top';
    } else if (position === 'left' && !fitsLeft) {
      newPosition = 'right';
    } else if (position === 'right' && !fitsRight) {
      newPosition = 'left';
    }

    const finalPosition = positions[newPosition];
    top = finalPosition.top;
    left = finalPosition.left;

    // Constrain to viewport
    left = Math.max(8, Math.min(left, viewportWidth - tooltipRect.width - 8));
    top = Math.max(8, Math.min(top, viewportHeight - tooltipRect.height - 8));

    setActualPosition(newPosition);
    setCoords({ top, left });
  }, [position]);

  const showTooltip = useCallback(() => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay, disabled]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    if (isVisible) {
      calculatePosition();
    }
  }, [isVisible, calculatePosition]);

  useEffect(() => {
    if (!isVisible) return;

    const handleScroll = () => calculatePosition();
    const handleResize = () => calculatePosition();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isVisible, calculatePosition]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const tooltipId = `tooltip-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <>
      <div
        ref={triggerRef}
        className={`tooltip-trigger ${className}`}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-describedby={isVisible ? tooltipId : undefined}
      >
        {children}
      </div>
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={`tooltip tooltip--${actualPosition}`}
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              maxWidth: `${maxWidth}px`,
            }}
          >
            <div className="tooltip__content">{content}</div>
            <div className="tooltip__arrow" />
          </div>,
          document.body
        )}
      <style>{`
        .tooltip-trigger {
          display: inline-flex;
        }

        .tooltip {
          position: fixed;
          z-index: 10000;
          padding: 8px 12px;
          background: var(--text-primary, #111827);
          color: white;
          font-size: 13px;
          line-height: 1.4;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          animation: tooltipFadeIn 0.15s ease;
          pointer-events: none;
        }

        @keyframes tooltipFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .tooltip__content {
          position: relative;
          z-index: 1;
        }

        .tooltip__arrow {
          position: absolute;
          width: 8px;
          height: 8px;
          background: var(--text-primary, #111827);
          transform: rotate(45deg);
        }

        .tooltip--top .tooltip__arrow {
          bottom: -4px;
          left: 50%;
          margin-left: -4px;
        }

        .tooltip--bottom .tooltip__arrow {
          top: -4px;
          left: 50%;
          margin-left: -4px;
        }

        .tooltip--left .tooltip__arrow {
          right: -4px;
          top: 50%;
          margin-top: -4px;
        }

        .tooltip--right .tooltip__arrow {
          left: -4px;
          top: 50%;
          margin-top: -4px;
        }

        /* Dark theme adjustments */
        :root.dark .tooltip,
        [data-theme='dark'] .tooltip {
          background: var(--bg-primary, #374151);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        :root.dark .tooltip__arrow,
        [data-theme='dark'] .tooltip__arrow {
          background: var(--bg-primary, #374151);
        }
      `}</style>
    </>
  );
}

/**
 * HelpIcon - A help icon with tooltip
 */
interface HelpIconProps {
  content: ReactNode;
  position?: TooltipPosition;
  className?: string;
}

export function HelpIcon({ content, position = 'top', className = '' }: HelpIconProps) {
  return (
    <Tooltip content={content} position={position}>
      <button
        type="button"
        className={`help-icon ${className}`}
        aria-label="Help"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>

        <style>{`
          .help-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            padding: 0;
            background: transparent;
            border: none;
            border-radius: 50%;
            color: var(--text-tertiary, #9ca3af);
            cursor: help;
            transition: color 0.15s;
          }

          .help-icon:hover {
            color: var(--color-primary, #3b82f6);
          }

          .help-icon:focus-visible {
            outline: 2px solid var(--color-primary, #3b82f6);
            outline-offset: 2px;
          }
        `}</style>
      </button>
    </Tooltip>
  );
}

export default Tooltip;
