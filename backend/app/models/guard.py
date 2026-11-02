"""Durable model-call budget for the public demo.

The hosted demo has no API key for judges, so the model-calling endpoints are
reachable by anyone who can reach the URL. A loop can burn real Muse credits.
This table is the shared, persistent counter behind `app.services.guard`.
"""

from __future__ import annotations

from sqlalchemy import Column, Integer, String

from app.db import Base


class ModelUsage(Base):
    __tablename__ = "model_usage"

    day = Column(String(10), primary_key=True)   # YYYY-MM-DD (UTC)
    used = Column(Integer, nullable=False, default=0)
