"""
Configuration settings using pydantic-settings
"""
from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Invoice Extraction AI"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-this-in-production-super-secret-key")

    # Database - Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")        # anon key
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")  # service_role key
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")         # postgres direct URL

    # Storage
    SUPABASE_STORAGE_BUCKET: str = os.getenv("SUPABASE_STORAGE_BUCKET", "invoices")

    # AI / LLM
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")  # "openai" or "anthropic"
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o")

    # OCR
    OCR_PROVIDER: str = os.getenv("OCR_PROVIDER", "tesseract")  # "tesseract" or "openai_vision"
    TESSERACT_CMD: str = os.getenv("TESSERACT_CMD", "tesseract")

    # File Upload
    MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "20"))
    ALLOWED_EXTENSIONS: List[str] = ["jpg", "jpeg", "png", "pdf", "tiff", "webp"]

    # CORS
    ALLOWED_ORIGINS: List[str] = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:5173,https://your-frontend-domain.vercel.app"
    ).split(",")

    # Similarity threshold for format detection
    FORMAT_SIMILARITY_THRESHOLD: float = float(os.getenv("FORMAT_SIMILARITY_THRESHOLD", "0.75"))

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
