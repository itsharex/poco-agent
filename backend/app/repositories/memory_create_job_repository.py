import uuid

from sqlalchemy.orm import Session

from app.models.memory_create_job import MemoryCreateJob


class MemoryCreateJobRepository:
    """Data access layer for memory create jobs."""

    @staticmethod
    def create(
        session_db: Session,
        *,
        user_id: str,
        messages: list[dict],
        run_id: str | None,
        metadata: dict | None,
    ) -> MemoryCreateJob:
        job = MemoryCreateJob(
            user_id=user_id,
            messages=messages,
            run_id=run_id,
            request_metadata=metadata,
            status="queued",
            progress=0,
        )
        session_db.add(job)
        return job

    @staticmethod
    def get_by_id(session_db: Session, job_id: uuid.UUID) -> MemoryCreateJob | None:
        return (
            session_db.query(MemoryCreateJob)
            .filter(MemoryCreateJob.id == job_id)
            .first()
        )
