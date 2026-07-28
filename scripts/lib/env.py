"""Shared .env.local loading for the pipeline scripts.

Every script under scripts/ needs the same credentials out of the repo-root
.env.local; this is the one loader they all call before reading os.environ.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def load_env_local() -> None:
    """Load repo-root .env.local (falling back to ./.env.local) into os.environ.

    Values always override what is already in the environment so an empty shell
    variable can't shadow a real key. Degrades to a no-op when python-dotenv is
    not installed — the .venv-docling environment does not have it.
    """
    try:
        from dotenv import dotenv_values
    except ImportError:
        return

    env_file = REPO_ROOT / ".env.local"
    if not env_file.exists():
        env_file = Path(".env.local")
    for key, value in dotenv_values(str(env_file)).items():
        if value is not None:
            os.environ[key] = value
