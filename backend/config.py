import sys
import os
import json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "Invoice Extraction AI"
    DEBUG: bool = False
    SECRET_KEY: str = "change-this-in-production"

    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    DATABASE_URL: str = ""
    SUPABASE_STORAGE_BUCKET: str = "invoices"

    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4o"

    OCR_PROVIDER: str = "openai_vision"
    TESSERACT_CMD: str = "tesseract"

    MAX_FILE_SIZE_MB: int = 20
    ALLOWED_EXTENSIONS: List[str] = ["jpg", "jpeg", "png", "pdf", "tiff", "webp"]

    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    FORMAT_SIMILARITY_THRESHOLD: float = 0.75

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()