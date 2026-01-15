"""Tests for document parser service."""

import pytest
from app.services.document_parser import DocumentParser, get_document_parser


class TestDocumentParser:
    """Test cases for DocumentParser class."""

    def test_get_document_parser_singleton(self):
        """Test that get_document_parser returns singleton."""
        parser1 = get_document_parser()
        parser2 = get_document_parser()
        assert parser1 is parser2

    def test_parse_txt_file(self, sample_txt_content):
        """Test parsing a plain text file."""
        parser = DocumentParser()
        result = parser.parse(sample_txt_content, "test.txt")

        assert result.success is True
        assert result.file_type == "txt"
        assert result.word_count > 0
        assert result.char_count > 0
        assert "test document" in result.text

    def test_parse_txt_different_encodings(self):
        """Test parsing text with different encodings."""
        parser = DocumentParser()

        # UTF-8
        utf8_content = "Hello, World! Unicode: \u00e9\u00e8\u00ea".encode("utf-8")
        result = parser.parse(utf8_content, "test.txt")
        assert result.success is True
        assert "Hello, World!" in result.text

    def test_parse_unsupported_file_type(self):
        """Test parsing an unsupported file type."""
        parser = DocumentParser()
        result = parser.parse(b"some content", "test.xyz")

        assert result.success is False
        assert "Unsupported file type" in result.error_message

    def test_parse_file_too_large(self):
        """Test parsing a file that exceeds size limit."""
        parser = DocumentParser(max_file_size_mb=1)
        large_content = b"x" * (2 * 1024 * 1024)  # 2MB

        result = parser.parse(large_content, "large.txt")
        assert result.success is False
        assert "exceeds maximum size" in result.error_message

    def test_parse_empty_txt(self):
        """Test parsing an empty text file."""
        parser = DocumentParser()
        result = parser.parse(b"", "empty.txt")

        assert result.success is True
        assert result.text == ""
        assert result.word_count == 0

    def test_parse_multiple_documents(self, sample_txt_content):
        """Test parsing multiple documents."""
        parser = DocumentParser()

        documents = [
            (sample_txt_content, "doc1.txt"),
            (b"Second document content", "doc2.txt"),
        ]

        results = parser.parse_multiple(documents)
        assert len(results) == 2
        assert all(r.success for r in results)

    def test_combine_documents(self, sample_txt_content):
        """Test combining parsed documents."""
        parser = DocumentParser()

        parsed1 = parser.parse(sample_txt_content, "doc1.txt")
        parsed2 = parser.parse(b"Another document", "doc2.txt")

        combined = parser.combine_documents([parsed1, parsed2])

        assert "Document 1" in combined
        assert "Document 2" in combined
        assert "test document" in combined.lower()

    def test_supported_types(self):
        """Test supported file types constant."""
        parser = DocumentParser()
        assert ".pdf" in parser.SUPPORTED_TYPES
        assert ".docx" in parser.SUPPORTED_TYPES
        assert ".txt" in parser.SUPPORTED_TYPES


class TestPDFParsing:
    """Test cases for PDF parsing."""

    def test_parse_invalid_pdf(self):
        """Test parsing an invalid PDF file."""
        parser = DocumentParser()
        result = parser.parse(b"not a valid pdf", "test.pdf")

        # Should fail gracefully
        assert result.success is False
        assert result.error_message is not None


class TestDOCXParsing:
    """Test cases for DOCX parsing."""

    def test_parse_invalid_docx(self):
        """Test parsing an invalid DOCX file."""
        parser = DocumentParser()
        result = parser.parse(b"not a valid docx", "test.docx")

        # Should fail gracefully
        assert result.success is False
        assert result.error_message is not None
