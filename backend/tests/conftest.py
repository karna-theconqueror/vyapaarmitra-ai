"""Test bootstrap: hermetic DB + no real LLM calls.

DATABASE_PATH must be set before `app` is imported, because app.database
reads it at import time. This keeps tests off the demo database file.
"""

import os
import tempfile

_TMP_DIR = tempfile.mkdtemp(prefix="vyapaarmitra-test-")
os.environ["DATABASE_PATH"] = os.path.join(_TMP_DIR, "test.db")

# Tests are deterministic: never call a real LLM endpoint.
for _var in ("ADVISOR_LLM_URL", "ADVISOR_LLM_KEY", "ADVISOR_LLM_MODEL"):
    os.environ.pop(_var, None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:  # runs lifespan: create tables + seed demo shop
        yield c


@pytest.fixture(autouse=True)
def clean_seed(client):
    """Every test starts from the pristine demo seed."""
    response = client.post("/api/data/reset")
    assert response.status_code == 200
    yield
