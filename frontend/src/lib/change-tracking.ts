// Change tracking API functions
import { apiClient } from './api';
import type {
  DocumentChange,
  DocumentComment,
  ChangesListResponse,
  CommentsListResponse,
  CreateChangeRequest,
  CreateCommentRequest,
  VersionCompareResponse,
  ChangeStatus,
} from '../types/demand-letter';

// ============= CHANGE FUNCTIONS =============

export async function getChanges(
  demandLetterId: string,
  status?: ChangeStatus
): Promise<ChangesListResponse> {
  const params = status ? { status } : {};
  const response = await apiClient.get<ChangesListResponse>(
    `/api/change-tracking/${demandLetterId}/changes`,
    { params }
  );
  return response.data;
}

export async function createChange(
  demandLetterId: string,
  data: CreateChangeRequest
): Promise<DocumentChange> {
  const response = await apiClient.post<DocumentChange>(
    `/api/change-tracking/${demandLetterId}/changes`,
    data
  );
  return response.data;
}

export async function reviewChange(
  demandLetterId: string,
  changeId: string,
  action: 'accept' | 'reject'
): Promise<DocumentChange> {
  const response = await apiClient.post<DocumentChange>(
    `/api/change-tracking/${demandLetterId}/changes/${changeId}/review`,
    { action }
  );
  return response.data;
}

export async function bulkReviewChanges(
  demandLetterId: string,
  changeIds: string[],
  action: 'accept' | 'reject'
): Promise<{ message: string; updated_count: number }> {
  const response = await apiClient.post<{ message: string; updated_count: number }>(
    `/api/change-tracking/${demandLetterId}/changes/bulk-review`,
    { action, change_ids: changeIds }
  );
  return response.data;
}

export async function deleteChange(
  demandLetterId: string,
  changeId: string
): Promise<void> {
  await apiClient.delete(`/api/change-tracking/${demandLetterId}/changes/${changeId}`);
}

// ============= COMMENT FUNCTIONS =============

export async function getComments(
  demandLetterId: string,
  includeResolved = false
): Promise<CommentsListResponse> {
  const response = await apiClient.get<CommentsListResponse>(
    `/api/change-tracking/${demandLetterId}/comments`,
    { params: { include_resolved: includeResolved } }
  );
  return response.data;
}

export async function createComment(
  demandLetterId: string,
  data: CreateCommentRequest
): Promise<DocumentComment> {
  const response = await apiClient.post<DocumentComment>(
    `/api/change-tracking/${demandLetterId}/comments`,
    data
  );
  return response.data;
}

export async function updateComment(
  demandLetterId: string,
  commentId: string,
  content: string
): Promise<DocumentComment> {
  const response = await apiClient.patch<DocumentComment>(
    `/api/change-tracking/${demandLetterId}/comments/${commentId}`,
    { content }
  );
  return response.data;
}

export async function resolveComment(
  demandLetterId: string,
  commentId: string,
  resolved: boolean
): Promise<DocumentComment> {
  const response = await apiClient.post<DocumentComment>(
    `/api/change-tracking/${demandLetterId}/comments/${commentId}/resolve`,
    { resolved }
  );
  return response.data;
}

export async function deleteComment(
  demandLetterId: string,
  commentId: string
): Promise<void> {
  await apiClient.delete(`/api/change-tracking/${demandLetterId}/comments/${commentId}`);
}

// ============= VERSION COMPARISON =============

export async function compareVersions(
  demandLetterId: string,
  fromVersion: number,
  toVersion: number
): Promise<VersionCompareResponse> {
  const response = await apiClient.get<VersionCompareResponse>(
    `/api/change-tracking/${demandLetterId}/versions/compare`,
    { params: { from: fromVersion, to: toVersion } }
  );
  return response.data;
}

// ============= DIFF UTILITIES =============

export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

// Simple word-level diff algorithm
export function computeDiff(oldText: string, newText: string): DiffSegment[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const result: DiffSegment[] = [];

  // Use longest common subsequence approach
  const lcsMatrix = createLCSMatrix(oldWords, newWords);

  let i = oldWords.length;
  let j = newWords.length;
  const lcsResult: DiffSegment[] = [];

  while (i > 0 && j > 0) {
    if (oldWords[i - 1] === newWords[j - 1]) {
      lcsResult.unshift({ type: 'equal', text: oldWords[i - 1] });
      i--;
      j--;
    } else if (lcsMatrix[i - 1][j] >= lcsMatrix[i][j - 1]) {
      lcsResult.unshift({ type: 'delete', text: oldWords[i - 1] });
      i--;
    } else {
      lcsResult.unshift({ type: 'insert', text: newWords[j - 1] });
      j--;
    }
  }

  // Add remaining old words as deletions
  while (i > 0) {
    lcsResult.unshift({ type: 'delete', text: oldWords[i - 1] });
    i--;
  }

  // Add remaining new words as insertions
  while (j > 0) {
    lcsResult.unshift({ type: 'insert', text: newWords[j - 1] });
    j--;
  }

  // Merge consecutive segments of the same type
  for (const segment of lcsResult) {
    const last = result[result.length - 1];
    if (last && last.type === segment.type) {
      last.text += segment.text;
    } else {
      result.push({ ...segment });
    }
  }

  return result;
}

function createLCSMatrix(a: string[], b: string[]): number[][] {
  const matrix: number[][] = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1).fill(0));

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  return matrix;
}

// Convert diff segments to HTML with highlighting
export function diffToHtml(diff: DiffSegment[]): string {
  return diff
    .map((segment) => {
      switch (segment.type) {
        case 'insert':
          return `<span class="diff-insert" style="background-color: #d4edda; color: #155724; text-decoration: none;">${escapeHtml(segment.text)}</span>`;
        case 'delete':
          return `<span class="diff-delete" style="background-color: #f8d7da; color: #721c24; text-decoration: line-through;">${escapeHtml(segment.text)}</span>`;
        default:
          return escapeHtml(segment.text);
      }
    })
    .join('');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Get diff statistics
export function getDiffStats(diff: DiffSegment[]): {
  insertions: number;
  deletions: number;
  unchanged: number;
} {
  return diff.reduce(
    (stats, segment) => {
      const wordCount = segment.text.trim().split(/\s+/).filter(w => w).length;
      switch (segment.type) {
        case 'insert':
          stats.insertions += wordCount;
          break;
        case 'delete':
          stats.deletions += wordCount;
          break;
        default:
          stats.unchanged += wordCount;
      }
      return stats;
    },
    { insertions: 0, deletions: 0, unchanged: 0 }
  );
}
