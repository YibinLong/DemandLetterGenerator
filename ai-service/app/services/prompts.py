"""
Prompt Engineering for Demand Letter Generation

Contains carefully crafted prompts for generating legal demand letters
based on source documents and attorney instructions.
"""

from typing import Optional
from pydantic import BaseModel


class PromptTemplate(BaseModel):
    """A reusable prompt template with variable substitution."""
    name: str
    system_prompt: str
    user_prompt_template: str
    description: str


# System prompt for demand letter generation
DEMAND_LETTER_SYSTEM_PROMPT = """You are an expert legal writing assistant specializing in drafting demand letters for personal injury attorneys.

Your role is to:
1. Analyze provided source documents (medical records, police reports, incident reports, etc.)
2. Extract key facts relevant to the case
3. Draft professional, persuasive demand letters that follow legal industry standards

Guidelines for demand letter generation:
- Use formal, professional legal language
- Be factual and precise - only include information supported by source documents
- Present damages and injuries clearly and comprehensively
- Include relevant legal theories and liability analysis when supported by facts
- Maintain an assertive but professional tone
- Structure the letter logically: Introduction, Facts, Liability, Damages, Demand, Conclusion
- Do NOT fabricate facts or include information not present in source documents
- When information is missing or unclear, indicate this with [PLACEHOLDER: description]

Important: Always cite which source document supports each factual claim when possible."""


DEMAND_LETTER_USER_TEMPLATE = """Please draft a demand letter based on the following source documents and instructions.

**Case Information:**
{case_info}

**Source Documents:**
{documents}

**Additional Instructions:**
{instructions}

**Template to Follow (if provided):**
{template}

Please generate a complete demand letter that:
1. Addresses all relevant facts from the source documents
2. Follows the provided template structure (if any)
3. Incorporates the additional instructions
4. Uses appropriate legal language and formatting
5. Clearly presents the demand amount and basis for calculation

If any critical information is missing from the source documents, use [PLACEHOLDER: description] to indicate where the attorney needs to fill in details."""


# Refinement prompts for iterative improvements
REFINEMENT_SYSTEM_PROMPT = """You are an expert legal writing assistant helping to refine and improve a demand letter draft.

Your task is to modify the existing draft according to the attorney's specific instructions while:
- Maintaining professional legal language
- Preserving factual accuracy
- Keeping the overall document structure intact unless instructed otherwise
- Only making changes that align with the provided instructions

Be precise in your modifications - do not make unnecessary changes beyond what is requested."""


REFINEMENT_USER_TEMPLATE = """Please refine the following demand letter draft according to the attorney's instructions.

**Current Draft:**
{current_draft}

**Refinement Instructions:**
{instructions}

**Original Source Documents (for reference):**
{documents}

Please provide the updated demand letter with the requested changes incorporated. Explain what changes were made at the end of your response in a "Changes Made" section."""


# Analysis prompt for document summarization
DOCUMENT_ANALYSIS_SYSTEM_PROMPT = """You are an expert legal document analyst. Your task is to analyze source documents and extract key information relevant for drafting a demand letter.

Focus on identifying:
1. Incident details (date, location, circumstances)
2. Parties involved (plaintiff, defendant, witnesses)
3. Injuries and medical treatment
4. Economic damages (medical bills, lost wages, property damage)
5. Non-economic damages (pain and suffering indicators)
6. Liability factors and evidence
7. Insurance information if available

Be thorough but concise. Only include information that is explicitly stated in the documents."""


DOCUMENT_ANALYSIS_USER_TEMPLATE = """Please analyze the following source documents and extract key information for a demand letter.

**Source Documents:**
{documents}

Provide a structured analysis with the following sections:
1. **Incident Summary**: What happened, when, and where
2. **Parties**: Plaintiff, defendant(s), and relevant witnesses
3. **Injuries and Treatment**: Description of injuries and medical care received
4. **Economic Damages**: Quantifiable losses with amounts if stated
5. **Non-Economic Damages**: Indicators of pain, suffering, and quality of life impact
6. **Liability Analysis**: Evidence supporting fault/negligence
7. **Missing Information**: Critical information not found in documents"""


# Pre-built prompt templates
PROMPT_TEMPLATES = {
    "demand_letter": PromptTemplate(
        name="demand_letter",
        system_prompt=DEMAND_LETTER_SYSTEM_PROMPT,
        user_prompt_template=DEMAND_LETTER_USER_TEMPLATE,
        description="Generate a complete demand letter from source documents",
    ),
    "refinement": PromptTemplate(
        name="refinement",
        system_prompt=REFINEMENT_SYSTEM_PROMPT,
        user_prompt_template=REFINEMENT_USER_TEMPLATE,
        description="Refine an existing demand letter based on instructions",
    ),
    "analysis": PromptTemplate(
        name="analysis",
        system_prompt=DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
        user_prompt_template=DOCUMENT_ANALYSIS_USER_TEMPLATE,
        description="Analyze source documents for key case information",
    ),
}


class PromptBuilder:
    """
    Builds prompts for AI generation by combining templates with input data.
    """

    def __init__(self):
        self.templates = PROMPT_TEMPLATES

    def build_demand_letter_prompt(
        self,
        documents_text: str,
        case_info: Optional[str] = None,
        instructions: Optional[str] = None,
        template: Optional[str] = None,
    ) -> tuple[str, str]:
        """
        Build prompts for demand letter generation.

        Returns:
            Tuple of (system_prompt, user_prompt)
        """
        template_obj = self.templates["demand_letter"]

        user_prompt = template_obj.user_prompt_template.format(
            case_info=case_info or "No specific case information provided.",
            documents=documents_text,
            instructions=instructions or "None - use your best judgment for format and content.",
            template=template or "No template provided - use standard demand letter format.",
        )

        return template_obj.system_prompt, user_prompt

    def build_refinement_prompt(
        self,
        current_draft: str,
        instructions: str,
        documents_text: Optional[str] = None,
    ) -> tuple[str, str]:
        """
        Build prompts for draft refinement.

        Returns:
            Tuple of (system_prompt, user_prompt)
        """
        template_obj = self.templates["refinement"]

        user_prompt = template_obj.user_prompt_template.format(
            current_draft=current_draft,
            instructions=instructions,
            documents=documents_text or "Original source documents not provided for this refinement.",
        )

        return template_obj.system_prompt, user_prompt

    def build_analysis_prompt(self, documents_text: str) -> tuple[str, str]:
        """
        Build prompts for document analysis.

        Returns:
            Tuple of (system_prompt, user_prompt)
        """
        template_obj = self.templates["analysis"]

        user_prompt = template_obj.user_prompt_template.format(
            documents=documents_text,
        )

        return template_obj.system_prompt, user_prompt

    def get_template(self, name: str) -> Optional[PromptTemplate]:
        """Get a prompt template by name."""
        return self.templates.get(name)

    def list_templates(self) -> list[dict]:
        """List all available templates."""
        return [
            {"name": t.name, "description": t.description}
            for t in self.templates.values()
        ]


# Singleton instance
_builder: Optional[PromptBuilder] = None


def get_prompt_builder() -> PromptBuilder:
    """Get or create the singleton PromptBuilder instance."""
    global _builder
    if _builder is None:
        _builder = PromptBuilder()
    return _builder
