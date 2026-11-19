import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.automations import router as automation_router
from app.core.database import Base, Session, engine
from app.services.requests import seed


def create_app(database_engine=engine, sessions=Session, seed_demo=None):
    if seed_demo is None:
        seed_demo = os.getenv("FLOWPILOT_SEED", "true").lower() == "true"

    @asynccontextmanager
    async def lifespan(_app):
        Base.metadata.create_all(database_engine)
        if seed_demo:
            with sessions.begin() as session:
                seed(session)
        yield

    app = FastAPI(title="FlowPilot API", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.sessions = sessions
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(router)
    app.include_router(automation_router)
    return app


app = create_app()
