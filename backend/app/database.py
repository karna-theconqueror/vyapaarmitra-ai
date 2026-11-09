import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
# DATABASE_PATH lets a host point SQLite at a mounted volume (or a test
# fixture at a temp file). Defaults to backend/vyapaarmitra.db.
DATABASE_PATH = Path(os.getenv("DATABASE_PATH") or (BASE_DIR / "vyapaarmitra.db"))
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
