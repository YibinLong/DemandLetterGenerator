import { useState, useEffect, useCallback } from 'react';
import type { CollaborationUser, FirmUser, InviteDetails } from '../lib/collaboration';
import {
  createCollaborationInvite,
  getCollaborationInvites,
  revokeCollaborationInvite,
  searchFirmUsers,
  getActiveCollaborators,
} from '../lib/collaboration';

export interface ShareDialogProps {
  demandLetterId: string;
  demandLetterTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareDialog({
  demandLetterId,
  demandLetterTitle,
  isOpen,
  onClose,
}: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<'invite' | 'active'>('invite');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FirmUser[]>([]);
  const [invites, setInvites] = useState<InviteDetails[]>([]);
  const [activeCollaborators, setActiveCollaborators] = useState<CollaborationUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [permission, setPermission] = useState<'view' | 'edit'>('edit');

  // Fetch invites and collaborators when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchInvites();
      fetchActiveCollaborators();
    }
  }, [isOpen, demandLetterId]);

  // Search users as typing
  useEffect(() => {
    const searchDebounce = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        try {
          const { users } = await searchFirmUsers(searchQuery);
          setSearchResults(users);
        } catch {
          setSearchResults([]);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(searchDebounce);
  }, [searchQuery]);

  const fetchInvites = async () => {
    try {
      const { invites: data } = await getCollaborationInvites(demandLetterId);
      setInvites(data);
    } catch (err) {
      console.error('Failed to fetch invites:', err);
    }
  };

  const fetchActiveCollaborators = async () => {
    try {
      const { collaborators } = await getActiveCollaborators(demandLetterId);
      setActiveCollaborators(collaborators);
    } catch (err) {
      console.error('Failed to fetch collaborators:', err);
    }
  };

  const handleInviteUser = useCallback(async (user: FirmUser) => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await createCollaborationInvite(demandLetterId, {
        user_id: user.id,
        permission,
      });

      if (result.already_exists) {
        setSuccessMessage(`${user.name} already has an invite`);
      } else {
        setSuccessMessage(`Invited ${user.name} to collaborate`);
      }

      setSearchQuery('');
      setSearchResults([]);
      fetchInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setIsLoading(false);
    }
  }, [demandLetterId, permission]);

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await revokeCollaborationInvite(demandLetterId, inviteId);
      setInvites(prev => prev.filter(inv => inv.id !== inviteId));
      setSuccessMessage('Invite revoked');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite');
    } finally {
      setIsLoading(false);
    }
  }, [demandLetterId]);

  if (!isOpen) return null;

  return (
    <div className="share-dialog-overlay" onClick={onClose}>
      <div className="share-dialog" onClick={e => e.stopPropagation()}>
        <div className="share-dialog-header">
          <h2>Share "{demandLetterTitle}"</h2>
          <button className="close-button" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        <div className="share-dialog-tabs">
          <button
            className={`tab ${activeTab === 'invite' ? 'active' : ''}`}
            onClick={() => setActiveTab('invite')}
          >
            Invite People
          </button>
          <button
            className={`tab ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active Now ({activeCollaborators.length})
          </button>
        </div>

        <div className="share-dialog-content">
          {error && <div className="error-message">{error}</div>}
          {successMessage && <div className="success-message">{successMessage}</div>}

          {activeTab === 'invite' && (
            <div className="invite-section">
              <div className="invite-controls">
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <select
                  value={permission}
                  onChange={e => setPermission(e.target.value as 'view' | 'edit')}
                  className="permission-select"
                >
                  <option value="edit">Can edit</option>
                  <option value="view">Can view</option>
                </select>
              </div>

              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map(user => (
                    <div key={user.id} className="user-result">
                      <div className="user-info">
                        <span className="user-name">{user.name}</span>
                        <span className="user-email">{user.email}</span>
                        <span className="user-role">{user.role}</span>
                      </div>
                      <button
                        className="invite-button"
                        onClick={() => handleInviteUser(user)}
                        disabled={isLoading}
                      >
                        Invite
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery.length > 0 && searchQuery.length < 2 && (
                <p className="search-hint">Type at least 2 characters to search</p>
              )}

              {invites.length > 0 && (
                <div className="pending-invites">
                  <h3>Pending Invites</h3>
                  {invites.map(invite => (
                    <div key={invite.id} className="invite-item">
                      <div className="invite-info">
                        <span className="invite-name">
                          {invite.invited_name || invite.invited_email}
                        </span>
                        <span className="invite-meta">
                          {invite.permission === 'edit' ? 'Can edit' : 'Can view'}
                          {invite.accepted && ' - Accepted'}
                        </span>
                        <span className="invite-by">Invited by {invite.invited_by}</span>
                      </div>
                      {!invite.accepted && (
                        <button
                          className="revoke-button"
                          onClick={() => handleRevokeInvite(invite.id)}
                          disabled={isLoading}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {searchQuery.length === 0 && invites.length === 0 && (
                <p className="empty-state">
                  Search for team members to invite them to collaborate on this document.
                </p>
              )}
            </div>
          )}

          {activeTab === 'active' && (
            <div className="active-section">
              {activeCollaborators.length === 0 ? (
                <p className="empty-state">No one else is currently viewing this document.</p>
              ) : (
                <div className="collaborator-list">
                  {activeCollaborators.map(user => (
                    <div key={user.id} className="collaborator-item">
                      <div
                        className="collaborator-avatar"
                        style={{ backgroundColor: user.color }}
                      >
                        {user.first_name[0]}{user.last_name[0]}
                      </div>
                      <div className="collaborator-info">
                        <span className="collaborator-name">
                          {user.first_name} {user.last_name}
                        </span>
                        <span className="collaborator-email">{user.email}</span>
                      </div>
                      <div className="collaborator-status">
                        <span className="status-dot" />
                        Online
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <style>{`
          .share-dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .share-dialog {
            background: white;
            border-radius: 12px;
            width: 100%;
            max-width: 500px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          }

          .share-dialog-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid #e5e7eb;
          }

          .share-dialog-header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #111827;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 400px;
          }

          .close-button {
            background: none;
            border: none;
            font-size: 24px;
            color: #6b7280;
            cursor: pointer;
            padding: 0;
            line-height: 1;
          }

          .close-button:hover {
            color: #111827;
          }

          .share-dialog-tabs {
            display: flex;
            border-bottom: 1px solid #e5e7eb;
          }

          .tab {
            flex: 1;
            padding: 12px 16px;
            background: none;
            border: none;
            font-size: 14px;
            font-weight: 500;
            color: #6b7280;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
          }

          .tab:hover {
            color: #374151;
          }

          .tab.active {
            color: #3b82f6;
            border-bottom-color: #3b82f6;
          }

          .share-dialog-content {
            flex: 1;
            overflow-y: auto;
            padding: 16px 20px;
          }

          .error-message {
            background: #fef2f2;
            color: #dc2626;
            padding: 10px 12px;
            border-radius: 6px;
            margin-bottom: 16px;
            font-size: 14px;
          }

          .success-message {
            background: #f0fdf4;
            color: #16a34a;
            padding: 10px 12px;
            border-radius: 6px;
            margin-bottom: 16px;
            font-size: 14px;
          }

          .invite-controls {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
          }

          .search-input {
            flex: 1;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
          }

          .search-input:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          }

          .permission-select {
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            background: white;
            cursor: pointer;
          }

          .search-results {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 16px;
          }

          .user-result {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
          }

          .user-result:last-child {
            border-bottom: none;
          }

          .user-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .user-name {
            font-weight: 500;
            color: #111827;
          }

          .user-email {
            font-size: 13px;
            color: #6b7280;
          }

          .user-role {
            font-size: 12px;
            color: #9ca3af;
            text-transform: capitalize;
          }

          .invite-button {
            padding: 6px 14px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
          }

          .invite-button:hover:not(:disabled) {
            background: #2563eb;
          }

          .invite-button:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .search-hint {
            color: #9ca3af;
            font-size: 13px;
            text-align: center;
            margin: 20px 0;
          }

          .pending-invites h3 {
            font-size: 14px;
            font-weight: 600;
            color: #374151;
            margin: 0 0 12px;
          }

          .invite-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            background: #f9fafb;
            border-radius: 6px;
            margin-bottom: 8px;
          }

          .invite-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .invite-name {
            font-weight: 500;
            color: #111827;
          }

          .invite-meta {
            font-size: 12px;
            color: #6b7280;
          }

          .invite-by {
            font-size: 11px;
            color: #9ca3af;
          }

          .revoke-button {
            padding: 4px 10px;
            background: none;
            border: 1px solid #ef4444;
            color: #ef4444;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
          }

          .revoke-button:hover:not(:disabled) {
            background: #fef2f2;
          }

          .empty-state {
            text-align: center;
            color: #6b7280;
            padding: 40px 20px;
            font-size: 14px;
          }

          .collaborator-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .collaborator-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: #f9fafb;
            border-radius: 8px;
          }

          .collaborator-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
            color: white;
          }

          .collaborator-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .collaborator-name {
            font-weight: 500;
            color: #111827;
          }

          .collaborator-email {
            font-size: 13px;
            color: #6b7280;
          }

          .collaborator-status {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: #16a34a;
          }

          .status-dot {
            width: 8px;
            height: 8px;
            background: #22c55e;
            border-radius: 50%;
          }

          @media (max-width: 640px) {
            .share-dialog {
              margin: 16px;
              max-height: calc(100vh - 32px);
            }

            .invite-controls {
              flex-direction: column;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

export default ShareDialog;
