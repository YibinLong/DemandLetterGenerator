"""Tests for API endpoints."""

import base64
import pytest
from fastapi.testclient import TestClient


class TestHealthEndpoints:
    """Test cases for health check endpoints."""

    def test_root_endpoint(self, client):
        """Test root endpoint returns service info."""
        response = client.get("/")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Demand Letter AI Service"
        assert "version" in data
        assert "endpoints" in data

    def test_health_endpoint(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "ai-service"
        assert "openai_configured" in data


class TestAIEndpoints:
    """Test cases for AI generation endpoints."""

    def test_models_endpoint(self, client):
        """Test listing available models."""
        response = client.get("/ai/models")
        assert response.status_code == 200

        data = response.json()
        assert "models" in data
        assert "default" in data
        assert len(data["models"]) >= 3

    def test_templates_endpoint(self, client):
        """Test listing prompt templates."""
        response = client.get("/ai/templates")
        assert response.status_code == 200

        data = response.json()
        assert "templates" in data
        assert len(data["templates"]) >= 3

    def test_stats_endpoint(self, client):
        """Test session stats endpoint."""
        response = client.get("/ai/stats")
        assert response.status_code == 200

        data = response.json()
        assert "total_prompt_tokens" in data
        assert "total_cost" in data
        assert "request_count" in data


class TestExtractTextEndpoint:
    """Test cases for text extraction endpoint."""

    def test_extract_text_txt_file(self, client, sample_txt_base64):
        """Test extracting text from a text file."""
        response = client.post(
            "/ai/extract-text",
            json={
                "filename": "test.txt",
                "content": sample_txt_base64,
            },
        )
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert data["file_type"] == "txt"
        assert data["word_count"] > 0

    def test_extract_text_invalid_base64(self, client):
        """Test extracting text with invalid base64."""
        response = client.post(
            "/ai/extract-text",
            json={
                "filename": "test.txt",
                "content": "not-valid-base64!!!",
            },
        )
        assert response.status_code == 400

    def test_extract_text_unsupported_type(self, client):
        """Test extracting text from unsupported file type."""
        content = base64.b64encode(b"some content").decode()
        response = client.post(
            "/ai/extract-text",
            json={
                "filename": "test.xyz",
                "content": content,
            },
        )
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is False
        assert "Unsupported" in data["error_message"]


class TestGenerateEndpoint:
    """Test cases for generate endpoint validation."""

    def test_generate_no_documents(self, client):
        """Test generate with no documents."""
        response = client.post(
            "/ai/generate",
            json={
                "documents": [],
            },
        )
        assert response.status_code == 400
        assert "At least one document" in response.json()["detail"]

    def test_generate_invalid_document_encoding(self, client):
        """Test generate with invalid document encoding."""
        response = client.post(
            "/ai/generate",
            json={
                "documents": [
                    {"filename": "test.txt", "content": "not-base64!!!"}
                ],
            },
        )
        assert response.status_code == 400


class TestRefineEndpoint:
    """Test cases for refine endpoint validation."""

    def test_refine_empty_draft(self, client):
        """Test refine with empty draft."""
        response = client.post(
            "/ai/refine",
            json={
                "current_draft": "",
                "instructions": "Make it better",
            },
        )
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()

    def test_refine_no_instructions(self, client):
        """Test refine without instructions."""
        response = client.post(
            "/ai/refine",
            json={
                "current_draft": "Some draft content",
                "instructions": "",
            },
        )
        assert response.status_code == 400
        assert "instructions" in response.json()["detail"].lower()


class TestAnalyzeEndpoint:
    """Test cases for analyze endpoint validation."""

    def test_analyze_no_documents(self, client):
        """Test analyze with no documents."""
        response = client.post(
            "/ai/analyze",
            json={
                "documents": [],
            },
        )
        assert response.status_code == 400
        assert "At least one document" in response.json()["detail"]
