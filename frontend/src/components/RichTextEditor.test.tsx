import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RichTextEditor } from './RichTextEditor';

// Helper to wait for TipTap editor to initialize
const waitForEditor = async () => {
  await waitFor(() => {
    expect(document.querySelector('.ProseMirror')).toBeInTheDocument();
  }, { timeout: 3000 });
};

describe('RichTextEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the editor container', async () => {
      render(<RichTextEditor content="<p>Test content</p>" />);

      await waitForEditor();

      expect(document.querySelector('.rich-text-editor')).toBeInTheDocument();
    });

    it('should render with initial content', async () => {
      render(<RichTextEditor content="<p>Hello World</p>" />);

      await waitForEditor();

      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('should show toolbar when editable is true', async () => {
      render(<RichTextEditor content="<p>Test</p>" editable={true} showToolbar={true} />);

      await waitForEditor();

      expect(document.querySelector('.editor-toolbar')).toBeInTheDocument();
    });

    it('should hide toolbar when showToolbar is false', async () => {
      render(<RichTextEditor content="<p>Test</p>" editable={true} showToolbar={false} />);

      await waitForEditor();

      expect(document.querySelector('.editor-toolbar')).not.toBeInTheDocument();
    });

    it('should hide toolbar when editable is false', async () => {
      render(<RichTextEditor content="<p>Test</p>" editable={false} showToolbar={true} />);

      await waitForEditor();

      expect(document.querySelector('.editor-toolbar')).not.toBeInTheDocument();
    });
  });

  describe('Toolbar Buttons', () => {
    it('should render all formatting buttons', async () => {
      render(<RichTextEditor content="<p>Test</p>" editable={true} showToolbar={true} />);

      await waitForEditor();

      // Text formatting buttons
      expect(screen.getByTitle('Bold (Ctrl+B)')).toBeInTheDocument();
      expect(screen.getByTitle('Italic (Ctrl+I)')).toBeInTheDocument();
      expect(screen.getByTitle('Underline (Ctrl+U)')).toBeInTheDocument();
      expect(screen.getByTitle('Strikethrough')).toBeInTheDocument();
      expect(screen.getByTitle('Highlight')).toBeInTheDocument();

      // Paragraph styles
      expect(screen.getByTitle('Normal text')).toBeInTheDocument();
      expect(screen.getByTitle('Heading 1')).toBeInTheDocument();
      expect(screen.getByTitle('Heading 2')).toBeInTheDocument();
      expect(screen.getByTitle('Heading 3')).toBeInTheDocument();

      // Lists
      expect(screen.getByTitle('Bullet List')).toBeInTheDocument();
      expect(screen.getByTitle('Numbered List')).toBeInTheDocument();
      expect(screen.getByTitle('Quote')).toBeInTheDocument();

      // Alignment
      expect(screen.getByTitle('Align Left')).toBeInTheDocument();
      expect(screen.getByTitle('Align Center')).toBeInTheDocument();
      expect(screen.getByTitle('Align Right')).toBeInTheDocument();
      expect(screen.getByTitle('Justify')).toBeInTheDocument();

      // Actions
      expect(screen.getByTitle('Horizontal Rule')).toBeInTheDocument();
      expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeInTheDocument();
      expect(screen.getByTitle('Redo (Ctrl+Shift+Z)')).toBeInTheDocument();
    });
  });

  describe('Save Functionality', () => {
    it('should show editor footer when onSave is provided and editable', async () => {
      const onSave = vi.fn();
      render(
        <RichTextEditor
          content="<p>Test</p>"
          onSave={onSave}
          editable={true}
        />
      );

      await waitForEditor();

      // Editor footer should be visible
      expect(document.querySelector('.editor-footer')).toBeInTheDocument();
    });
  });

  describe('Read-only mode', () => {
    it('should disable editing when editable is false', async () => {
      render(
        <RichTextEditor
          content="<p>Read only content</p>"
          editable={false}
        />
      );

      await waitForEditor();

      const editor = document.querySelector('.ProseMirror');
      expect(editor).toHaveAttribute('contenteditable', 'false');
    });

    it('should not show editor footer when editable is false', async () => {
      render(
        <RichTextEditor
          content="<p>Read only content</p>"
          editable={false}
        />
      );

      await waitForEditor();

      expect(document.querySelector('.editor-footer')).not.toBeInTheDocument();
    });
  });

  describe('Content Types', () => {
    it('should render headings correctly', async () => {
      render(
        <RichTextEditor
          content="<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3>"
          editable={false}
        />
      );

      await waitForEditor();

      expect(screen.getByText('Heading 1')).toBeInTheDocument();
      expect(screen.getByText('Heading 2')).toBeInTheDocument();
      expect(screen.getByText('Heading 3')).toBeInTheDocument();
    });

    it('should render lists correctly', async () => {
      render(
        <RichTextEditor
          content="<ul><li>Item 1</li><li>Item 2</li></ul>"
          editable={false}
        />
      );

      await waitForEditor();

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });

    it('should render blockquote correctly', async () => {
      render(
        <RichTextEditor
          content="<blockquote><p>Quote text</p></blockquote>"
          editable={false}
        />
      );

      await waitForEditor();

      expect(screen.getByText('Quote text')).toBeInTheDocument();
    });
  });

  describe('Formatting', () => {
    it('should render bold text correctly', async () => {
      render(
        <RichTextEditor
          content="<p><strong>Bold text</strong></p>"
          editable={false}
        />
      );

      await waitForEditor();

      expect(screen.getByText('Bold text')).toBeInTheDocument();
    });

    it('should render italic text correctly', async () => {
      render(
        <RichTextEditor
          content="<p><em>Italic text</em></p>"
          editable={false}
        />
      );

      await waitForEditor();

      expect(screen.getByText('Italic text')).toBeInTheDocument();
    });

    it('should render underlined text correctly', async () => {
      render(
        <RichTextEditor
          content="<p><u>Underlined text</u></p>"
          editable={false}
        />
      );

      await waitForEditor();

      expect(screen.getByText('Underlined text')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper toolbar button titles', async () => {
      render(<RichTextEditor content="<p>Test</p>" editable={true} showToolbar={true} />);

      await waitForEditor();

      // All buttons should have title attributes for accessibility
      const buttons = document.querySelectorAll('.toolbar-button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('title');
      });
    });

    it('should have proper button types', async () => {
      render(<RichTextEditor content="<p>Test</p>" editable={true} showToolbar={true} />);

      await waitForEditor();

      // All buttons should have type="button" to prevent form submission
      const buttons = document.querySelectorAll('.toolbar-button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('type', 'button');
      });
    });
  });
});
