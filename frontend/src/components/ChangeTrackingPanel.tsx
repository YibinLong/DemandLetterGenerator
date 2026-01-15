// Change tracking panel component for viewing and managing document changes
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getChanges,
  reviewChange,
  bulkReviewChanges,
  deleteChange,
} from '../lib/change-tracking';
import {
  DocumentChange,
  ChangeStatus,
  ChangeType,
} from '../types/demand-letter';

interface ChangeTrackingPanelProps {
  demandLetterId: string;
  onChangeSelected?: (change: DocumentChange | null) => void;
}

// Change type display config
const changeTypeConfig: Record<ChangeType, { label: string; bgColor: string; textColor: string }> = {
  insertion: { label: 'Added', bgColor: '#d4edda', textColor: '#155724' },
  deletion: { label: 'Deleted', bgColor: '#f8d7da', textColor: '#721c24' },
  modification: { label: 'Modified', bgColor: '#fff3cd', textColor: '#856404' },
  format: { label: 'Formatted', bgColor: '#cce5ff', textColor: '#004085' },
};

// Status display config
const statusConfig: Record<ChangeStatus, { label: string; bgColor: string; textColor: string }> = {
  pending: { label: 'Pending', bgColor: '#fff3cd', textColor: '#856404' },
  accepted: { label: 'Accepted', bgColor: '#d4edda', textColor: '#155724' },
  rejected: { label: 'Rejected', bgColor: '#f8d7da', textColor: '#721c24' },
};

export function ChangeTrackingPanel({
  demandLetterId,
  onChangeSelected,
}: ChangeTrackingPanelProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ChangeStatus | 'all'>('all');
  const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set());

  // Fetch changes
  const { data, isLoading, error } = useQuery({
    queryKey: ['changes', demandLetterId, statusFilter],
    queryFn: () => getChanges(demandLetterId, statusFilter === 'all' ? undefined : statusFilter),
  });

  // Review change mutation
  const reviewMutation = useMutation({
    mutationFn: ({ changeId, action }: { changeId: string; action: 'accept' | 'reject' }) =>
      reviewChange(demandLetterId, changeId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changes', demandLetterId] });
      setSelectedChanges(new Set());
    },
  });

  // Bulk review mutation
  const bulkReviewMutation = useMutation({
    mutationFn: ({ changeIds, action }: { changeIds: string[]; action: 'accept' | 'reject' }) =>
      bulkReviewChanges(demandLetterId, changeIds, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changes', demandLetterId] });
      setSelectedChanges(new Set());
    },
  });

  // Delete change mutation
  const deleteMutation = useMutation({
    mutationFn: (changeId: string) => deleteChange(demandLetterId, changeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changes', demandLetterId] });
    },
  });

  const handleSelectChange = useCallback((changeId: string) => {
    setSelectedChanges((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(changeId)) {
        newSet.delete(changeId);
      } else {
        newSet.add(changeId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!data?.changes) return;
    const pendingChanges = data.changes.filter((c) => c.status === 'pending');
    if (selectedChanges.size === pendingChanges.length) {
      setSelectedChanges(new Set());
    } else {
      setSelectedChanges(new Set(pendingChanges.map((c) => c.id)));
    }
  }, [data?.changes, selectedChanges.size]);

  const handleBulkAction = useCallback(
    (action: 'accept' | 'reject') => {
      if (selectedChanges.size === 0) return;
      bulkReviewMutation.mutate({
        changeIds: Array.from(selectedChanges),
        action,
      });
    },
    [selectedChanges, bulkReviewMutation]
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const truncateText = (text: string | undefined, maxLength = 50) => {
    if (!text) return '';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <span>Loading changes...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <span>Failed to load changes</span>
        </div>
      </div>
    );
  }

  const changes = data?.changes || [];
  const pendingChanges = changes.filter((c) => c.status === 'pending');

  return (
    <div style={styles.container}>
      {/* Header with stats */}
      <div style={styles.header}>
        <h3 style={styles.title}>Change Tracking</h3>
        <div style={styles.stats}>
          <span style={{ ...styles.stat, ...styles.statPending }}>
            {data?.pending_count || 0} pending
          </span>
          <span style={{ ...styles.stat, ...styles.statAccepted }}>
            {data?.accepted_count || 0} accepted
          </span>
          <span style={{ ...styles.stat, ...styles.statRejected }}>
            {data?.rejected_count || 0} rejected
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ChangeStatus | 'all')}
          style={styles.select}
        >
          <option value="all">All Changes</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </select>

        {pendingChanges.length > 0 && (
          <div style={styles.bulkActions}>
            <label style={styles.selectAllLabel}>
              <input
                type="checkbox"
                checked={selectedChanges.size === pendingChanges.length && pendingChanges.length > 0}
                onChange={handleSelectAll}
                style={styles.checkbox}
              />
              Select All
            </label>
            {selectedChanges.size > 0 && (
              <>
                <button
                  onClick={() => handleBulkAction('accept')}
                  disabled={bulkReviewMutation.isPending}
                  style={{ ...styles.button, ...styles.acceptButton }}
                >
                  Accept ({selectedChanges.size})
                </button>
                <button
                  onClick={() => handleBulkAction('reject')}
                  disabled={bulkReviewMutation.isPending}
                  style={{ ...styles.button, ...styles.rejectButton }}
                >
                  Reject ({selectedChanges.size})
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Changes list */}
      <div style={styles.changesList}>
        {changes.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={styles.emptyIcon}>📝</span>
            <p>No changes tracked yet</p>
            <p style={styles.emptyHint}>
              Changes made to the document will appear here for review.
            </p>
          </div>
        ) : (
          changes.map((change) => (
            <div
              key={change.id}
              style={{
                ...styles.changeItem,
                ...(change.status === 'pending' ? styles.changeItemPending : {}),
              }}
              onClick={() => onChangeSelected?.(change)}
            >
              <div style={styles.changeHeader}>
                {change.status === 'pending' && (
                  <input
                    type="checkbox"
                    checked={selectedChanges.has(change.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectChange(change.id);
                    }}
                    style={styles.checkbox}
                  />
                )}
                <span
                  style={{
                    ...styles.changeTypeBadge,
                    backgroundColor: changeTypeConfig[change.change_type].bgColor,
                    color: changeTypeConfig[change.change_type].textColor,
                  }}
                >
                  {changeTypeConfig[change.change_type].label}
                </span>
                <span
                  style={{
                    ...styles.statusBadge,
                    backgroundColor: statusConfig[change.status].bgColor,
                    color: statusConfig[change.status].textColor,
                  }}
                >
                  {statusConfig[change.status].label}
                </span>
              </div>

              <div style={styles.changeContent}>
                {change.change_type === 'deletion' && change.old_content && (
                  <div style={styles.deletedText}>
                    <span style={styles.contentLabel}>Removed:</span>
                    <span>{truncateText(change.old_content)}</span>
                  </div>
                )}
                {change.change_type === 'insertion' && change.new_content && (
                  <div style={styles.insertedText}>
                    <span style={styles.contentLabel}>Added:</span>
                    <span>{truncateText(change.new_content)}</span>
                  </div>
                )}
                {change.change_type === 'modification' && (
                  <>
                    {change.old_content && (
                      <div style={styles.deletedText}>
                        <span style={styles.contentLabel}>From:</span>
                        <span>{truncateText(change.old_content)}</span>
                      </div>
                    )}
                    {change.new_content && (
                      <div style={styles.insertedText}>
                        <span style={styles.contentLabel}>To:</span>
                        <span>{truncateText(change.new_content)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={styles.changeFooter}>
                <span style={styles.changeAuthor}>
                  {change.user_name} • {formatDate(change.created_at)}
                </span>
                {change.status === 'pending' && (
                  <div style={styles.changeActions}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reviewMutation.mutate({ changeId: change.id, action: 'accept' });
                      }}
                      disabled={reviewMutation.isPending}
                      style={{ ...styles.actionButton, ...styles.acceptAction }}
                      title="Accept change"
                    >
                      ✓
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reviewMutation.mutate({ changeId: change.id, action: 'reject' });
                      }}
                      disabled={reviewMutation.isPending}
                      style={{ ...styles.actionButton, ...styles.rejectAction }}
                      title="Reject change"
                    >
                      ✕
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this change?')) {
                          deleteMutation.mutate(change.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      style={{ ...styles.actionButton, ...styles.deleteAction }}
                      title="Delete change"
                    >
                      🗑
                    </button>
                  </div>
                )}
                {change.reviewed_by && (
                  <span style={styles.reviewer}>
                    {change.status === 'accepted' ? 'Accepted' : 'Rejected'} by{' '}
                    {change.reviewer_name}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
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
  title: {
    margin: '0 0 8px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827',
  },
  stats: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  stat: {
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
  },
  statPending: {
    backgroundColor: '#fff3cd',
    color: '#856404',
  },
  statAccepted: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  statRejected: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  filterBar: {
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  select: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    backgroundColor: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  bulkActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginLeft: 'auto',
  },
  selectAllLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  },
  checkbox: {
    cursor: 'pointer',
  },
  button: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  acceptButton: {
    backgroundColor: '#10b981',
    color: '#fff',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
    color: '#fff',
  },
  changesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  changeItem: {
    padding: '12px',
    marginBottom: '8px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#fff',
    cursor: 'pointer',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  changeItemPending: {
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
  changeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  changeTypeBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  statusBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
  },
  changeContent: {
    fontSize: '14px',
    lineHeight: 1.5,
    marginBottom: '8px',
  },
  contentLabel: {
    fontWeight: 500,
    marginRight: '4px',
    color: '#6b7280',
  },
  deletedText: {
    color: '#721c24',
    backgroundColor: '#f8d7da',
    padding: '4px 8px',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  insertedText: {
    color: '#155724',
    backgroundColor: '#d4edda',
    padding: '4px 8px',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  changeFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#6b7280',
  },
  changeAuthor: {
    flex: 1,
  },
  changeActions: {
    display: 'flex',
    gap: '4px',
  },
  actionButton: {
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.2s',
  },
  acceptAction: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  rejectAction: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  deleteAction: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  reviewer: {
    fontStyle: 'italic',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '32px',
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
    padding: '32px',
    textAlign: 'center',
    color: '#ef4444',
  },
  emptyState: {
    padding: '48px 24px',
    textAlign: 'center',
    color: '#6b7280',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
    display: 'block',
  },
  emptyHint: {
    fontSize: '13px',
    color: '#9ca3af',
    marginTop: '8px',
  },
};

export default ChangeTrackingPanel;
