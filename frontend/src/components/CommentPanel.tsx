// Comment panel component for document annotations and discussions
import { useState, useCallback, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getComments,
  createComment,
  updateComment,
  resolveComment,
  deleteComment,
} from '../lib/change-tracking';
import { DocumentComment, CreateCommentRequest } from '../types/demand-letter';

interface CommentPanelProps {
  demandLetterId: string;
  selectedChangeId?: string;
  selectedPosition?: { start: number; end: number };
  onCommentSelected?: (comment: DocumentComment | null) => void;
  currentUserId?: string;
}

export function CommentPanel({
  demandLetterId,
  selectedChangeId,
  selectedPosition,
  onCommentSelected,
  currentUserId,
}: CommentPanelProps) {
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Fetch comments
  const { data, isLoading, error } = useQuery({
    queryKey: ['comments', demandLetterId, showResolved],
    queryFn: () => getComments(demandLetterId, showResolved),
  });

  // Create comment mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateCommentRequest) => createComment(demandLetterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', demandLetterId] });
      setNewComment('');
      setReplyingTo(null);
      setReplyText('');
    },
  });

  // Update comment mutation
  const updateMutation = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      updateComment(demandLetterId, commentId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', demandLetterId] });
      setEditingComment(null);
      setEditText('');
    },
  });

  // Resolve comment mutation
  const resolveMutation = useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      resolveComment(demandLetterId, commentId, resolved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', demandLetterId] });
    },
  });

  // Delete comment mutation
  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(demandLetterId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', demandLetterId] });
    },
  });

  const handleSubmitComment = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!newComment.trim()) return;

      const data: CreateCommentRequest = {
        content: newComment.trim(),
        change_id: selectedChangeId,
        position_start: selectedPosition?.start,
        position_end: selectedPosition?.end,
      };

      createMutation.mutate(data);
    },
    [newComment, selectedChangeId, selectedPosition, createMutation]
  );

  const handleSubmitReply = useCallback(
    (parentId: string) => {
      if (!replyText.trim()) return;

      createMutation.mutate({
        content: replyText.trim(),
        parent_id: parentId,
      });
    },
    [replyText, createMutation]
  );

  const handleSaveEdit = useCallback(
    (commentId: string) => {
      if (!editText.trim()) return;
      updateMutation.mutate({ commentId, content: editText.trim() });
    },
    [editText, updateMutation]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderComment = (comment: DocumentComment, isReply = false) => {
    const isEditing = editingComment === comment.id;
    const isReplying = replyingTo === comment.id;
    const isOwner = currentUserId === comment.user_id;

    return (
      <div
        key={comment.id}
        style={{
          ...styles.comment,
          ...(isReply ? styles.reply : {}),
          ...(comment.is_resolved ? styles.resolvedComment : {}),
        }}
        onClick={() => onCommentSelected?.(comment)}
      >
        <div style={styles.commentHeader}>
          <div style={styles.avatar}>
            {comment.user_name.charAt(0).toUpperCase()}
          </div>
          <div style={styles.commentMeta}>
            <span style={styles.authorName}>{comment.user_name}</span>
            <span style={styles.commentTime}>{formatDate(comment.created_at)}</span>
          </div>
          {comment.is_resolved && (
            <span style={styles.resolvedBadge}>Resolved</span>
          )}
        </div>

        {isEditing ? (
          <div style={styles.editForm}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              style={styles.textarea}
              autoFocus
            />
            <div style={styles.editActions}>
              <button
                onClick={() => handleSaveEdit(comment.id)}
                disabled={updateMutation.isPending}
                style={{ ...styles.button, ...styles.primaryButton }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingComment(null);
                  setEditText('');
                }}
                style={{ ...styles.button, ...styles.secondaryButton }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p style={styles.commentContent}>{comment.content}</p>
        )}

        {comment.updated_at !== comment.created_at && !isEditing && (
          <span style={styles.editedIndicator}>(edited)</span>
        )}

        <div style={styles.commentActions}>
          {!isReply && !comment.is_resolved && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReplyingTo(isReplying ? null : comment.id);
                setReplyText('');
              }}
              style={styles.actionLink}
            >
              Reply
            </button>
          )}
          {isOwner && !isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingComment(comment.id);
                setEditText(comment.content);
              }}
              style={styles.actionLink}
            >
              Edit
            </button>
          )}
          {isOwner && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this comment?')) {
                  deleteMutation.mutate(comment.id);
                }
              }}
              style={{ ...styles.actionLink, ...styles.deleteLink }}
            >
              Delete
            </button>
          )}
          {!isReply && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                resolveMutation.mutate({
                  commentId: comment.id,
                  resolved: !comment.is_resolved,
                });
              }}
              style={styles.actionLink}
            >
              {comment.is_resolved ? 'Reopen' : 'Resolve'}
            </button>
          )}
        </div>

        {/* Reply form */}
        {isReplying && (
          <div style={styles.replyForm}>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              style={styles.textarea}
              autoFocus
            />
            <div style={styles.replyActions}>
              <button
                onClick={() => handleSubmitReply(comment.id)}
                disabled={createMutation.isPending || !replyText.trim()}
                style={{ ...styles.button, ...styles.primaryButton }}
              >
                Reply
              </button>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyText('');
                }}
                style={{ ...styles.button, ...styles.secondaryButton }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Nested replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div style={styles.replies}>
            {comment.replies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <span>Loading comments...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <span>Failed to load comments</span>
        </div>
      </div>
    );
  }

  const comments = data?.comments || [];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>Comments</h3>
        <div style={styles.headerActions}>
          <span style={styles.commentCount}>
            {data?.unresolved_count || 0} unresolved
          </span>
          <label style={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              style={styles.checkbox}
            />
            Show resolved
          </label>
        </div>
      </div>

      {/* New comment form */}
      <form onSubmit={handleSubmitComment} style={styles.newCommentForm}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={
            selectedPosition
              ? 'Add a comment for selected text...'
              : selectedChangeId
              ? 'Add a comment for this change...'
              : 'Add a general comment...'
          }
          style={styles.textarea}
        />
        {selectedPosition && (
          <div style={styles.selectionIndicator}>
            Commenting on selected text (position {selectedPosition.start}-{selectedPosition.end})
          </div>
        )}
        {selectedChangeId && (
          <div style={styles.selectionIndicator}>
            Commenting on a tracked change
          </div>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending || !newComment.trim()}
          style={{ ...styles.button, ...styles.primaryButton, ...styles.submitButton }}
        >
          {createMutation.isPending ? 'Adding...' : 'Add Comment'}
        </button>
      </form>

      {/* Comments list */}
      <div style={styles.commentsList}>
        {comments.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={styles.emptyIcon}>💬</span>
            <p>No comments yet</p>
            <p style={styles.emptyHint}>
              Start a discussion by adding a comment above.
            </p>
          </div>
        ) : (
          comments.map((comment) => renderComment(comment))
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
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  commentCount: {
    fontSize: '13px',
    color: '#6b7280',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    color: '#374151',
    cursor: 'pointer',
  },
  checkbox: {
    cursor: 'pointer',
  },
  newCommentForm: {
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
  },
  textarea: {
    width: '100%',
    minHeight: '80px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  selectionIndicator: {
    marginTop: '8px',
    padding: '6px 10px',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    borderRadius: '4px',
    fontSize: '12px',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
  },
  submitButton: {
    marginTop: '10px',
    width: '100%',
  },
  commentsList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  comment: {
    padding: '12px',
    marginBottom: '8px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#fff',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  reply: {
    marginLeft: '24px',
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  resolvedComment: {
    opacity: 0.6,
    backgroundColor: '#f3f4f6',
  },
  commentHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 600,
  },
  commentMeta: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  authorName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#111827',
  },
  commentTime: {
    fontSize: '12px',
    color: '#6b7280',
  },
  resolvedBadge: {
    padding: '2px 8px',
    backgroundColor: '#d4edda',
    color: '#155724',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
  },
  commentContent: {
    fontSize: '14px',
    lineHeight: 1.5,
    color: '#374151',
    margin: '0 0 8px 0',
    whiteSpace: 'pre-wrap',
  },
  editedIndicator: {
    fontSize: '12px',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  commentActions: {
    display: 'flex',
    gap: '12px',
    paddingTop: '8px',
    borderTop: '1px solid #f3f4f6',
  },
  actionLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '13px',
    color: '#6b7280',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  deleteLink: {
    color: '#ef4444',
  },
  editForm: {
    marginBottom: '8px',
  },
  editActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  replyForm: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #e5e7eb',
  },
  replyActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  replies: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #f3f4f6',
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

export default CommentPanel;
