"""Models module for AI service."""

from .generation import (
    DocumentInput,
    CaseInfo,
    GenerateRequest,
    GenerateResponse,
    RefineRequest,
    RefineResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    ExtractTextRequest,
    ExtractTextResponse,
    TokenUsageResponse,
    SessionStatsResponse,
    ErrorResponse,
)

__all__ = [
    "DocumentInput",
    "CaseInfo",
    "GenerateRequest",
    "GenerateResponse",
    "RefineRequest",
    "RefineResponse",
    "AnalyzeRequest",
    "AnalyzeResponse",
    "ExtractTextRequest",
    "ExtractTextResponse",
    "TokenUsageResponse",
    "SessionStatsResponse",
    "ErrorResponse",
]
