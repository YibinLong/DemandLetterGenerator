// Version comparison component for viewing differences between document versions
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { compareVersions, computeDiff, diffToHtml, getDiffStats } from '../lib/change-tracking';
import type { DemandLetterVersion } from '../types/demand-letter';

interface VersionComparisonProps {
  demandLetterId: string;
  versions: DemandLetterVersion[];
  onClose?: () => void;
}

export function VersionComparison({
  demandLetterId,
  versions,
  onClose,
}: VersionComparisonProps) {
  const [fromVersion, setFromVersion] = useState<number>(
    versions.length > 1 ? versions[1].version_number : versions[0]?.version_number || 1
  );
  const [toVersion, setToVersion] = useState<number>(
    versions[0]?.version_number || 1
  );
  const [viewMode, setViewMode] = useState<'unified' | 'side-by-side'>('unified');

  // Fetch version comparison
  const { data, isLoading, error } = useQuery({
    queryKey: ['version-compare', demandLetterId, fromVersion, toVersion],
    queryFn: () => compareVersions(demandLetterId, fromVersion, toVersion),
    enabled: fromVersion !== toVersion,
  });

  // Compute diff
  const diff = useMemo(() => {
    if (!data) return null;
    const oldText = data.from.content || '';
    const newText = data.to.content || '';
    return computeDiff(oldText, newText);
  }, [data]);

  const diffHtml = useMemo(() => {
    if (!diff) return '';
    return diffToHtml(diff);
  }, [diff]);

  const stats = useMemo(() => {
    if (!diff) return null;
    return getDiffStats(diff);
  }, [diff]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <h3 style={styles.title}>Compare Versions</h3>
          {onClose && (
            <button onClick={onClose} style={styles.closeButton}>
              ✕
            </button>
          )}
        </div>

        {/* Version selectors */}
        <div style={styles.selectors}>
          <div style={styles.selectorGroup}>
            <label style={styles.label}>From Version</label>
            <select
              value={fromVersion}
              onChange={(e) => setFromVersion(Number(e.target.value))}
              style={styles.select}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.version_number}>
                  Version {v.version_number} - {formatDate(v.created_at)}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.arrow}>→</div>

          <div style={styles.selectorGroup}>
            <label style={styles.label}>To Version</label>
            <select
              value={toVersion}
              onChange={(e) => setToVersion(Number(e.target.value))}
              style={styles.select}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.version_number}>
                  Version {v.version_number} - {formatDate(v.created_at)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View mode toggle */}
        <div style={styles.viewModeToggle}>
          <button
            onClick={() => setViewMode('unified')}
            style={{
              ...styles.viewModeButton,
              ...(viewMode === 'unified' ? styles.viewModeActive : {}),
            }}
          >
            Unified
          </button>
          <button
            onClick={() => setViewMode('side-by-side')}
            style={{
              ...styles.viewModeButton,
              ...(viewMode === 'side-by-side' ? styles.viewModeActive : {}),
            }}
          >
            Side by Side
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {fromVersion === toVersion ? (
          <div style={styles.sameVersion}>
            <span style={styles.infoIcon}>ℹ️</span>
            <p>Select different versions to compare</p>
          </div>
        ) : isLoading ? (
          <div style={styles.loading}>
            <div style={styles.spinner}></div>
            <span>Loading comparison...</span>
          </div>
        ) : error ? (
          <div style={styles.error}>
            <span>Failed to load comparison</span>
          </div>
        ) : data && stats ? (
          <>
            {/* Stats bar */}
            <div style={styles.statsBar}>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Changes:</span>
                <span style={{ ...styles.statValue, color: '#155724' }}>
                  +{stats.insertions} words
                </span>
                <span style={{ ...styles.statValue, color: '#721c24' }}>
                  -{stats.deletions} words
                </span>
              </div>
              <div style={styles.versionInfo}>
                <div style={styles.versionAuthor}>
                  <strong>From:</strong> {data.from.changed_by?.name || 'Unknown'} on{' '}
                  {formatDate(data.from.created_at)}
                </div>
                <div style={styles.versionAuthor}>
                  <strong>To:</strong> {data.to.changed_by?.name || 'Unknown'} on{' '}
                  {formatDate(data.to.created_at)}
                </div>
              </div>
            </div>

            {/* Diff view */}
            {viewMode === 'unified' ? (
              <div style={styles.unifiedView}>
                <div
                  style={styles.diffContent}
                  dangerouslySetInnerHTML={{ __html: diffHtml }}
                />
              </div>
            ) : (
              <div style={styles.sideBySideView}>
                <div style={styles.sideBySidePane}>
                  <div style={styles.paneHeader}>
                    <span>Version {fromVersion}</span>
                    <span style={styles.paneSubtitle}>(older)</span>
                  </div>
                  <div style={styles.paneContent}>
                    <pre style={styles.preContent}>{data.from.content}</pre>
                  </div>
                </div>
                <div style={styles.sideBySidePane}>
                  <div style={styles.paneHeader}>
                    <span>Version {toVersion}</span>
                    <span style={styles.paneSubtitle}>(newer)</span>
                  </div>
                  <div style={styles.paneContent}>
                    <pre style={styles.preContent}>{data.to.content}</pre>
                  </div>
                </div>
              </div>
            )}

            {/* Change summaries */}
            <div style={styles.summaries}>
              {data.from.change_summary && (
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Version {fromVersion}:</span>
                  <span>{data.from.change_summary}</span>
                </div>
              )}
              {data.to.change_summary && (
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Version {toVersion}:</span>
                  <span>{data.to.change_summary}</span>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendBox, backgroundColor: '#d4edda' }}></span>
          Added text
        </span>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendBox, backgroundColor: '#f8d7da' }}></span>
          Removed text
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#111827',
  },
  closeButton: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '18px',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectors: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '16px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  selectorGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    backgroundColor: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    minWidth: '200px',
  },
  arrow: {
    fontSize: '20px',
    color: '#9ca3af',
    paddingBottom: '8px',
  },
  viewModeToggle: {
    display: 'flex',
    gap: '4px',
    backgroundColor: '#e5e7eb',
    borderRadius: '6px',
    padding: '4px',
    width: 'fit-content',
  },
  viewModeButton: {
    padding: '6px 16px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#6b7280',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  viewModeActive: {
    backgroundColor: '#fff',
    color: '#111827',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
  statsBar: {
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  },
  statLabel: {
    color: '#6b7280',
    fontWeight: 500,
  },
  statValue: {
    fontWeight: 600,
  },
  versionInfo: {
    display: 'flex',
    gap: '24px',
    fontSize: '13px',
    color: '#6b7280',
  },
  versionAuthor: {
    display: 'flex',
    gap: '4px',
  },
  unifiedView: {
    padding: '16px',
  },
  diffContent: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '13px',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  sideBySideView: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    height: '100%',
    overflow: 'hidden',
  },
  sideBySidePane: {
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #e5e7eb',
    overflow: 'hidden',
  },
  paneHeader: {
    padding: '10px 16px',
    backgroundColor: '#f3f4f6',
    borderBottom: '1px solid #e5e7eb',
    fontSize: '14px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  paneSubtitle: {
    fontSize: '12px',
    color: '#6b7280',
    fontWeight: 400,
  },
  paneContent: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  preContent: {
    margin: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '13px',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  summaries: {
    padding: '16px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#fafafa',
  },
  summaryItem: {
    display: 'flex',
    gap: '8px',
    fontSize: '13px',
    color: '#374151',
    marginBottom: '8px',
  },
  summaryLabel: {
    fontWeight: 500,
    color: '#6b7280',
  },
  legend: {
    display: 'flex',
    gap: '24px',
    padding: '12px 16px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    fontSize: '13px',
    color: '#6b7280',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  legendBox: {
    width: '16px',
    height: '16px',
    borderRadius: '3px',
  },
  sameVersion: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    color: '#6b7280',
    textAlign: 'center',
  },
  infoIcon: {
    fontSize: '32px',
    marginBottom: '8px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '48px',
    color: '#6b7280',
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  error: {
    padding: '48px',
    textAlign: 'center',
    color: '#ef4444',
  },
};

export default VersionComparison;
