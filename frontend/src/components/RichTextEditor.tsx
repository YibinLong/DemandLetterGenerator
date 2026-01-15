import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';

export interface RichTextEditorProps {
  content: string;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
  showToolbar?: boolean;
  className?: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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

interface ToolbarDividerProps {}

function ToolbarDivider(_props: ToolbarDividerProps) {
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

export function RichTextEditor({
  content,
  onChange,
  onSave,
  placeholder = 'Start typing...',
  editable = true,
  autoSave = false,
  autoSaveDelay = 2000,
  showToolbar = true,
  className = '',
}: RichTextEditorProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef<string>(content);

  // Initialize editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: false,
      }),
    ],
    content: content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html);

      // Track unsaved changes
      if (html !== lastSavedContentRef.current) {
        setHasUnsavedChanges(true);
        setSaveStatus('idle');

        // Auto-save logic
        if (autoSave && onSave) {
          // Clear existing timeout
          if (autoSaveTimeoutRef.current) {
            window.clearTimeout(autoSaveTimeoutRef.current);
          }

          // Set new timeout for auto-save
          autoSaveTimeoutRef.current = window.setTimeout(() => {
            handleSave(html);
          }, autoSaveDelay);
        }
      }
    },
    editorProps: {
      attributes: {
        class: 'rich-text-content',
        spellcheck: 'true',
      },
    },
  });

  // Update editor content when prop changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
      lastSavedContentRef.current = content;
      setHasUnsavedChanges(false);
    }
  }, [content, editor]);

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

      // Reset status after showing "saved"
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
    // Clear any pending auto-save
    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }
    handleSave();
  }, [handleSave]);

  // Get plain text from editor
  const getPlainText = useCallback(() => {
    return editor?.getText() || '';
  }, [editor]);

  // Get HTML from editor
  const getHTML = useCallback(() => {
    return editor?.getHTML() || '';
  }, [editor]);

  // Expose methods via ref pattern using window
  useEffect(() => {
    // Store methods on window for external access if needed
    (window as unknown as { richTextEditor?: { save: () => void; getPlainText: () => string; getHTML: () => string } }).richTextEditor = {
      save: triggerSave,
      getPlainText,
      getHTML,
    };

    return () => {
      delete (window as unknown as { richTextEditor?: unknown }).richTextEditor;
    };
  }, [triggerSave, getPlainText, getHTML]);

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
    <div className={`rich-text-editor ${className}`}>
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
        .rich-text-editor {
          display: flex;
          flex-direction: column;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
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

        /* Text Alignment */
        .rich-text-content [style*="text-align: left"] {
          text-align: left;
        }
        .rich-text-content [style*="text-align: center"] {
          text-align: center;
        }
        .rich-text-content [style*="text-align: right"] {
          text-align: right;
        }
        .rich-text-content [style*="text-align: justify"] {
          text-align: justify;
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

        /* Focus state for the editor */
        .editor-container:focus-within {
          outline: none;
        }

        .rich-text-editor:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        /* Read-only state */
        .rich-text-editor.readonly .editor-container {
          background: #f9fafb;
        }

        .rich-text-editor.readonly .rich-text-content {
          color: #6b7280;
        }

        /* Responsive */
        @media (max-width: 640px) {
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

export default RichTextEditor;
