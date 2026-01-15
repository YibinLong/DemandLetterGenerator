"""
OpenAI API Client Service

Provides a wrapper around the OpenAI API with:
- Automatic retry logic with exponential backoff
- Token management and cost tracking
- Error handling for common failure scenarios
"""

import os
import time
import logging
from typing import Optional, AsyncGenerator
from openai import AsyncOpenAI, APIError, RateLimitError, APIConnectionError
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Model configurations with pricing (as of 2024)
MODEL_CONFIG = {
    "gpt-4o": {
        "input_price_per_1k": 0.0025,
        "output_price_per_1k": 0.01,
        "max_tokens": 128000,
        "default_max_completion": 4096,
    },
    "gpt-4o-mini": {
        "input_price_per_1k": 0.00015,
        "output_price_per_1k": 0.0006,
        "max_tokens": 128000,
        "default_max_completion": 4096,
    },
    "gpt-4-turbo": {
        "input_price_per_1k": 0.01,
        "output_price_per_1k": 0.03,
        "max_tokens": 128000,
        "default_max_completion": 4096,
    },
}

DEFAULT_MODEL = "gpt-4o-mini"  # Cost-effective default


class TokenUsage(BaseModel):
    """Track token usage for a request."""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost: float


class OpenAIResponse(BaseModel):
    """Structured response from OpenAI API."""
    content: str
    model: str
    usage: TokenUsage
    finish_reason: Optional[str] = None


class OpenAIClient:
    """
    Async OpenAI client with retry logic, token management, and cost tracking.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: str = DEFAULT_MODEL,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required but not set")

        self.client = AsyncOpenAI(api_key=self.api_key)
        self.default_model = default_model
        self.max_retries = max_retries
        self.retry_delay = retry_delay

        # Track cumulative usage for the session
        self.session_usage = {
            "total_prompt_tokens": 0,
            "total_completion_tokens": 0,
            "total_cost": 0.0,
            "request_count": 0,
        }

    def _calculate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        """Calculate estimated cost based on model pricing."""
        config = MODEL_CONFIG.get(model, MODEL_CONFIG[DEFAULT_MODEL])
        input_cost = (prompt_tokens / 1000) * config["input_price_per_1k"]
        output_cost = (completion_tokens / 1000) * config["output_price_per_1k"]
        return round(input_cost + output_cost, 6)

    def _update_session_usage(self, usage: TokenUsage) -> None:
        """Update cumulative session usage statistics."""
        self.session_usage["total_prompt_tokens"] += usage.prompt_tokens
        self.session_usage["total_completion_tokens"] += usage.completion_tokens
        self.session_usage["total_cost"] += usage.estimated_cost
        self.session_usage["request_count"] += 1

    async def generate(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> OpenAIResponse:
        """
        Generate a completion using the OpenAI API.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model to use (defaults to gpt-4o-mini)
            max_tokens: Maximum tokens for completion
            temperature: Sampling temperature (0-2)
            system_prompt: Optional system prompt to prepend

        Returns:
            OpenAIResponse with content, usage, and metadata

        Raises:
            APIError: On API errors after all retries exhausted
        """
        model = model or self.default_model
        config = MODEL_CONFIG.get(model, MODEL_CONFIG[DEFAULT_MODEL])
        max_tokens = max_tokens or config["default_max_completion"]

        # Build message list with optional system prompt
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        last_error = None
        for attempt in range(self.max_retries):
            try:
                response = await self.client.chat.completions.create(
                    model=model,
                    messages=full_messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )

                # Extract usage info
                usage = TokenUsage(
                    prompt_tokens=response.usage.prompt_tokens,
                    completion_tokens=response.usage.completion_tokens,
                    total_tokens=response.usage.total_tokens,
                    estimated_cost=self._calculate_cost(
                        model,
                        response.usage.prompt_tokens,
                        response.usage.completion_tokens
                    ),
                )

                self._update_session_usage(usage)

                return OpenAIResponse(
                    content=response.choices[0].message.content or "",
                    model=response.model,
                    usage=usage,
                    finish_reason=response.choices[0].finish_reason,
                )

            except RateLimitError as e:
                last_error = e
                wait_time = self.retry_delay * (2 ** attempt)
                logger.warning(f"Rate limit hit, waiting {wait_time}s before retry {attempt + 1}")
                time.sleep(wait_time)

            except APIConnectionError as e:
                last_error = e
                wait_time = self.retry_delay * (2 ** attempt)
                logger.warning(f"Connection error, waiting {wait_time}s before retry {attempt + 1}")
                time.sleep(wait_time)

            except APIError as e:
                last_error = e
                if e.status_code and e.status_code >= 500:
                    # Server errors - retry
                    wait_time = self.retry_delay * (2 ** attempt)
                    logger.warning(f"Server error {e.status_code}, retrying in {wait_time}s")
                    time.sleep(wait_time)
                else:
                    # Client errors - don't retry
                    logger.error(f"OpenAI API error: {e}")
                    raise

        # All retries exhausted
        logger.error(f"All {self.max_retries} retries failed")
        raise last_error or APIError("Unknown error after retries")

    async def generate_stream(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Generate a streaming completion using the OpenAI API.

        Yields chunks of text as they are generated for real-time feedback.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model to use (defaults to gpt-4o-mini)
            max_tokens: Maximum tokens for completion
            temperature: Sampling temperature (0-2)
            system_prompt: Optional system prompt to prepend

        Yields:
            String chunks as they are generated
        """
        model = model or self.default_model
        config = MODEL_CONFIG.get(model, MODEL_CONFIG[DEFAULT_MODEL])
        max_tokens = max_tokens or config["default_max_completion"]

        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        try:
            stream = await self.client.chat.completions.create(
                model=model,
                messages=full_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            logger.error(f"Streaming error: {e}")
            raise

    def get_session_stats(self) -> dict:
        """Get cumulative usage statistics for this session."""
        return {
            **self.session_usage,
            "average_cost_per_request": (
                self.session_usage["total_cost"] / self.session_usage["request_count"]
                if self.session_usage["request_count"] > 0
                else 0
            ),
        }

    def estimate_tokens(self, text: str) -> int:
        """
        Rough estimate of token count for a text string.

        Uses approximation of ~4 characters per token for English text.
        For more accurate counting, use tiktoken library.
        """
        return len(text) // 4

    def check_token_limit(self, text: str, model: Optional[str] = None) -> dict:
        """
        Check if text fits within model's token limit.

        Returns dict with:
        - estimated_tokens: Estimated token count
        - max_tokens: Model's max context
        - fits: Whether the text fits
        - remaining: Tokens remaining for completion
        """
        model = model or self.default_model
        config = MODEL_CONFIG.get(model, MODEL_CONFIG[DEFAULT_MODEL])
        estimated = self.estimate_tokens(text)
        max_tokens = config["max_tokens"]

        return {
            "estimated_tokens": estimated,
            "max_tokens": max_tokens,
            "fits": estimated < max_tokens,
            "remaining": max_tokens - estimated,
        }


# Singleton instance for easy import
_client: Optional[OpenAIClient] = None


def get_openai_client() -> OpenAIClient:
    """Get or create the singleton OpenAI client instance."""
    global _client
    if _client is None:
        _client = OpenAIClient()
    return _client
