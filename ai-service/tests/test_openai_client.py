"""Tests for OpenAI client service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.openai_client import (
    OpenAIClient,
    TokenUsage,
    OpenAIResponse,
    MODEL_CONFIG,
    DEFAULT_MODEL,
)


class TestOpenAIClientInit:
    """Test cases for OpenAI client initialization."""

    def test_init_with_api_key(self):
        """Test initialization with explicit API key."""
        client = OpenAIClient(api_key="test-key")
        assert client.api_key == "test-key"
        assert client.default_model == DEFAULT_MODEL

    def test_init_with_custom_model(self):
        """Test initialization with custom default model."""
        client = OpenAIClient(api_key="test-key", default_model="gpt-4-turbo")
        assert client.default_model == "gpt-4-turbo"

    def test_init_without_api_key_raises(self, monkeypatch):
        """Test that initialization without API key raises error."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        with pytest.raises(ValueError, match="OPENAI_API_KEY is required"):
            OpenAIClient(api_key=None)


class TestTokenCalculation:
    """Test cases for token calculation and cost estimation."""

    def test_calculate_cost_gpt4o_mini(self):
        """Test cost calculation for gpt-4o-mini."""
        client = OpenAIClient(api_key="test-key")
        cost = client._calculate_cost("gpt-4o-mini", 1000, 500)

        # gpt-4o-mini: $0.00015/1k input, $0.0006/1k output
        expected = (1000 / 1000 * 0.00015) + (500 / 1000 * 0.0006)
        assert abs(cost - expected) < 0.0001

    def test_calculate_cost_gpt4_turbo(self):
        """Test cost calculation for gpt-4-turbo."""
        client = OpenAIClient(api_key="test-key")
        cost = client._calculate_cost("gpt-4-turbo", 1000, 500)

        # gpt-4-turbo: $0.01/1k input, $0.03/1k output
        expected = (1000 / 1000 * 0.01) + (500 / 1000 * 0.03)
        assert abs(cost - expected) < 0.0001

    def test_estimate_tokens(self):
        """Test token estimation."""
        client = OpenAIClient(api_key="test-key")

        # ~4 chars per token
        text = "a" * 400
        estimate = client.estimate_tokens(text)
        assert estimate == 100

    def test_check_token_limit_fits(self):
        """Test token limit check when text fits."""
        client = OpenAIClient(api_key="test-key")

        result = client.check_token_limit("Short text")
        assert result["fits"] is True
        assert result["remaining"] > 0

    def test_check_token_limit_too_large(self):
        """Test token limit check when text is too large."""
        client = OpenAIClient(api_key="test-key")

        # Create text that would exceed limit (128k tokens * 4 chars = 512k chars)
        huge_text = "x" * 600000
        result = client.check_token_limit(huge_text)
        assert result["fits"] is False


class TestSessionTracking:
    """Test cases for session usage tracking."""

    def test_initial_session_stats(self):
        """Test initial session stats are zero."""
        client = OpenAIClient(api_key="test-key")
        stats = client.get_session_stats()

        assert stats["total_prompt_tokens"] == 0
        assert stats["total_completion_tokens"] == 0
        assert stats["total_cost"] == 0.0
        assert stats["request_count"] == 0

    def test_update_session_usage(self):
        """Test session usage is updated correctly."""
        client = OpenAIClient(api_key="test-key")

        usage = TokenUsage(
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            estimated_cost=0.001,
        )

        client._update_session_usage(usage)
        stats = client.get_session_stats()

        assert stats["total_prompt_tokens"] == 100
        assert stats["total_completion_tokens"] == 50
        assert stats["total_cost"] == 0.001
        assert stats["request_count"] == 1


class TestModelConfig:
    """Test cases for model configuration."""

    def test_model_config_contains_required_models(self):
        """Test that all expected models are configured."""
        assert "gpt-4o" in MODEL_CONFIG
        assert "gpt-4o-mini" in MODEL_CONFIG
        assert "gpt-4-turbo" in MODEL_CONFIG

    def test_model_config_has_required_fields(self):
        """Test that each model has required configuration fields."""
        for model, config in MODEL_CONFIG.items():
            assert "input_price_per_1k" in config
            assert "output_price_per_1k" in config
            assert "max_tokens" in config
            assert "default_max_completion" in config

    def test_default_model_is_valid(self):
        """Test that default model is in config."""
        assert DEFAULT_MODEL in MODEL_CONFIG


class TestOpenAIResponse:
    """Test cases for OpenAIResponse model."""

    def test_response_model(self):
        """Test OpenAIResponse model creation."""
        usage = TokenUsage(
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            estimated_cost=0.001,
        )

        response = OpenAIResponse(
            content="Generated text",
            model="gpt-4o-mini",
            usage=usage,
            finish_reason="stop",
        )

        assert response.content == "Generated text"
        assert response.model == "gpt-4o-mini"
        assert response.usage.total_tokens == 150
