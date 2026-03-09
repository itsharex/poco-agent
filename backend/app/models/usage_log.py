import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Integer, JSON, Numeric, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.agent_run import AgentRun
    from app.models.agent_session import AgentSession


class UsageLog(Base, TimestampMixin):
    __tablename__ = "usage_logs"
    __table_args__ = (
        Index("ix_usage_logs_session_id_created_at", "session_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    total_cost_usd: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cache_creation_input_tokens: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    cache_read_input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    include_in_user_analytics: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
        index=True,
    )
    usage_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    session: Mapped["AgentSession"] = relationship(back_populates="usage_logs")
    run: Mapped["AgentRun"] = relationship(back_populates="usage_logs")
