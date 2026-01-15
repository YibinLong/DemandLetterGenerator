import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap, useEscapeKey } from '../../lib/accessibility';

interface HelpArticle {
  id: string;
  title: string;
  content: ReactNode;
  category?: string;
  keywords?: string[];
}

interface HelpContextValue {
  isOpen: boolean;
  openHelp: (articleId?: string) => void;
  closeHelp: () => void;
  currentArticle: string | null;
  setCurrentArticle: (id: string | null) => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function useHelp() {
  const context = useContext(HelpContext);
  if (!context) {
    throw new Error('useHelp must be used within a HelpProvider');
  }
  return context;
}

interface HelpProviderProps {
  children: ReactNode;
  articles?: HelpArticle[];
}

// Default help articles
const DEFAULT_ARTICLES: HelpArticle[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    category: 'Basics',
    keywords: ['start', 'begin', 'new', 'introduction'],
    content: (
      <>
        <p>Welcome to the Demand Letter Generator! This guide will help you get started.</p>
        <h4>Quick Start</h4>
        <ol>
          <li><strong>Upload Documents</strong> - Start by uploading your source documents (medical records, police reports, bills, etc.)</li>
          <li><strong>Create a Template</strong> - Optionally create a template to maintain consistency</li>
          <li><strong>Generate Letter</strong> - Use AI to generate a draft demand letter from your documents</li>
          <li><strong>Refine & Export</strong> - Edit the draft, refine with AI, and export to Word</li>
        </ol>
      </>
    ),
  },
  {
    id: 'uploading-documents',
    title: 'Uploading Documents',
    category: 'Documents',
    keywords: ['upload', 'file', 'pdf', 'docx', 'document'],
    content: (
      <>
        <p>Learn how to upload and manage your source documents.</p>
        <h4>Supported Formats</h4>
        <ul>
          <li><strong>PDF</strong> - Portable Document Format</li>
          <li><strong>DOCX</strong> - Microsoft Word Documents</li>
          <li><strong>TXT</strong> - Plain Text Files</li>
        </ul>
        <h4>How to Upload</h4>
        <ol>
          <li>Navigate to the Documents page</li>
          <li>Drag and drop files or click to browse</li>
          <li>Add optional case reference and tags</li>
          <li>Click Upload to process your files</li>
        </ol>
        <p className="help-tip">Tip: You can upload multiple files at once!</p>
      </>
    ),
  },
  {
    id: 'generating-letters',
    title: 'Generating Demand Letters',
    category: 'Demand Letters',
    keywords: ['generate', 'create', 'ai', 'draft', 'letter'],
    content: (
      <>
        <p>Create AI-powered demand letters from your source documents.</p>
        <h4>Generation Process</h4>
        <ol>
          <li><strong>Select Documents</strong> - Choose which documents to include</li>
          <li><strong>Enter Case Info</strong> - Provide case details (client name, defendant, etc.)</li>
          <li><strong>Configure Options</strong> - Set AI model and special instructions</li>
          <li><strong>Generate</strong> - Wait for AI to create your draft</li>
        </ol>
        <h4>Tips for Better Results</h4>
        <ul>
          <li>Include all relevant source documents</li>
          <li>Provide complete case information</li>
          <li>Use specific instructions for the AI</li>
        </ul>
      </>
    ),
  },
  {
    id: 'templates',
    title: 'Using Templates',
    category: 'Templates',
    keywords: ['template', 'reuse', 'format', 'consistent'],
    content: (
      <>
        <p>Templates help maintain consistency across your demand letters.</p>
        <h4>Creating Templates</h4>
        <ol>
          <li>Go to the Templates page</li>
          <li>Click "Create Template"</li>
          <li>Use placeholders like {"{{client_name}}"} for dynamic content</li>
          <li>Save and categorize your template</li>
        </ol>
        <h4>Available Placeholders</h4>
        <ul>
          <li><code>{"{{client_name}}"}</code> - Client's full name</li>
          <li><code>{"{{incident_date}}"}</code> - Date of incident</li>
          <li><code>{"{{defendant_name}}"}</code> - Defendant's name</li>
          <li><code>{"{{claim_amount}}"}</code> - Claimed damages amount</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ai-refinement',
    title: 'AI Refinement',
    category: 'AI Features',
    keywords: ['refine', 'improve', 'ai', 'edit', 'instructions'],
    content: (
      <>
        <p>Use AI to refine and improve your demand letters.</p>
        <h4>How to Refine</h4>
        <ol>
          <li>Open a demand letter in the editor</li>
          <li>Click the "Refine" button</li>
          <li>Enter your instructions (e.g., "Make the tone more formal")</li>
          <li>Review and apply the changes</li>
        </ol>
        <h4>Example Instructions</h4>
        <ul>
          <li>"Emphasize the medical expenses more"</li>
          <li>"Add more detail about the incident"</li>
          <li>"Make it shorter and more concise"</li>
          <li>"Use a more persuasive tone"</li>
        </ul>
      </>
    ),
  },
  {
    id: 'collaboration',
    title: 'Real-Time Collaboration',
    category: 'Collaboration',
    keywords: ['collaborate', 'share', 'team', 'edit', 'together'],
    content: (
      <>
        <p>Work together on demand letters in real-time.</p>
        <h4>Collaboration Features</h4>
        <ul>
          <li><strong>Live Editing</strong> - See changes as they happen</li>
          <li><strong>Presence Indicators</strong> - See who's viewing the document</li>
          <li><strong>Change Tracking</strong> - Review all modifications</li>
          <li><strong>Comments</strong> - Add notes and feedback</li>
        </ul>
        <h4>Sharing Documents</h4>
        <ol>
          <li>Open the document you want to share</li>
          <li>Click the "Share" button</li>
          <li>Enter email addresses of collaborators</li>
          <li>Set permission levels (view/edit)</li>
        </ol>
      </>
    ),
  },
  {
    id: 'exporting',
    title: 'Exporting Documents',
    category: 'Export',
    keywords: ['export', 'download', 'word', 'docx', 'pdf'],
    content: (
      <>
        <p>Export your completed demand letters to various formats.</p>
        <h4>Export Options</h4>
        <ul>
          <li><strong>Word Document (DOCX)</strong> - Fully editable Microsoft Word format</li>
          <li><strong>PDF</strong> - Fixed-format for printing and sharing</li>
        </ul>
        <h4>Export Settings</h4>
        <ul>
          <li>Choose font family and size</li>
          <li>Set page margins</li>
          <li>Include or exclude letterhead</li>
          <li>Add page numbers</li>
        </ul>
      </>
    ),
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    category: 'Tips',
    keywords: ['keyboard', 'shortcut', 'hotkey', 'quick'],
    content: (
      <>
        <p>Use keyboard shortcuts to work more efficiently.</p>
        <h4>General Shortcuts</h4>
        <table className="help-shortcuts-table">
          <tbody>
            <tr><td><kbd>Ctrl/Cmd + S</kbd></td><td>Save document</td></tr>
            <tr><td><kbd>Ctrl/Cmd + Z</kbd></td><td>Undo</td></tr>
            <tr><td><kbd>Ctrl/Cmd + Shift + Z</kbd></td><td>Redo</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Close dialogs/panels</td></tr>
          </tbody>
        </table>
        <h4>Editor Shortcuts</h4>
        <table className="help-shortcuts-table">
          <tbody>
            <tr><td><kbd>Ctrl/Cmd + B</kbd></td><td>Bold</td></tr>
            <tr><td><kbd>Ctrl/Cmd + I</kbd></td><td>Italic</td></tr>
            <tr><td><kbd>Ctrl/Cmd + U</kbd></td><td>Underline</td></tr>
          </tbody>
        </table>
      </>
    ),
  },
];

export function HelpProvider({ children, articles = DEFAULT_ARTICLES }: HelpProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentArticle, setCurrentArticle] = useState<string | null>(null);

  const openHelp = useCallback((articleId?: string) => {
    setCurrentArticle(articleId || null);
    setIsOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <HelpContext.Provider
      value={{
        isOpen,
        openHelp,
        closeHelp,
        currentArticle,
        setCurrentArticle,
      }}
    >
      {children}
      {isOpen && <HelpPanelOverlay articles={articles} />}
    </HelpContext.Provider>
  );
}

interface HelpPanelOverlayProps {
  articles: HelpArticle[];
}

function HelpPanelOverlay({ articles }: HelpPanelOverlayProps) {
  const { closeHelp, currentArticle, setCurrentArticle } = useHelp();
  const [searchQuery, setSearchQuery] = useState('');
  const panelRef = useFocusTrap<HTMLDivElement>(true);

  useEscapeKey(closeHelp, true);

  // Group articles by category
  const categories = articles.reduce<Record<string, HelpArticle[]>>((acc, article) => {
    const category = article.category || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(article);
    return acc;
  }, {});

  // Filter articles based on search
  const filteredArticles = searchQuery.trim()
    ? articles.filter(
        (article) =>
          article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          article.keywords?.some((k) => k.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : null;

  const selectedArticle = currentArticle ? articles.find((a) => a.id === currentArticle) : null;

  return createPortal(
    <div className="help-panel-overlay">
      <div className="help-panel-backdrop" onClick={closeHelp} aria-hidden="true" />
      <div
        ref={panelRef}
        className="help-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Help documentation"
      >
        <div className="help-panel__header">
          <h2>Help & Documentation</h2>
          <button
            type="button"
            className="help-panel__close"
            onClick={closeHelp}
            aria-label="Close help panel"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="help-panel__search">
          <svg
            className="help-panel__search-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search help articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search help articles"
          />
        </div>

        <div className="help-panel__content">
          {selectedArticle ? (
            <div className="help-panel__article">
              <button
                type="button"
                className="help-panel__back"
                onClick={() => setCurrentArticle(null)}
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
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back to articles
              </button>
              <h3>{selectedArticle.title}</h3>
              <div className="help-panel__article-content">{selectedArticle.content}</div>
            </div>
          ) : filteredArticles ? (
            <div className="help-panel__search-results">
              <h3>Search Results ({filteredArticles.length})</h3>
              {filteredArticles.length === 0 ? (
                <p className="help-panel__no-results">No articles found for "{searchQuery}"</p>
              ) : (
                <ul className="help-panel__list">
                  {filteredArticles.map((article) => (
                    <li key={article.id}>
                      <button
                        type="button"
                        className="help-panel__list-item"
                        onClick={() => setCurrentArticle(article.id)}
                      >
                        <span className="help-panel__list-title">{article.title}</span>
                        {article.category && (
                          <span className="help-panel__list-category">{article.category}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="help-panel__categories">
              {Object.entries(categories).map(([category, categoryArticles]) => (
                <div key={category} className="help-panel__category">
                  <h3>{category}</h3>
                  <ul className="help-panel__list">
                    {categoryArticles.map((article) => (
                      <li key={article.id}>
                        <button
                          type="button"
                          className="help-panel__list-item"
                          onClick={() => setCurrentArticle(article.id)}
                        >
                          <span className="help-panel__list-title">{article.title}</span>
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
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .help-panel-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          justify-content: flex-end;
        }

        .help-panel-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.3);
          animation: helpFadeIn 0.2s ease;
        }

        @keyframes helpFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .help-panel {
          position: relative;
          width: 420px;
          max-width: 100%;
          height: 100%;
          background: var(--bg-primary, #ffffff);
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          animation: helpSlideIn 0.3s ease;
        }

        @keyframes helpSlideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .help-panel__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-primary, #e5e7eb);
        }

        .help-panel__header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .help-panel__close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 6px;
          color: var(--text-tertiary, #9ca3af);
          cursor: pointer;
          transition: all 0.15s;
        }

        .help-panel__close:hover {
          background: var(--bg-secondary, #f3f4f6);
          color: var(--text-primary, #111827);
        }

        .help-panel__search {
          position: relative;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border-primary, #e5e7eb);
        }

        .help-panel__search-icon {
          position: absolute;
          left: 36px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-tertiary, #9ca3af);
          pointer-events: none;
        }

        .help-panel__search input {
          width: 100%;
          padding: 10px 12px 10px 40px;
          background: var(--bg-secondary, #f3f4f6);
          border: 1px solid transparent;
          border-radius: 8px;
          font-size: 14px;
          color: var(--text-primary, #111827);
          transition: all 0.15s;
        }

        .help-panel__search input:focus {
          outline: none;
          background: var(--bg-primary, #ffffff);
          border-color: var(--color-primary, #3b82f6);
        }

        .help-panel__search input::placeholder {
          color: var(--text-tertiary, #9ca3af);
        }

        .help-panel__content {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .help-panel__categories {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .help-panel__category h3,
        .help-panel__search-results h3 {
          margin: 0 0 12px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-tertiary, #9ca3af);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .help-panel__list {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .help-panel__list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          padding: 12px 16px;
          background: var(--bg-secondary, #f3f4f6);
          border: none;
          border-radius: 8px;
          font-size: 14px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s;
          margin-bottom: 8px;
        }

        .help-panel__list-item:hover {
          background: var(--color-primary-light, #eff6ff);
        }

        .help-panel__list-title {
          color: var(--text-primary, #111827);
          font-weight: 500;
        }

        .help-panel__list-category {
          font-size: 12px;
          color: var(--text-tertiary, #9ca3af);
          background: var(--bg-primary, #ffffff);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .help-panel__list-item svg {
          color: var(--text-tertiary, #9ca3af);
        }

        .help-panel__no-results {
          color: var(--text-secondary, #6b7280);
          font-style: italic;
        }

        /* Article view */
        .help-panel__article {
          animation: helpFadeIn 0.2s ease;
        }

        .help-panel__back {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 0;
          background: transparent;
          border: none;
          font-size: 13px;
          color: var(--color-primary, #3b82f6);
          cursor: pointer;
          margin-bottom: 16px;
        }

        .help-panel__back:hover {
          text-decoration: underline;
        }

        .help-panel__article h3 {
          margin: 0 0 16px;
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .help-panel__article-content {
          font-size: 14px;
          line-height: 1.7;
          color: var(--text-secondary, #6b7280);
        }

        .help-panel__article-content h4 {
          margin: 20px 0 12px;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .help-panel__article-content p {
          margin-bottom: 12px;
        }

        .help-panel__article-content ul,
        .help-panel__article-content ol {
          margin: 12px 0;
          padding-left: 24px;
        }

        .help-panel__article-content li {
          margin-bottom: 8px;
        }

        .help-panel__article-content code {
          background: var(--bg-secondary, #f3f4f6);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 13px;
        }

        .help-panel__article-content .help-tip {
          background: var(--color-primary-light, #eff6ff);
          padding: 12px 16px;
          border-radius: 8px;
          border-left: 3px solid var(--color-primary, #3b82f6);
          margin-top: 16px;
        }

        .help-shortcuts-table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
        }

        .help-shortcuts-table td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-primary, #e5e7eb);
        }

        .help-shortcuts-table td:first-child {
          width: 50%;
        }

        .help-shortcuts-table kbd {
          display: inline-block;
          padding: 4px 8px;
          background: var(--bg-secondary, #f3f4f6);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 4px;
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 12px;
        }

        /* Dark theme */
        :root.dark .help-panel,
        [data-theme='dark'] .help-panel {
          background: var(--bg-primary, #1f2937);
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>,
    document.body
  );
}

/**
 * HelpButton - A floating help button to open the help panel
 */
interface HelpButtonProps {
  position?: 'bottom-right' | 'bottom-left';
  className?: string;
}

export function HelpButton({ position = 'bottom-right', className = '' }: HelpButtonProps) {
  const { openHelp } = useHelp();

  return (
    <button
      type="button"
      className={`help-button help-button--${position} ${className}`}
      onClick={() => openHelp()}
      aria-label="Open help documentation"
    >
      <svg
        width="24"
        height="24"
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
        .help-button {
          position: fixed;
          width: 56px;
          height: 56px;
          background: var(--color-primary, #3b82f6);
          color: white;
          border: none;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
          cursor: pointer;
          transition: all 0.2s;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .help-button--bottom-right {
          bottom: 24px;
          right: 24px;
        }

        .help-button--bottom-left {
          bottom: 24px;
          left: 24px;
        }

        .help-button:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
        }

        .help-button:active {
          transform: scale(0.95);
        }

        .help-button:focus-visible {
          outline: 2px solid white;
          outline-offset: 2px;
        }

        @media (max-width: 640px) {
          .help-button {
            width: 48px;
            height: 48px;
          }

          .help-button--bottom-right {
            bottom: 16px;
            right: 16px;
          }

          .help-button--bottom-left {
            bottom: 16px;
            left: 16px;
          }
        }
      `}</style>
    </button>
  );
}

export default HelpProvider;
