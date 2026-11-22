import json
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# backend/, the root of the checkout as far as the app is concerned.
BASE_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    # NoDecode keeps pydantic-settings from insisting this is JSON. A hosting
    # dashboard is a single-line text box, and typing one bare URL into it is
    # the obvious thing to do — so accept that, a comma-separated list, or
    # JSON, rather than failing at startup over punctuation.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:5190",
        "http://127.0.0.1:5190",
    ]
    JWT_SECRET: str
    # Encrypts the few fields that must be readable but never stored in the
    # clear. Generated from JWT_SECRET when unset, so nothing breaks on an
    # existing install — set it explicitly before going anywhere near live.
    DATA_ENCRYPTION_KEY: str | None = None

    # Outgoing mail goes through Zoho CPaaS. Without a key nothing is sent,
    # and queued messages simply wait.
    ZOHO_CPAAS_URL: str = "https://cpaas.zoho.in/v1.1/email"
    ZOHO_CPAAS_KEY: str | None = None
    MAIL_FROM_ADDRESS: str | None = None
    MAIL_FROM_NAME: str = "HRMS"
    MAIL_REPLY_TO: str | None = None
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 15
    # Shift times are wall-clock in this zone.
    TIMEZONE: str = "Asia/Kolkata"

    # Where uploads and database dumps are kept. A local checkout leaves this
    # unset and they sit beside the code; a hosted install points it at a
    # mounted disk, because a container's own filesystem is thrown away on
    # every deploy and would take the employee photos with it.
    DATA_DIR: Path | None = None

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _origins(cls, value):
        if not isinstance(value, str):
            return value

        text = value.strip()
        if text.startswith("["):
            return [str(o).strip().rstrip("/") for o in json.loads(text)]
        # A trailing slash makes the origin stop matching the browser's, and
        # the failure looks like a CORS bug rather than a typo.
        return [o.strip().rstrip("/") for o in text.split(",") if o.strip()]

    @field_validator("DATABASE_URL")
    @classmethod
    def _driver(cls, url: str) -> str:
        """Hosts hand out `postgres://`; SQLAlchemy needs the driver named."""
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @property
    def upload_dir(self) -> Path:
        return (self.DATA_DIR or BASE_DIR) / "uploads"

    @property
    def backup_dir(self) -> Path:
        return (self.DATA_DIR or BASE_DIR) / "backups"


settings = Settings()
