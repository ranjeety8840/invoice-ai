from pydantic_settings import BaseSettings
from pydantic import validator
from typing import List
import os
import json


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Invoice Extraction AI"
    DEBUG: bool = False
    SECRET_KEY: str = "change-this-in-production-super-secret-key"

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    SUPABASE_STORAGE_BUCKET: str = os.getenv("SUPABASE_STORAGE_BUCKET", "invoices")

    # AI / LLM
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o")

    # OCR
    OCR_PROVIDER: str = os.getenv("OCR_PROVIDER", "openai_vision")
    TESSERACT_CMD: str = os.getenv("TESSERACT_CMD", "tesseract")

    # File Upload
    MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "20"))
    ALLOWED_EXTENSIONS: List[str] = ["jpg", "jpeg", "png", "pdf", "tiff", "webp"]

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    @validator("ALLOWED_ORIGINS", pre=True)
    def parse_origins(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Format similarity
    FORMAT_SIMILARITY_THRESHOLD: float = 0.75

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()