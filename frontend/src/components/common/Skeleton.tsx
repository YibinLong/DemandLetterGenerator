import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 4,
  className = '',
  style = {},
}: SkeletonProps) {
  return (
    <>
      <div
        className={`skeleton ${className}`}
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height: typeof height === 'number' ? `${height}px` : height,
          borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
          ...style,
        }}
      />

      <style>{`
        .skeleton {
          background: linear-gradient(
            90deg,
            var(--skeleton-base, #e5e7eb) 0%,
            var(--skeleton-highlight, #f3f4f6) 50%,
            var(--skeleton-base, #e5e7eb) 100%
          );
          background-size: 200% 100%;
          animation: skeleton-shimmer 1.5s infinite;
        }

        @keyframes skeleton-shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </>
  );
}

// Pre-built skeleton patterns
interface CardSkeletonProps {
  count?: number;
}

export function CardSkeleton({ count = 1 }: CardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-skeleton">
          <div className="card-skeleton-header">
            <Skeleton width={80} height={24} borderRadius={12} />
            <Skeleton width={40} height={20} borderRadius={4} />
          </div>
          <Skeleton width="70%" height={20} />
          <div className="card-skeleton-body">
            <Skeleton width="50%" height={16} />
            <Skeleton width="40%" height={16} />
          </div>
          <div className="card-skeleton-footer">
            <Skeleton width={100} height={14} />
            <Skeleton width={32} height={32} borderRadius={6} />
          </div>
        </div>
      ))}

      <style>{`
        .card-skeleton {
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          padding: 20px;
        }

        .card-skeleton-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .card-skeleton-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 12px;
        }

        .card-skeleton-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--border-secondary, #f3f4f6);
        }
      `}</style>
    </>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-skeleton">
      <div className="table-skeleton-header">
        {[1, 2, 3, 4].map((col) => (
          <Skeleton key={col} height={16} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="table-skeleton-row">
          {[1, 2, 3, 4].map((col) => (
            <Skeleton key={col} height={16} width={`${60 + Math.random() * 30}%`} />
          ))}
        </div>
      ))}

      <style>{`
        .table-skeleton {
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 8px;
          overflow: hidden;
        }

        .table-skeleton-header {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          padding: 16px;
          background: var(--bg-secondary, #f9fafb);
          border-bottom: 1px solid var(--border-primary, #e5e7eb);
        }

        .table-skeleton-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          padding: 16px;
          border-bottom: 1px solid var(--border-secondary, #f3f4f6);
        }

        .table-skeleton-row:last-child {
          border-bottom: none;
        }
      `}</style>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      {/* Stats row */}
      <div className="stats-skeleton">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="stat-card-skeleton">
            <Skeleton width={100} height={14} />
            <Skeleton width={60} height={32} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>

      {/* Content area */}
      <div className="content-skeleton">
        <div className="main-content-skeleton">
          <Skeleton height={24} width={200} style={{ marginBottom: 16 }} />
          <div className="cards-grid-skeleton">
            <CardSkeleton count={4} />
          </div>
        </div>
        <div className="sidebar-skeleton">
          <Skeleton height={24} width={150} style={{ marginBottom: 16 }} />
          <Skeleton height={300} borderRadius={8} />
        </div>
      </div>

      <style>{`
        .dashboard-skeleton {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .stats-skeleton {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .stat-card-skeleton {
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          padding: 20px;
        }

        .content-skeleton {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 24px;
        }

        .cards-grid-skeleton {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .sidebar-skeleton {
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 1024px) {
          .content-skeleton {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .stats-skeleton {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default Skeleton;
