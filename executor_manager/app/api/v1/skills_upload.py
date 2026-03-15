import asyncio
from datetime import timezone, datetime

import httpx
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.core.deps import require_callback_token
from app.core.settings import get_settings
from app.schemas.callback import AgentCallbackRequest, CallbackStatus
from app.schemas.response import Response, ResponseSchema
from app.services.backend_client import BackendClient
from app.services.workspace_export_service import WorkspaceExportService

router = APIRouter(prefix="/skills", tags=["skills"])
backend_client = BackendClient()
workspace_export_service = WorkspaceExportService()


class SkillSubmitRequest(BaseModel):
    session_id: str
    folder_path: str
    skill_name: str | None = None


async def _sync_workspace_export(session_id: str) -> None:
    result = await asyncio.to_thread(workspace_export_service.export_workspace, session_id)
    if result.workspace_export_status != "ready":
        raise HTTPException(
            status_code=400,
            detail=result.error or "Workspace export failed",
        )

    session_response = await backend_client._request(
        "GET",
        f"/api/v1/sessions/{session_id}",
        headers=BackendClient._trace_headers(),
    )
    session_payload = session_response.json().get("data", {}) or {}
    raw_status = str(session_payload.get("status") or "").strip().lower()
    callback_status = CallbackStatus.RUNNING
    if raw_status == "accepted":
        callback_status = CallbackStatus.ACCEPTED
    elif raw_status == "completed":
        callback_status = CallbackStatus.COMPLETED
    elif raw_status == "failed":
        callback_status = CallbackStatus.FAILED

    callback = AgentCallbackRequest(
        session_id=session_id,
        time=datetime.now(timezone.utc),
        status=callback_status,
        progress=100 if callback_status == CallbackStatus.COMPLETED else 0,
        workspace_files_prefix=result.workspace_files_prefix,
        workspace_manifest_key=result.workspace_manifest_key,
        workspace_archive_key=result.workspace_archive_key,
        workspace_export_status=result.workspace_export_status,
    )
    await backend_client.forward_callback(callback.model_dump(mode="json"))


@router.post("/submit", response_model=ResponseSchema[dict])
async def submit_skill(
    request: SkillSubmitRequest,
    _: None = Depends(require_callback_token),
) -> JSONResponse:
    await _sync_workspace_export(request.session_id)
    try:
        response = await backend_client._request(
            "POST",
            "/api/v1/internal/skills/submit-from-workspace",
            params={"session_id": request.session_id},
            json={
                "folder_path": request.folder_path,
                "skill_name": request.skill_name,
            },
            headers={
                "X-Internal-Token": get_settings().internal_api_token,
                **BackendClient._trace_headers(),
            },
        )
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        try:
            payload = exc.response.json()
            detail = payload.get("message") or payload.get("detail") or detail
        except Exception:
            pass
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc

    payload = response.json()
    return Response.success(
        data=payload.get("data"),
        message=payload.get("message", "Skill submission queued successfully"),
    )
