"""Tests for prompt engineering service."""

import pytest
from app.services.prompts import PromptBuilder, get_prompt_builder, PROMPT_TEMPLATES


class TestPromptBuilder:
    """Test cases for PromptBuilder class."""

    def test_get_prompt_builder_singleton(self):
        """Test that get_prompt_builder returns singleton."""
        builder1 = get_prompt_builder()
        builder2 = get_prompt_builder()
        assert builder1 is builder2

    def test_build_demand_letter_prompt(self):
        """Test building demand letter generation prompt."""
        builder = PromptBuilder()

        system_prompt, user_prompt = builder.build_demand_letter_prompt(
            documents_text="Sample document content",
            case_info="Case #12345",
            instructions="Focus on medical damages",
            template="Standard format",
        )

        assert system_prompt is not None
        assert len(system_prompt) > 100
        assert "legal" in system_prompt.lower()

        assert user_prompt is not None
        assert "Sample document content" in user_prompt
        assert "Case #12345" in user_prompt
        assert "Focus on medical damages" in user_prompt

    def test_build_demand_letter_prompt_minimal(self):
        """Test building prompt with minimal inputs."""
        builder = PromptBuilder()

        system_prompt, user_prompt = builder.build_demand_letter_prompt(
            documents_text="Document text only",
        )

        assert system_prompt is not None
        assert user_prompt is not None
        assert "Document text only" in user_prompt
        assert "No specific case information" in user_prompt

    def test_build_refinement_prompt(self):
        """Test building refinement prompt."""
        builder = PromptBuilder()

        system_prompt, user_prompt = builder.build_refinement_prompt(
            current_draft="Current draft content here",
            instructions="Make it more formal",
            documents_text="Original source docs",
        )

        assert system_prompt is not None
        assert "refine" in system_prompt.lower()

        assert user_prompt is not None
        assert "Current draft content here" in user_prompt
        assert "Make it more formal" in user_prompt
        assert "Original source docs" in user_prompt

    def test_build_analysis_prompt(self):
        """Test building document analysis prompt."""
        builder = PromptBuilder()

        system_prompt, user_prompt = builder.build_analysis_prompt(
            documents_text="Documents to analyze",
        )

        assert system_prompt is not None
        assert "analyz" in system_prompt.lower()

        assert user_prompt is not None
        assert "Documents to analyze" in user_prompt

    def test_get_template(self):
        """Test getting a specific template."""
        builder = PromptBuilder()

        template = builder.get_template("demand_letter")
        assert template is not None
        assert template.name == "demand_letter"
        assert template.system_prompt is not None

        nonexistent = builder.get_template("nonexistent")
        assert nonexistent is None

    def test_list_templates(self):
        """Test listing all templates."""
        builder = PromptBuilder()
        templates = builder.list_templates()

        assert len(templates) >= 3
        names = [t["name"] for t in templates]
        assert "demand_letter" in names
        assert "refinement" in names
        assert "analysis" in names


class TestPromptTemplates:
    """Test cases for prompt template constants."""

    def test_demand_letter_template_exists(self):
        """Test that demand letter template exists."""
        assert "demand_letter" in PROMPT_TEMPLATES
        template = PROMPT_TEMPLATES["demand_letter"]
        assert template.system_prompt is not None
        assert template.user_prompt_template is not None

    def test_refinement_template_exists(self):
        """Test that refinement template exists."""
        assert "refinement" in PROMPT_TEMPLATES
        template = PROMPT_TEMPLATES["refinement"]
        assert template.system_prompt is not None

    def test_analysis_template_exists(self):
        """Test that analysis template exists."""
        assert "analysis" in PROMPT_TEMPLATES
        template = PROMPT_TEMPLATES["analysis"]
        assert template.system_prompt is not None

    def test_template_placeholders(self):
        """Test that templates have expected placeholders."""
        demand = PROMPT_TEMPLATES["demand_letter"]
        assert "{documents}" in demand.user_prompt_template
        assert "{case_info}" in demand.user_prompt_template

        refine = PROMPT_TEMPLATES["refinement"]
        assert "{current_draft}" in refine.user_prompt_template
        assert "{instructions}" in refine.user_prompt_template
