from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class GemiliveSettings(BaseSettings):
    """
    Configuration for the gemilive package.

    All fields can be set via environment variables.
    The GOOGLE_API_KEY env var maps directly (no prefix).
    All other settings use the GEMILIVE_ prefix, e.g. GEMILIVE_VOICE.
    """

    google_api_key: str = Field(default="", validation_alias="GOOGLE_API_KEY")
    model: str = Field(
        default="gemini-3.1-flash-live-preview",
        validation_alias="MODEL_NAME",
    )
    voice: Optional[str] = Field(
        default=None,
        validation_alias="GEMILIVE_VOICE",
        description="Gemini voice name (e.g. 'Aoede', 'Charon'). Omit to use Gemini default.",
    )
    system_prompt: Optional[str] = Field(
        default=None,
        validation_alias="GEMILIVE_SYSTEM_PROMPT",
        description="Server-side system prompt baked in at mount time.",
    )
    debug_mode: bool = Field(default=False, validation_alias="GEMILIVE_DEBUG")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )
