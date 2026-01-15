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


class ExportOptionsModel(BaseModel):
    """Export configuration options."""
    font_name: Optional[str] = Field("Times New Roman", description="Font family to use")
    font_size: Optional[int] = Field(12, ge=8, le=24, description="Font size in points")
    margin_top: Optional[float] = Field(1.0, ge=0.5, le=2.0, description="Top margin in inches")
    margin_bottom: Optional[float] = Field(1.0, ge=0.5, le=2.0, description="Bottom margin in inches")
    margin_left: Optional[float] = Field(1.0, ge=0.5, le=2.0, description="Left margin in inches")
    margin_right: Optional[float] = Field(1.0, ge=0.5, le=2.0, description="Right margin in inches")
    line_spacing: Optional[float] = Field(1.0, ge=1.0, le=3.0, description="Line spacing multiplier")
    include_letterhead: Optional[bool] = Field(False, description="Include firm letterhead")
    letterhead_firm_name: Optional[str] = Field(None, description="Firm name for letterhead")
    letterhead_address: Optional[str] = Field(None, description="Firm address for letterhead")
    letterhead_phone: Optional[str] = Field(None, description="Firm phone for letterhead")
    letterhead_email: Optional[str] = Field(None, description="Firm email for letterhead")
    include_page_numbers: Optional[bool] = Field(True, description="Include page numbers")
    include_date: Optional[bool] = Field(True, description="Include current date")


class ExportRequest(BaseModel):
    """Request to export a demand letter to Word document."""
    content: str = Field(..., description="The demand letter content to export")
    title: str = Field(..., description="Document title")
    options: Optional[ExportOptionsModel] = Field(None, description="Export options")


class BatchExportItem(BaseModel):
    """Single item in a batch export request."""
    id: str = Field(..., description="Demand letter ID")
    content: str = Field(..., description="Demand letter content")
    title: str = Field(..., description="Document title")
    filename: Optional[str] = Field(None, description="Output filename (without extension)")


class BatchExportRequest(BaseModel):
    """Request to export multiple demand letters."""
    items: list[BatchExportItem] = Field(..., description="Demand letters to export")
    options: Optional[ExportOptionsModel] = Field(None, description="Export options (applied to all)")


class BatchExportResponse(BaseModel):
    """Response from batch export - returns a ZIP file."""
    success: bool
    file_count: int
    total_size: int
    errors: list[str] = Field(default_factory=list)


class TestPromptRequest(BaseModel):
    """Request to test a custom prompt template."""
    system_prompt: str = Field(..., description="System prompt to test")
    user_prompt: str = Field(..., description="User prompt to test")
    sample_content: str = Field(..., description="Sample content to use in testing")
    model: Optional[str] = Field(None, description="AI model to use")
    max_tokens: Optional[int] = Field(1000, description="Maximum tokens for test response")
    temperature: Optional[float] = Field(0.7, ge=0, le=2)


class TestPromptResponse(BaseModel):
    """Response from prompt testing."""
    content: str = Field(..., description="Generated content from the test")
    model: str = Field(..., description="Model used")
    usage: TokenUsageResponse = Field(..., description="Token usage")
    finish_reason: Optional[str] = None
    tested_at: datetime = Field(default_factory=datetime.utcnow)
