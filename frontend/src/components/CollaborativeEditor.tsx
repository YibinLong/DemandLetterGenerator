import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import type { CollaborationUser, CollaborationClient } from '../lib/collaboration';
import { getCollaborationClient } from '../lib/collaboration';

export interface CollaborativeEditorProps {
  demandLetterId: string;
  initialContent: string;
  currentUser: {
    id: string;
    name: string;
    color?: string;
  };
  onSave?: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
  showToolbar?: boolean;
  className?: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`toolbar-button ${isActive ? 'active' : ''}`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="toolbar-divider" />;
}

interface EditorToolbarProps {
  editor: Editor | null;
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  return (
    <div className="editor-toolbar">
      {/* Text Formatting */}
      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="Underline (Ctrl+U)"
        >
          <span style={{ textDecoration: 'underline' }}>U</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="Strikethrough"
        >
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          isActive={editor.isActive('highlight')}
          title="Highlight"
        >
          <span style={{ backgroundColor: '#fef08a', padding: '0 2px' }}>H</span>
        </ToolbarButton>
      </div>

      <ToolbarDivider />

      {/* Paragraph Styles */}
      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          isActive={editor.isActive('paragraph')}
          title="Normal text"
        >
          P
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          H3
        </ToolbarButton>
      </div>

      <ToolbarDivider />

      {/* Lists */}
      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          &#8226;
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered List"
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="Quote"
        >
          &ldquo;
        </ToolbarButton>
      </div>

      <ToolbarDivider />

      {/* Text Alignment */}
      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Align Left"
        >
          &#8676;
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Align Center"
        >
          &#8596;
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Align Right"
        >
          &#8677;
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          title="Justify"
        >
          &#9776;
        </ToolbarButton>
      </div>

      <ToolbarDivider />

      {/* Other Actions */}
      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          &#8212;
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          &#8634;
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Shift+Z)"
        >
          &#8635;
        </ToolbarButton>
      </div>
    </div>
  );
}

// Presence bar showing active collaborators
interface PresenceBarProps {
  users: CollaborationUser[];
  currentUserId: string;
  connectionStatus: ConnectionStatus;
}

function PresenceBar({ users, currentUserId, connectionStatus }: PresenceBarProps) {
  const otherUsers = users.filter(u => u.id !== currentUserId);

  return (
    <div className="presence-bar">
      <div className="connection-status">
        <span className={`status-indicator ${connectionStatus}`} />
        <span className="status-text">
          {connectionStatus === 'connected' ? 'Live' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
        </span>
      </div>

      {otherUsers.length > 0 && (
        <div className="collaborators">
          <span className="collaborators-label">Editing with:</span>
          <div className="user-avatars">
            {otherUsers.slice(0, 5).map(user => (
              <div
                key={user.id}
                className="user-avatar"
                style={{ backgroundColor: user.color }}
                title={`${user.first_name} ${user.last_name} (${user.email})`}
              >
                {user.first_name[0]}{user.last_name[0]}
              </div>
            ))}
            {otherUsers.length > 5 && (
              <div className="user-avatar more">+{otherUsers.length - 5}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CollaborativeEditor({
  demandLetterId,
  initialContent,
  currentUser,
  onSave,
  placeholder = 'Start typing...',
  editable = true,
  autoSave = false,
  autoSaveDelay = 2000,
  showToolbar = true,
  className = '',
}: CollaborativeEditorProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const autoSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef<string>(initialContent);
  const ydocRef = useRef<Y.Doc | null>(null);
  const clientRef = useRef<CollaborationClient | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const initializedRef = useRef(false);

  // Create Yjs document
  useEffect(() => {
    if (!ydocRef.current) {
      ydocRef.current = new Y.Doc();
    }
    return () => {
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }
    };
  }, []);

  // Setup collaboration connection
  useEffect(() => {
    if (!ydocRef.current || initializedRef.current) return;

    const setupCollaboration = async () => {
      setConnectionStatus('connecting');

      try {
        const client = getCollaborationClient();
        clientRef.current = client;

        // Connect to server
        await client.connect();
        setConnectionStatus('connected');

        // Setup event listeners
        client.on('room-users', ({ users }) => {
          setCollaborators(users);
        });

        client.on('user-joined', ({ user }) => {
          setCollaborators(prev => [...prev, user]);
        });

        client.on('user-left', ({ userId }) => {
          setCollaborators(prev => prev.filter(u => u.id !== userId));
        });

        client.on('disconnected', () => {
          setConnectionStatus('disconnected');
        });

        client.on('error', ({ message }) => {
          console.error('[Collaboration] Error:', message);
          setConnectionStatus('error');
        });

        // Join the document
        client.joinDocument(demandLetterId, ydocRef.current!);
        initializedRef.current = true;
      } catch (error) {
        console.error('[Collaboration] Failed to connect:', error);
        setConnectionStatus('error');
      }
    };

    setupCollaboration();

    return () => {
      if (clientRef.current) {
        clientRef.current.leaveDocument();
      }
      initializedRef.current = false;
    };
  }, [demandLetterId]);

  // Initialize editor with collaboration extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        undoRedo: false, // Disable built-in undo/redo, use Yjs for collaborative history
      }),
      Underline,
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
      ...(ydocRef.current ? [
        Collaboration.configure({
          document: ydocRef.current,
        }),
        CollaborationCursor.configure({
          provider: null, // We're using our own provider
          user: {
            name: currentUser.name,
            color: currentUser.color || '#3b82f6',
          },
        }),
      ] : []),
    ],
    content: initialContent,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();

      // Track unsaved changes
      if (html !== lastSavedContentRef.current) {
        setHasUnsavedChanges(true);
        setSaveStatus('idle');

        // Auto-save logic
        if (autoSave && onSave) {
          if (autoSaveTimeoutRef.current) {
            window.clearTimeout(autoSaveTimeoutRef.current);
          }
          autoSaveTimeoutRef.current = window.setTimeout(() => {
            handleSave(html);
          }, autoSaveDelay);
        }
      }

      // Update cursor position for other collaborators
      if (clientRef.current && connectionStatus === 'connected') {
        const { from, to } = editor.state.selection;
        clientRef.current.updateCursor({ anchor: from, head: to });
      }
    },
    onSelectionUpdate: ({ editor }) => {
      // Update cursor position for other collaborators
      if (clientRef.current && connectionStatus === 'connected') {
        const { from, to } = editor.state.selection;
        clientRef.current.updateCursor({ anchor: from, head: to });
      }
    },
    editorProps: {
      attributes: {
        class: 'rich-text-content',
        spellcheck: 'true',
      },
    },
  });

  // Store editor ref
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  // Cleanup auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Handle manual save
  const handleSave = useCallback(async (contentToSave?: string) => {
    if (!onSave) return;

    const html = contentToSave || editor?.getHTML() || '';

    setSaveStatus('saving');
    try {
      await onSave(html);
      lastSavedContentRef.current = html;
      setHasUnsavedChanges(false);
      setSaveStatus('saved');

      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('error');
    }
  }, [editor, onSave]);

  // Manual save trigger
  const triggerSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }
    handleSave();
  }, [handleSave]);

  // Save status indicator
  const renderSaveStatus = () => {
    if (!onSave) return null;

    return (
      <div className={`save-status ${saveStatus}`}>
        {saveStatus === 'saving' && (
          <>
            <span className="status-spinner" />
            Saving...
          </>
        )}
        {saveStatus === 'saved' && (
          <>
            <span className="status-check">&#10003;</span>
            Saved
          </>
        )}
        {saveStatus === 'error' && (
          <>
            <span className="status-error">&#10007;</span>
            Error saving
          </>
        )}
        {saveStatus === 'idle' && hasUnsavedChanges && (
          <span className="unsaved-indicator">Unsaved changes</span>
        )}
      </div>
    );
  };

  return (
    <div className={`collaborative-editor ${className}`}>
      <PresenceBar
        users={collaborators}
        currentUserId={currentUser.id}
        connectionStatus={connectionStatus}
      />

      {editable && showToolbar && <EditorToolbar editor={editor} />}

      <div className="editor-container">
        <EditorContent editor={editor} />
      </div>

      {editable && (
        <div className="editor-footer">
          {renderSaveStatus()}
          {onSave && hasUnsavedChanges && (
            <button
              type="button"
              onClick={triggerSave}
              className="manual-save-button"
              disabled={saveStatus === 'saving'}
            >
              Save Now
            </button>
          )}
        </div>
      )}

      <style>{`
        .collaborative-editor {
          display: flex;
          flex-direction: column;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }

        /* Presence Bar */
        .presence-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #f0f9ff;
          border-bottom: 1px solid #bae6fd;
          min-height: 40px;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #94a3b8;
        }

        .status-indicator.connected {
          background: #22c55e;
          animation: pulse 2s infinite;
        }

        .status-indicator.connecting {
          background: #fbbf24;
          animation: blink 1s infinite;
        }

        .status-indicator.error {
          background: #ef4444;
        }

        .status-indicator.disconnected {
          background: #94a3b8;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .status-text {
          font-size: 13px;
          font-weight: 500;
          color: #0369a1;
        }

        .collaborators {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .collaborators-label {
          font-size: 12px;
          color: #0369a1;
        }

        .user-avatars {
          display: flex;
          gap: -4px;
        }

        .user-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 600;
          color: white;
          border: 2px solid white;
          margin-left: -4px;
          cursor: default;
        }

        .user-avatar:first-child {
          margin-left: 0;
        }

        .user-avatar.more {
          background: #6b7280;
          font-size: 9px;
        }

        /* Toolbar Styles */
        .editor-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 8px 12px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .toolbar-group {
          display: flex;
          gap: 2px;
        }

        .toolbar-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .toolbar-button:hover:not(:disabled) {
          background: #f3f4f6;
          border-color: #9ca3af;
        }

        .toolbar-button.active {
          background: #3b82f6;
          border-color: #3b82f6;
          color: white;
        }

        .toolbar-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .toolbar-divider {
          width: 1px;
          height: 24px;
          margin: 4px 8px;
          background: #d1d5db;
        }

        /* Editor Container */
        .editor-container {
          flex: 1;
          min-height: 300px;
          overflow-y: auto;
        }

        .rich-text-content {
          padding: 16px 20px;
          min-height: 300px;
          outline: none;
          font-size: 14px;
          line-height: 1.7;
          color: #1f2937;
        }

        /* TipTap Editor Styles */
        .rich-text-content p {
          margin: 0 0 1em;
        }

        .rich-text-content h1 {
          font-size: 1.75em;
          font-weight: 700;
          margin: 0 0 0.5em;
          color: #111827;
        }

        .rich-text-content h2 {
          font-size: 1.5em;
          font-weight: 600;
          margin: 0 0 0.5em;
          color: #1f2937;
        }

        .rich-text-content h3 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 0 0 0.5em;
          color: #374151;
        }

        .rich-text-content ul,
        .rich-text-content ol {
          margin: 0 0 1em;
          padding-left: 1.5em;
        }

        .rich-text-content li {
          margin-bottom: 0.25em;
        }

        .rich-text-content blockquote {
          margin: 1em 0;
          padding: 0.5em 1em;
          border-left: 3px solid #3b82f6;
          background: #f9fafb;
          color: #4b5563;
          font-style: italic;
        }

        .rich-text-content hr {
          border: none;
          border-top: 2px solid #e5e7eb;
          margin: 1.5em 0;
        }

        .rich-text-content mark {
          background-color: #fef08a;
          padding: 0.1em 0.2em;
          border-radius: 2px;
        }

        .rich-text-content code {
          background: #f3f4f6;
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-family: 'SF Mono', Monaco, Consolas, monospace;
          font-size: 0.9em;
        }

        /* Placeholder */
        .rich-text-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }

        /* Collaboration Cursor Styles */
        .collaboration-cursor__caret {
          border-left: 2px solid;
          margin-left: -1px;
          margin-right: -1px;
          pointer-events: none;
          position: relative;
          word-break: normal;
        }

        .collaboration-cursor__label {
          border-radius: 3px 3px 3px 0;
          color: white;
          font-size: 11px;
          font-weight: 600;
          left: -2px;
          line-height: normal;
          padding: 2px 6px;
          position: absolute;
          top: -1.4em;
          user-select: none;
          white-space: nowrap;
        }

        /* Editor Footer */
        .editor-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          min-height: 40px;
        }

        .save-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #6b7280;
        }

        .save-status.saving {
          color: #3b82f6;
        }

        .save-status.saved {
          color: #10b981;
        }

        .save-status.error {
          color: #ef4444;
        }

        .status-spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .status-check {
          color: #10b981;
          font-weight: bold;
        }

        .status-error {
          color: #ef4444;
          font-weight: bold;
        }

        .unsaved-indicator {
          color: #f59e0b;
          font-style: italic;
        }

        .manual-save-button {
          padding: 6px 12px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .manual-save-button:hover:not(:disabled) {
          background: #2563eb;
        }

        .manual-save-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        /* Focus state */
        .collaborative-editor:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        /* Responsive */
        @media (max-width: 640px) {
          .presence-bar {
            flex-direction: column;
            gap: 8px;
            padding: 8px;
          }

          .collaborators-label {
            display: none;
          }

          .editor-toolbar {
            padding: 6px 8px;
            gap: 2px;
          }

          .toolbar-button {
            width: 28px;
            height: 28px;
            font-size: 12px;
          }

          .toolbar-divider {
            margin: 2px 4px;
          }

          .rich-text-content {
            padding: 12px 14px;
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}

export default CollaborativeEditor;
