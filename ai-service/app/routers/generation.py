"""
AI Generation Router

API endpoints for demand letter generation, refinement, and document analysis.
"""

import base64
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..models.generation import (
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
from ..services.openai_client import get_openai_client, OpenAIClient
from ..services.document_parser import get_document_parser, DocumentParser
from ..services.prompts import get_prompt_builder, PromptBuilder

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Generation"])


def get_services() -> tuple[OpenAIClient, DocumentParser, PromptBuilder]:
    """Get all required service instances."""
    return get_openai_client(), get_document_parser(), get_prompt_builder()


def decode_document_content(content: str, filename: str) -> bytes:
    """Decode base64 encoded document content."""
    try:
        return base64.b64decode(content)
    except Exception as e:
        logger.error(f"Failed to decode document {filename}: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to decode document {filename}: Invalid base64 encoding",
        )


def build_case_info_text(case_info) -> str:
    """Build case information text from CaseInfo model."""
    if not case_info:
        return "No specific case information provided."

    parts = []
    if case_info.case_reference:
        parts.append(f"Case Reference: {case_info.case_reference}")
    if case_info.client_name:
        parts.append(f"Client Name: {case_info.client_name}")
    if case_info.incident_date:
        parts.append(f"Incident Date: {case_info.incident_date}")
    if case_info.defendant_name:
        parts.append(f"Defendant: {case_info.defendant_name}")
    if case_info.defendant_insurance:
        parts.append(f"Defendant Insurance: {case_info.defendant_insurance}")
    if case_info.claim_number:
        parts.append(f"Claim Number: {case_info.claim_number}")
    if case_info.additional_info:
        parts.append(f"Additional Info: {case_info.additional_info}")

    return "\n".join(parts) if parts else "No specific case information provided."


@router.post(
    "/generate",
    response_model=GenerateResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def generate_demand_letter(request: GenerateRequest) -> GenerateResponse:
    """
    Generate a demand letter from source documents.

    This endpoint accepts source documents (PDF, DOCX, TXT) and generates
    a complete demand letter using AI. The documents should be base64 encoded.

    **Required:**
    - At least one source document

    **Optional:**
    - Case information (client name, incident date, etc.)
    - Additional instructions for the AI
    - Custom template to follow
    - Model selection and parameters
    """
    openai_client, parser, prompt_builder = get_services()

    if not request.documents:
        raise HTTPException(status_code=400, detail="At least one document is required")

    # Parse all documents
    parsed_docs = []
    for doc in request.documents:
        try:
            content_bytes = decode_document_content(doc.content, doc.filename)
            parsed = parser.parse(content_bytes, doc.filename)

            if not parsed.success:
                logger.warning(f"Failed to parse {doc.filename}: {parsed.error_message}")
                # Continue with other documents

            parsed_docs.append(parsed)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error processing document {doc.filename}: {e}")
            continue

    # Combine document texts
    successful_docs = [d for d in parsed_docs if d.success]
    if not successful_docs:
        raise HTTPException(
            status_code=400,
            detail="No documents could be successfully parsed. Please check file formats.",
        )

    documents_text = parser.combine_documents(successful_docs)

    # Check token limits
    token_check = openai_client.check_token_limit(documents_text, request.model)
    if not token_check["fits"]:
        raise HTTPException(
            status_code=400,
            detail=f"Documents exceed token limit. Estimated {token_check['estimated_tokens']} tokens, max {token_check['max_tokens']}",
        )

    # Build prompts
    case_info_text = build_case_info_text(request.case_info)
    system_prompt, user_prompt = prompt_builder.build_demand_letter_prompt(
        documents_text=documents_text,
        case_info=case_info_text,
        instructions=request.instructions,
        template=request.template,
    )

    # Generate
    try:
        response = await openai_client.generate(
            messages=[{"role": "user", "content": user_prompt}],
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature or 0.7,
            system_prompt=system_prompt,
        )

        return GenerateResponse(
            content=response.content,
            model=response.model,
            usage=TokenUsageResponse(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
                estimated_cost=response.usage.estimated_cost,
            ),
            finish_reason=response.finish_reason,
        )

    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate demand letter: {str(e)}",
        )


@router.post("/generate/stream")
async def generate_demand_letter_stream(request: GenerateRequest):
    """
    Generate a demand letter with streaming response.

    Same as /generate but returns chunks as they are generated
    for real-time feedback in the UI.
    """
    openai_client, parser, prompt_builder = get_services()

    if not request.documents:
        raise HTTPException(status_code=400, detail="At least one document is required")

    # Parse documents
    parsed_docs = []
    for doc in request.documents:
        content_bytes = decode_document_content(doc.content, doc.filename)
        parsed = parser.parse(content_bytes, doc.filename)
        if parsed.success:
            parsed_docs.append(parsed)

    if not parsed_docs:
        raise HTTPException(status_code=400, detail="No documents could be parsed")

    documents_text = parser.combine_documents(parsed_docs)

    # Build prompts
    case_info_text = build_case_info_text(request.case_info)
    system_prompt, user_prompt = prompt_builder.build_demand_letter_prompt(
        documents_text=documents_text,
        case_info=case_info_text,
        instructions=request.instructions,
        template=request.template,
    )

    async def stream_generator() -> AsyncGenerator[str, None]:
        try:
            async for chunk in openai_client.generate_stream(
                messages=[{"role": "user", "content": user_prompt}],
                model=request.model,
                max_tokens=request.max_tokens,
                temperature=request.temperature or 0.7,
                system_prompt=system_prompt,
            ):
                yield chunk
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"\n\n[Error: {str(e)}]"

    return StreamingResponse(
        stream_generator(),
        media_type="text/plain",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.post(
    "/refine",
    response_model=RefineResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def refine_draft(request: RefineRequest) -> RefineResponse:
    """
    Refine an existing demand letter draft.

    Takes a current draft and attorney instructions to produce
    an improved version. Original source documents can be provided
    for reference.
    """
    openai_client, parser, prompt_builder = get_services()

    if not request.current_draft.strip():
        raise HTTPException(status_code=400, detail="Current draft cannot be empty")

    if not request.instructions.strip():
        raise HTTPException(status_code=400, detail="Refinement instructions are required")

    # Optionally parse source documents for reference
    documents_text = None
    if request.documents:
        parsed_docs = []
        for doc in request.documents:
            content_bytes = decode_document_content(doc.content, doc.filename)
            parsed = parser.parse(content_bytes, doc.filename)
            if parsed.success:
                parsed_docs.append(parsed)

        if parsed_docs:
            documents_text = parser.combine_documents(parsed_docs)

    # Build prompts
    system_prompt, user_prompt = prompt_builder.build_refinement_prompt(
        current_draft=request.current_draft,
        instructions=request.instructions,
        documents_text=documents_text,
    )

    try:
        response = await openai_client.generate(
            messages=[{"role": "user", "content": user_prompt}],
            model=request.model,
            temperature=request.temperature or 0.7,
            system_prompt=system_prompt,
        )

        return RefineResponse(
            content=response.content,
            model=response.model,
            usage=TokenUsageResponse(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
                estimated_cost=response.usage.estimated_cost,
            ),
            finish_reason=response.finish_reason,
        )

    except Exception as e:
        logger.error(f"Refinement failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refine draft: {str(e)}",
        )


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def analyze_documents(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze source documents and extract key information.

    Returns a structured analysis of the documents including
    incident details, parties, damages, and liability factors.
    """
    openai_client, parser, prompt_builder = get_services()

    if not request.documents:
        raise HTTPException(status_code=400, detail="At least one document is required")

    # Parse documents
    parsed_docs = []
    total_chars = 0
    for doc in request.documents:
        content_bytes = decode_document_content(doc.content, doc.filename)
        parsed = parser.parse(content_bytes, doc.filename)
        if parsed.success:
            parsed_docs.append(parsed)
            total_chars += parsed.char_count

    if not parsed_docs:
        raise HTTPException(status_code=400, detail="No documents could be parsed")

    documents_text = parser.combine_documents(parsed_docs)

    # Build prompts
    system_prompt, user_prompt = prompt_builder.build_analysis_prompt(documents_text)

    try:
        response = await openai_client.generate(
            messages=[{"role": "user", "content": user_prompt}],
            model=request.model,
            temperature=0.3,  # Lower temperature for factual analysis
            system_prompt=system_prompt,
        )

        return AnalyzeResponse(
            analysis=response.content,
            document_count=len(parsed_docs),
            total_characters=total_chars,
            model=response.model,
            usage=TokenUsageResponse(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
                estimated_cost=response.usage.estimated_cost,
            ),
        )

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze documents: {str(e)}",
        )


@router.post(
    "/extract-text",
    response_model=ExtractTextResponse,
    responses={400: {"model": ErrorResponse}},
)
async def extract_text(request: ExtractTextRequest) -> ExtractTextResponse:
    """
    Extract text from a document without AI processing.

    Useful for previewing document contents before generation.
    """
    parser = get_document_parser()

    try:
        content_bytes = decode_document_content(request.content, request.filename)
        parsed = parser.parse(content_bytes, request.filename)

        return ExtractTextResponse(
            text=parsed.text,
            page_count=parsed.page_count,
            word_count=parsed.word_count,
            char_count=parsed.char_count,
            file_type=parsed.file_type,
            success=parsed.success,
            error_message=parsed.error_message,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Text extraction failed: {e}")
        return ExtractTextResponse(
            text="",
            word_count=0,
            char_count=0,
            file_type="unknown",
            success=False,
            error_message=str(e),
        )


@router.get("/stats", response_model=SessionStatsResponse)
async def get_session_stats() -> SessionStatsResponse:
    """
    Get token usage and cost statistics for the current session.
    """
    try:
        openai_client = get_openai_client()
        stats = openai_client.get_session_stats()

        return SessionStatsResponse(
            total_prompt_tokens=stats["total_prompt_tokens"],
            total_completion_tokens=stats["total_completion_tokens"],
            total_cost=stats["total_cost"],
            request_count=stats["request_count"],
            average_cost_per_request=stats["average_cost_per_request"],
        )
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_models():
    """
    List available AI models and their configurations.
    """
    from ..services.openai_client import MODEL_CONFIG

    return {
        "models": [
            {
                "id": model_id,
                "input_price_per_1k": config["input_price_per_1k"],
                "output_price_per_1k": config["output_price_per_1k"],
                "max_tokens": config["max_tokens"],
                "default_max_completion": config["default_max_completion"],
            }
            for model_id, config in MODEL_CONFIG.items()
        ],
        "default": "gpt-4o-mini",
    }


@router.get("/templates")
async def list_prompt_templates():
    """
    List available prompt templates.
    """
    prompt_builder = get_prompt_builder()
    return {"templates": prompt_builder.list_templates()}
