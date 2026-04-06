import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    google_api_key: str = ""
    model_name: str = "gemini-3.1-flash-live-preview"
    authorized_app_tokens: str = ""
    debug_mode: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def valid_tokens(self) -> List[str]:
        if not self.authorized_app_tokens:
            return []
        return [t.strip() for t in self.authorized_app_tokens.split(",") if t.strip()]

settings = Settings()
