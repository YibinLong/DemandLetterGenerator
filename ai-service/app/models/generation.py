"""
Pydantic models for AI generation requests and responses.
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class DocumentInput(BaseModel):
    """Input document for generation."""
    filename: str
    content: str  # Base64 encoded file content or raw text


class CaseInfo(BaseModel):
    """Case information for demand letter generation."""
    case_reference: Optional[str] = None
    client_name: Optional[str] = None
    incident_date: Optional[str] = None
    defendant_name: Optional[str] = None
    defendant_insurance: Optional[str] = None
    claim_number: Optional[str] = None
    additional_info: Optional[str] = None


class GenerateRequest(BaseModel):
    """Request to generate a demand letter."""
    documents: list[DocumentInput] = Field(
        ..., description="Source documents for generation"
    )
    case_info: Optional[CaseInfo] = Field(
        None, description="Structured case information"
    )
    instructions: Optional[str] = Field(
        None, description="Additional instructions for generation"
    )
    template: Optional[str] = Field(
        None, description="Custom template to follow"
    )
    model: Optional[str] = Field(
        None, description="AI model to use (defaults to gpt-4o-mini)"
    )
    temperature: Optional[float] = Field(
        0.7, ge=0, le=2, description="Sampling temperature"
    )
    max_tokens: Optional[int] = Field(
        None, description="Maximum tokens for completion"
    )


class TokenUsageResponse(BaseModel):
    """Token usage information."""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost: float


class GenerateResponse(BaseModel):
    """Response from demand letter generation."""
    content: str = Field(..., description="Generated demand letter content")
    model: str = Field(..., description="Model used for generation")
    usage: TokenUsageResponse = Field(..., description="Token usage statistics")
    finish_reason: Optional[str] = Field(None, description="Reason for completion")
    generated_at: datetime = Field(
        default_factory=datetime.utcnow, description="Timestamp of generation"
    )


class RefineRequest(BaseModel):
    """Request to refine an existing draft."""
    current_draft: str = Field(..., description="Current demand letter draft")
    instructions: str = Field(..., description="Refinement instructions")
    documents: Optional[list[DocumentInput]] = Field(
        None, description="Original source documents for reference"
    )
    model: Optional[str] = Field(None, description="AI model to use")
    temperature: Optional[float] = Field(0.7, ge=0, le=2)


class RefineResponse(BaseModel):
    """Response from draft refinement."""
    content: str = Field(..., description="Refined demand letter content")
    model: str
    usage: TokenUsageResponse
    finish_reason: Optional[str] = None
    refined_at: datetime = Field(default_factory=datetime.utcnow)


class AnalyzeRequest(BaseModel):
    """Request to analyze source documents."""
    documents: list[DocumentInput] = Field(
        ..., description="Documents to analyze"
    )
    model: Optional[str] = Field(None, description="AI model to use")


class AnalyzeResponse(BaseModel):
    """Response from document analysis."""
    analysis: str = Field(..., description="Structured analysis of documents")
    document_count: int
    total_characters: int
    model: str
    usage: TokenUsageResponse
    analyzed_at: datetime = Field(default_factory=datetime.utcnow)


class ExtractTextRequest(BaseModel):
    """Request to extract text from a document."""
    filename: str
    content: str  # Base64 encoded


class ExtractTextResponse(BaseModel):
    """Response from text extraction."""
    text: str
    page_count: Optional[int] = None
    word_count: int
    char_count: int
    file_type: str
    success: bool
    error_message: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str
    openai_configured: bool
    version: str


class SessionStatsResponse(BaseModel):
    """Session statistics response."""
    total_prompt_tokens: int
    total_completion_tokens: int
    total_cost: float
    request_count: int
    average_cost_per_request: float


class ErrorResponse(BaseModel):
    """Error response."""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None
