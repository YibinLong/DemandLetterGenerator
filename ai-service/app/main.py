import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables from root .env
root_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(root_dir / ".env")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Import routers
from .routers import generation


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    logger.info("Starting Demand Letter AI Service")
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        logger.info("OpenAI API key configured")
    else:
        logger.warning("OPENAI_API_KEY not set - AI features will not work")
    yield
    # Shutdown
    logger.info("Shutting down Demand Letter AI Service")


app = FastAPI(
    title="Demand Letter AI Service",
    description="AI-powered service for generating demand letters using OpenAI",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
]

# Add origins from environment if set
if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))
if os.getenv("BACKEND_URL"):
    origins.append(os.getenv("BACKEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(generation.router)


@app.get("/")
async def root():
    return {
        "message": "Demand Letter AI Service",
        "version": "1.0.0",
        "docs_url": "/docs",
        "endpoints": {
            "generate": "/ai/generate",
            "refine": "/ai/refine",
            "analyze": "/ai/analyze",
            "extract_text": "/ai/extract-text",
            "models": "/ai/models",
            "templates": "/ai/templates",
            "stats": "/ai/stats",
        },
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ai-service",
        "version": "1.0.0",
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
    }
