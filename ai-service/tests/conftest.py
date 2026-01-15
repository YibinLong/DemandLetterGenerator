"""Pytest configuration and fixtures for AI service tests."""

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Add app to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Set test environment variables
os.environ["OPENAI_API_KEY"] = "test-key-for-testing"


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    from app.main import app
    return TestClient(app)


@pytest.fixture
def sample_txt_content():
    """Sample text file content."""
    return b"This is a test document.\nIt contains sample text for testing.\n"


@pytest.fixture
def sample_txt_base64():
    """Base64 encoded sample text file."""
    import base64
    content = b"This is a test document.\nIt contains sample text for testing.\n"
    return base64.b64encode(content).decode()
