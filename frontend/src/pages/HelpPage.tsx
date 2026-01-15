import { useState } from 'react';
import { useTour, ONBOARDING_STEPS } from '../components/common/OnboardingTour';

interface HelpSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  articles: {
    id: string;
    title: string;
    content: React.ReactNode;
  }[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    description: 'Learn the basics of using the Demand Letter Generator',
    articles: [
      {
        id: 'quick-start',
        title: 'Quick Start Guide',
        content: (
          <>
            <p>Welcome to the Demand Letter Generator! Follow these steps to create your first AI-powered demand letter:</p>
            <ol>
              <li><strong>Upload your documents</strong> - Go to the Documents page and upload your source materials (medical records, police reports, bills, etc.)</li>
              <li><strong>Create a new demand letter</strong> - Click "New Demand Letter" and select your uploaded documents</li>
              <li><strong>Enter case information</strong> - Provide details like client name, defendant, incident date, etc.</li>
              <li><strong>Generate the letter</strong> - Let AI create a draft based on your documents and information</li>
              <li><strong>Review and refine</strong> - Edit the draft and use AI refinement to improve specific sections</li>
              <li><strong>Export</strong> - Download your finished letter as a Word document</li>
            </ol>
          </>
        ),
      },
      {
        id: 'interface-overview',
        title: 'Interface Overview',
        content: (
          <>
            <p>The application is organized into several main sections:</p>
            <ul>
              <li><strong>Dashboard</strong> - Your home page showing recent activity and quick actions</li>
              <li><strong>Demand Letters</strong> - View, create, and manage your demand letters</li>
              <li><strong>Documents</strong> - Upload and organize source documents</li>
              <li><strong>Templates</strong> - Create reusable letter templates</li>
              <li><strong>AI Prompts</strong> - Customize AI behavior for refinements</li>
            </ul>
            <p>Use the sidebar on the left to navigate between sections. The top header provides access to your profile, theme settings, and help.</p>
          </>
        ),
      },
    ],
  },
  {
    id: 'demand-letters',
    title: 'Demand Letters',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    description: 'Create and manage AI-generated demand letters',
    articles: [
      {
        id: 'creating-letters',
        title: 'Creating a Demand Letter',
        content: (
          <>
            <p>Follow the step-by-step wizard to create a demand letter:</p>
            <h4>Step 1: Select Documents</h4>
            <p>Choose the source documents you want to include. Select all relevant medical records, police reports, bills, and other supporting documents.</p>
            <h4>Step 2: Case Information</h4>
            <p>Enter details about the case:</p>
            <ul>
              <li>Letter title (required)</li>
              <li>Case reference number</li>
              <li>Client name</li>
              <li>Incident date</li>
              <li>Defendant/recipient name</li>
              <li>Insurance company</li>
              <li>Claim number</li>
            </ul>
            <h4>Step 3: Generation Options</h4>
            <p>Configure how the letter should be generated:</p>
            <ul>
              <li><strong>Special instructions</strong> - Provide specific guidance to the AI</li>
              <li><strong>AI model</strong> - Choose between speed and quality</li>
              <li><strong>Streaming</strong> - Watch the letter being generated in real-time</li>
            </ul>
          </>
        ),
      },
      {
        id: 'refining-letters',
        title: 'Refining with AI',
        content: (
          <>
            <p>After generating a draft, you can refine specific aspects using AI:</p>
            <h4>How to Refine</h4>
            <ol>
              <li>Open your demand letter in the editor</li>
              <li>Click the "Refine" button in the toolbar</li>
              <li>Enter your instructions in natural language</li>
              <li>Review the AI's suggested changes</li>
              <li>Accept or modify the changes</li>
            </ol>
            <h4>Example Refinement Instructions</h4>
            <ul>
              <li>"Make the opening paragraph more persuasive"</li>
              <li>"Add more detail about the medical treatments"</li>
              <li>"Emphasize the emotional impact on the client"</li>
              <li>"Make the demand amount section more formal"</li>
              <li>"Shorten the liability section"</li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    id: 'documents',
    title: 'Documents',
    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    description: 'Upload and manage source documents',
    articles: [
      {
        id: 'uploading-documents',
        title: 'Uploading Documents',
        content: (
          <>
            <h4>Supported Formats</h4>
            <ul>
              <li><strong>PDF</strong> - Portable Document Format files</li>
              <li><strong>DOCX</strong> - Microsoft Word documents</li>
              <li><strong>TXT</strong> - Plain text files</li>
            </ul>
            <h4>How to Upload</h4>
            <ol>
              <li>Go to the Documents page</li>
              <li>Drag and drop files onto the upload area, or click to browse</li>
              <li>Optionally add a case reference and tags</li>
              <li>Click "Upload" to process your files</li>
            </ol>
            <h4>Tips</h4>
            <ul>
              <li>You can upload multiple files at once</li>
              <li>Files are automatically processed for text extraction</li>
              <li>Add case references to keep documents organized</li>
            </ul>
          </>
        ),
      },
      {
        id: 'organizing-documents',
        title: 'Organizing Documents',
        content: (
          <>
            <p>Keep your documents organized for easy access:</p>
            <h4>Case References</h4>
            <p>Assign case reference numbers to group related documents. This makes it easy to find all documents for a specific matter.</p>
            <h4>Search and Filter</h4>
            <p>Use the search bar to find documents by:</p>
            <ul>
              <li>File name</li>
              <li>Case reference</li>
              <li>File type</li>
            </ul>
            <h4>Document Preview</h4>
            <p>Click on any document to preview its contents without downloading.</p>
          </>
        ),
      },
    ],
  },
  {
    id: 'templates',
    title: 'Templates',
    icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z',
    description: 'Create and manage letter templates',
    articles: [
      {
        id: 'creating-templates',
        title: 'Creating Templates',
        content: (
          <>
            <p>Templates help maintain consistency across your demand letters:</p>
            <h4>Creating a Template</h4>
            <ol>
              <li>Go to the Templates page</li>
              <li>Click "Create Template"</li>
              <li>Enter a name and description</li>
              <li>Write or paste your template content</li>
              <li>Add placeholders for dynamic content</li>
              <li>Save the template</li>
            </ol>
            <h4>Available Placeholders</h4>
            <table>
              <tbody>
                <tr><td><code>{"{{client_name}}"}</code></td><td>Client's full name</td></tr>
                <tr><td><code>{"{{incident_date}}"}</code></td><td>Date of incident</td></tr>
                <tr><td><code>{"{{defendant_name}}"}</code></td><td>Defendant's name</td></tr>
                <tr><td><code>{"{{claim_amount}}"}</code></td><td>Claimed damages</td></tr>
                <tr><td><code>{"{{case_reference}}"}</code></td><td>Case reference number</td></tr>
              </tbody>
            </table>
          </>
        ),
      },
    ],
  },
  {
    id: 'collaboration',
    title: 'Collaboration',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    description: 'Work together on demand letters',
    articles: [
      {
        id: 'realtime-collaboration',
        title: 'Real-Time Collaboration',
        content: (
          <>
            <p>Work together with colleagues on demand letters in real-time:</p>
            <h4>Features</h4>
            <ul>
              <li><strong>Live editing</strong> - See changes as they happen</li>
              <li><strong>Presence indicators</strong> - See who's viewing the document</li>
              <li><strong>Cursor sharing</strong> - See where others are editing</li>
              <li><strong>Change tracking</strong> - Review all modifications</li>
              <li><strong>Comments</strong> - Add notes and feedback</li>
            </ul>
            <h4>Sharing a Document</h4>
            <ol>
              <li>Open the demand letter</li>
              <li>Click the "Share" button</li>
              <li>Enter collaborator email addresses</li>
              <li>Set permission levels (view or edit)</li>
              <li>Send invitations</li>
            </ol>
          </>
        ),
      },
      {
        id: 'change-tracking',
        title: 'Change Tracking',
        content: (
          <>
            <p>Track and review all changes made to your documents:</p>
            <h4>Viewing Changes</h4>
            <ul>
              <li>Open the change tracking panel</li>
              <li>Insertions are shown in green</li>
              <li>Deletions are shown in red</li>
              <li>Each change shows the author and timestamp</li>
            </ul>
            <h4>Managing Changes</h4>
            <ul>
              <li><strong>Accept</strong> - Apply the change permanently</li>
              <li><strong>Reject</strong> - Revert the change</li>
              <li><strong>Accept All</strong> - Apply all pending changes</li>
              <li><strong>Reject All</strong> - Revert all pending changes</li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    description: 'Work faster with keyboard shortcuts',
    articles: [
      {
        id: 'shortcuts-list',
        title: 'All Keyboard Shortcuts',
        content: (
          <>
            <h4>General</h4>
            <table>
              <tbody>
                <tr><td><kbd>Ctrl/Cmd + S</kbd></td><td>Save document</td></tr>
                <tr><td><kbd>Ctrl/Cmd + Z</kbd></td><td>Undo</td></tr>
                <tr><td><kbd>Ctrl/Cmd + Shift + Z</kbd></td><td>Redo</td></tr>
                <tr><td><kbd>Escape</kbd></td><td>Close dialogs/panels</td></tr>
                <tr><td><kbd>?</kbd></td><td>Open help</td></tr>
              </tbody>
            </table>
            <h4>Editor</h4>
            <table>
              <tbody>
                <tr><td><kbd>Ctrl/Cmd + B</kbd></td><td>Bold</td></tr>
                <tr><td><kbd>Ctrl/Cmd + I</kbd></td><td>Italic</td></tr>
                <tr><td><kbd>Ctrl/Cmd + U</kbd></td><td>Underline</td></tr>
                <tr><td><kbd>Ctrl/Cmd + Shift + 7</kbd></td><td>Numbered list</td></tr>
                <tr><td><kbd>Ctrl/Cmd + Shift + 8</kbd></td><td>Bullet list</td></tr>
              </tbody>
            </table>
            <h4>Navigation</h4>
            <table>
              <tbody>
                <tr><td><kbd>Tab</kbd></td><td>Move to next element</td></tr>
                <tr><td><kbd>Shift + Tab</kbd></td><td>Move to previous element</td></tr>
                <tr><td><kbd>Enter</kbd></td><td>Activate button/link</td></tr>
                <tr><td><kbd>Arrow keys</kbd></td><td>Navigate within menus</td></tr>
              </tbody>
            </table>
          </>
        ),
      },
    ],
  },
];

export function HelpPage() {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const { startTour, isTourComplete, markTourComplete } = useTour();

  const currentSection = HELP_SECTIONS.find((s) => s.id === selectedSection);
  const currentArticle = currentSection?.articles.find((a) => a.id === selectedArticle);

  const handleStartTour = () => {
    startTour(ONBOARDING_STEPS);
    markTourComplete('onboarding');
  };

  return (
    <div className="help-page">
      <div className="help-page__header">
        <h1>Help & Documentation</h1>
        <p>Learn how to use the Demand Letter Generator effectively</p>
      </div>

      {/* Quick tour banner */}
      {!isTourComplete('onboarding') && (
        <div className="help-page__tour-banner">
          <div className="tour-banner__content">
            <div className="tour-banner__icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
            </div>
            <div className="tour-banner__text">
              <strong>New to Demand Letter Generator?</strong>
              <span>Take a quick tour to learn the basics</span>
            </div>
          </div>
          <button type="button" className="tour-banner__btn" onClick={handleStartTour}>
            Start Tour
          </button>
        </div>
      )}

      <div className="help-page__content">
        {/* Sidebar */}
        <nav className="help-page__sidebar" aria-label="Help topics">
          <ul className="help-sidebar__list">
            {HELP_SECTIONS.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={`help-sidebar__item ${selectedSection === section.id ? 'help-sidebar__item--active' : ''}`}
                  onClick={() => {
                    setSelectedSection(section.id);
                    setSelectedArticle(null);
                  }}
                  aria-expanded={selectedSection === section.id}
                >
                  <svg
                    className="help-sidebar__icon"
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
                    <path d={section.icon} />
                  </svg>
                  <span>{section.title}</span>
                </button>
                {selectedSection === section.id && (
                  <ul className="help-sidebar__articles">
                    {section.articles.map((article) => (
                      <li key={article.id}>
                        <button
                          type="button"
                          className={`help-sidebar__article ${selectedArticle === article.id ? 'help-sidebar__article--active' : ''}`}
                          onClick={() => setSelectedArticle(article.id)}
                        >
                          {article.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Main content */}
        <main className="help-page__main">
          {currentArticle ? (
            <article className="help-article">
              <div className="help-article__breadcrumb">
                <button type="button" onClick={() => setSelectedArticle(null)}>
                  {currentSection?.title}
                </button>
                <span aria-hidden="true">/</span>
                <span>{currentArticle.title}</span>
              </div>
              <h2>{currentArticle.title}</h2>
              <div className="help-article__content">{currentArticle.content}</div>
            </article>
          ) : currentSection ? (
            <div className="help-section">
              <h2>{currentSection.title}</h2>
              <p className="help-section__description">{currentSection.description}</p>
              <div className="help-section__articles">
                {currentSection.articles.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    className="help-section__article-card"
                    onClick={() => setSelectedArticle(article.id)}
                  >
                    <h3>{article.title}</h3>
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
                ))}
              </div>
            </div>
          ) : (
            <div className="help-welcome">
              <h2>How can we help you?</h2>
              <p>Select a topic from the sidebar to get started, or browse the sections below.</p>
              <div className="help-welcome__sections">
                {HELP_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className="help-welcome__section-card"
                    onClick={() => setSelectedSection(section.id)}
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
                      <path d={section.icon} />
                    </svg>
                    <h3>{section.title}</h3>
                    <p>{section.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .help-page {
          max-width: 1200px;
          margin: 0 auto;
        }

        .help-page__header {
          margin-bottom: 24px;
        }

        .help-page__header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary, #111827);
        }

        .help-page__header p {
          margin: 8px 0 0;
          color: var(--text-secondary, #6b7280);
        }

        /* Tour banner */
        .help-page__tour-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: var(--color-primary-light, #eff6ff);
          border: 1px solid var(--color-primary, #3b82f6);
          border-radius: 12px;
          margin-bottom: 24px;
        }

        .tour-banner__content {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .tour-banner__icon {
          width: 40px;
          height: 40px;
          background: var(--color-primary, #3b82f6);
          color: white;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tour-banner__text {
          display: flex;
          flex-direction: column;
        }

        .tour-banner__text strong {
          color: var(--text-primary, #111827);
          font-size: 15px;
        }

        .tour-banner__text span {
          color: var(--text-secondary, #6b7280);
          font-size: 13px;
        }

        .tour-banner__btn {
          padding: 10px 20px;
          background: var(--color-primary, #3b82f6);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
        }

        .tour-banner__btn:hover {
          background: var(--color-primary-hover, #2563eb);
        }

        /* Content layout */
        .help-page__content {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
          min-height: 500px;
        }

        /* Sidebar */
        .help-page__sidebar {
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          padding: 16px;
          height: fit-content;
        }

        .help-sidebar__list {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .help-sidebar__item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px;
          background: transparent;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #111827);
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }

        .help-sidebar__item:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .help-sidebar__item--active {
          background: var(--color-primary-light, #eff6ff);
          color: var(--color-primary, #3b82f6);
        }

        .help-sidebar__icon {
          flex-shrink: 0;
          color: var(--text-tertiary, #9ca3af);
        }

        .help-sidebar__item--active .help-sidebar__icon {
          color: var(--color-primary, #3b82f6);
        }

        .help-sidebar__articles {
          list-style: none;
          margin: 0;
          padding: 8px 0 8px 44px;
        }

        .help-sidebar__article {
          display: block;
          width: 100%;
          padding: 8px 12px;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }

        .help-sidebar__article:hover {
          background: var(--bg-secondary, #f3f4f6);
          color: var(--text-primary, #111827);
        }

        .help-sidebar__article--active {
          background: var(--bg-secondary, #f3f4f6);
          color: var(--color-primary, #3b82f6);
          font-weight: 500;
        }

        /* Main content */
        .help-page__main {
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          padding: 24px;
        }

        /* Welcome screen */
        .help-welcome h2 {
          margin: 0 0 8px;
          font-size: 24px;
          color: var(--text-primary, #111827);
        }

        .help-welcome > p {
          margin: 0 0 24px;
          color: var(--text-secondary, #6b7280);
        }

        .help-welcome__sections {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        .help-welcome__section-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 20px;
          background: var(--bg-secondary, #f9fafb);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }

        .help-welcome__section-card:hover {
          border-color: var(--color-primary, #3b82f6);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .help-welcome__section-card svg {
          color: var(--color-primary, #3b82f6);
          margin-bottom: 12px;
        }

        .help-welcome__section-card h3 {
          margin: 0 0 4px;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .help-welcome__section-card p {
          margin: 0;
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
        }

        /* Section view */
        .help-section h2 {
          margin: 0 0 8px;
          font-size: 24px;
          color: var(--text-primary, #111827);
        }

        .help-section__description {
          margin: 0 0 24px;
          color: var(--text-secondary, #6b7280);
        }

        .help-section__articles {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .help-section__article-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: var(--bg-secondary, #f9fafb);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 10px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }

        .help-section__article-card:hover {
          border-color: var(--color-primary, #3b82f6);
          background: var(--color-primary-light, #eff6ff);
        }

        .help-section__article-card h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .help-section__article-card svg {
          color: var(--text-tertiary, #9ca3af);
        }

        /* Article view */
        .help-article__breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          font-size: 13px;
        }

        .help-article__breadcrumb button {
          background: none;
          border: none;
          color: var(--color-primary, #3b82f6);
          cursor: pointer;
          padding: 0;
        }

        .help-article__breadcrumb button:hover {
          text-decoration: underline;
        }

        .help-article__breadcrumb span:not(:first-of-type) {
          color: var(--text-tertiary, #9ca3af);
        }

        .help-article h2 {
          margin: 0 0 20px;
          font-size: 24px;
          color: var(--text-primary, #111827);
        }

        .help-article__content {
          font-size: 14px;
          line-height: 1.7;
          color: var(--text-secondary, #6b7280);
        }

        .help-article__content h4 {
          margin: 24px 0 12px;
          font-size: 16px;
          color: var(--text-primary, #111827);
        }

        .help-article__content p {
          margin-bottom: 12px;
        }

        .help-article__content ul,
        .help-article__content ol {
          margin: 12px 0;
          padding-left: 24px;
        }

        .help-article__content li {
          margin-bottom: 8px;
        }

        .help-article__content code {
          background: var(--bg-secondary, #f3f4f6);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 13px;
        }

        .help-article__content table {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
        }

        .help-article__content td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-primary, #e5e7eb);
        }

        .help-article__content td:first-child {
          width: 40%;
        }

        .help-article__content kbd {
          display: inline-block;
          padding: 4px 8px;
          background: var(--bg-secondary, #f3f4f6);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 4px;
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 12px;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .help-page__content {
            grid-template-columns: 1fr;
          }

          .help-page__sidebar {
            display: none;
          }

          .help-page__tour-banner {
            flex-direction: column;
            gap: 16px;
            text-align: center;
          }

          .tour-banner__content {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}

export default HelpPage;
