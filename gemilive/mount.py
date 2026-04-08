from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import GemiliveSettings
from .router import create_router


def mount_gemilive(
    app: FastAPI,
    *,
    google_api_key: Optional[str] = None,
    model: Optional[str] = None,
    voice: Optional[str] = None,
    system_prompt: Optional[str] = None,
    allow_origins: List[str] = ["*"],
    debug_mode: bool = False,
) -> None:
    """
    Mount the Gemini Live AI WebSocket endpoint onto a FastAPI app.

    All keyword arguments are optional overrides. When omitted, values are
    read from environment variables (GOOGLE_API_KEY, MODEL_NAME, etc.).

    Args:
        app:            The FastAPI application instance.
        google_api_key: Gemini API key. Falls back to GOOGLE_API_KEY env var.
        model:          Gemini Live model name. Falls back to MODEL_NAME env var.
        voice:          Gemini voice (e.g. "Aoede", "Charon"). None = Gemini default.
        system_prompt:  Server-side system prompt baked in at mount time.
                        Client-supplied prompts are appended as extra context.
        allow_origins:  CORS origins to allow for WebSocket connections.
                        Defaults to ["*"]. Restrict in production.
        debug_mode:     Print verbose logs. Falls back to GEMILIVE_DEBUG env var.

    Example::

        from fastapi import FastAPI
        from gemilive import mount_gemilive

        app = FastAPI()
        mount_gemilive(app, system_prompt="You are a helpful assistant.")
    """
    # Build settings, applying any explicit overrides on top of env vars
    settings = GemiliveSettings()
    if google_api_key is not None:
        settings = settings.model_copy(update={"google_api_key": google_api_key})
    if model is not None:
        settings = settings.model_copy(update={"model": model})
    if voice is not None:
        settings = settings.model_copy(update={"voice": voice})
    if system_prompt is not None:
        settings = settings.model_copy(update={"system_prompt": system_prompt})
    if debug_mode:
        settings = settings.model_copy(update={"debug_mode": True})

    # Add CORS middleware so separate-origin frontends can reach the WebSocket
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register the WebSocket router
    router = create_router(settings)
    app.include_router(router)
