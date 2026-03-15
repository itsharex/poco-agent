import re
import uuid
from pathlib import PurePosixPath

from sqlalchemy.orm import Session

from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.models.agent_session import AgentSession
from app.models.pending_skill_creation import PendingSkillCreation
from app.models.skill import Skill
from app.models.user_skill_install import UserSkillInstall
from app.repositories.pending_skill_creation_repository import (
    PendingSkillCreationRepository,
)
from app.repositories.skill_repository import SkillRepository
from app.repositories.tool_execution_repository import ToolExecutionRepository
from app.repositories.user_skill_install_repository import UserSkillInstallRepository
from app.schemas.pending_skill_creation import (
    PendingSkillCreationConfirmRequest,
    PendingSkillCreationResponse,
)
from app.services.storage_service import S3StorageService
from app.utils.markdown_front_matter import parse_yaml_front_matter
from app.utils.workspace_manifest import extract_manifest_files, normalize_manifest_path

_SKILL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
_PENDING_STATUSES = {"pending", "failed", "creating"}


class PendingSkillCreationService:
    def __init__(self, storage_service: S3StorageService | None = None) -> None:
        self.storage_service = storage_service

    def detect_and_create_pending(
        self,
        db: Session,
        *,
        session: AgentSession,
    ) -> list[PendingSkillCreation]:
        if (
            (session.workspace_export_status or "").strip().lower() != "ready"
            or not session.workspace_manifest_key
            or not session.workspace_files_prefix
        ):
            return []

        skill_tool_executions = ToolExecutionRepository.list_by_session_and_tool_name(
            db,
            session_id=session.id,
            tool_name="Skill",
        )
        successful_skill_tool_executions = [
            execution
            for execution in skill_tool_executions
            if not execution.is_error and execution.tool_output is not None
        ]
        if not successful_skill_tool_executions:
            return []

        visible_skill_names = {
            skill.name for skill in SkillRepository.list_visible(db, user_id=session.user_id)
        }
        manifest = self._storage_service().get_manifest(session.workspace_manifest_key)
        created: list[PendingSkillCreation] = []

        for candidate in self._collect_workspace_skill_candidates(
            manifest=manifest,
            workspace_files_prefix=session.workspace_files_prefix,
        ):
            if candidate.detected_name in visible_skill_names:
                continue

            existing = (
                PendingSkillCreationRepository.get_by_session_and_skill_relative_path(
                    db,
                    session_id=session.id,
                    skill_relative_path=candidate.skill_relative_path,
                )
            )
            if existing is not None:
                created.append(existing)
                continue

            pending = PendingSkillCreation(
                user_id=session.user_id,
                session_id=session.id,
                tool_use_id=self._match_tool_use_id(
                    successful_skill_tool_executions,
                    detected_name=candidate.detected_name,
                ),
                detected_name=candidate.detected_name,
                description=candidate.description,
                workspace_files_prefix=session.workspace_files_prefix,
                skill_relative_path=candidate.skill_relative_path,
                status="pending",
            )
            PendingSkillCreationRepository.create(db, pending)
            db.flush()
            created.append(pending)

        return created

    def list_pending_for_user(
        self,
        db: Session,
        *,
        user_id: str,
        session_id: uuid.UUID | None = None,
    ) -> list[PendingSkillCreationResponse]:
        items = PendingSkillCreationRepository.list_by_user(
            db,
            user_id=user_id,
            session_id=session_id,
            statuses=sorted(_PENDING_STATUSES),
        )
        return [self._to_response(item) for item in items]

    def get_creation(
        self,
        db: Session,
        *,
        user_id: str,
        creation_id: uuid.UUID,
    ) -> PendingSkillCreationResponse:
        item = self._get_owned_creation(db, user_id=user_id, creation_id=creation_id)
        return self._to_response(item)

    def confirm(
        self,
        db: Session,
        *,
        user_id: str,
        creation_id: uuid.UUID,
        request: PendingSkillCreationConfirmRequest,
    ) -> PendingSkillCreationResponse:
        pending = self._get_owned_creation(db, user_id=user_id, creation_id=creation_id)
        if pending.status not in {"pending", "failed"}:
            raise AppException(
                error_code=ErrorCode.BAD_REQUEST,
                message=f"Pending skill creation cannot be confirmed from status: {pending.status}",
            )

        final_name = self._validate_skill_name(
            request.resolved_name or pending.detected_name
        )
        existing_skill = SkillRepository.get_by_name(db, final_name, user_id)
        if existing_skill is not None and not request.overwrite:
            raise AppException(
                error_code=ErrorCode.SKILL_ALREADY_EXISTS,
                message=f"Skill already exists: {final_name}",
            )

        pending.status = "creating"
        pending.error = None
        pending.resolved_name = final_name
        db.flush()

        try:
            skill = self._commit_pending_skill(
                db,
                user_id=user_id,
                pending=pending,
                final_name=final_name,
                existing_skill=existing_skill if request.overwrite else None,
            )
            pending.status = "success"
            pending.skill_id = skill.id
            pending.error = None
            pending.result = {
                "skill_id": skill.id,
                "skill_name": skill.name,
                "overwritten": existing_skill is not None,
            }
            db.commit()
            db.refresh(pending)
            return self._to_response(pending)
        except Exception as exc:
            pending.status = "failed"
            pending.error = str(exc)
            db.commit()
            raise

    def cancel(
        self,
        db: Session,
        *,
        user_id: str,
        creation_id: uuid.UUID,
        reason: str | None = None,
    ) -> PendingSkillCreationResponse:
        pending = self._get_owned_creation(db, user_id=user_id, creation_id=creation_id)
        if pending.status == "success":
            raise AppException(
                error_code=ErrorCode.BAD_REQUEST,
                message="Cannot cancel a completed skill creation",
            )
        pending.status = "canceled"
        pending.error = reason.strip()[:1000] if isinstance(reason, str) and reason.strip() else None
        db.commit()
        db.refresh(pending)
        return self._to_response(pending)

    def _commit_pending_skill(
        self,
        db: Session,
        *,
        user_id: str,
        pending: PendingSkillCreation,
        final_name: str,
        existing_skill: Skill | None,
    ) -> Skill:
        workspace_prefix = (pending.workspace_files_prefix or "").strip().rstrip("/")
        if not workspace_prefix:
            raise AppException(
                error_code=ErrorCode.BAD_REQUEST,
                message="Workspace files prefix is missing",
            )

        relative_path = normalize_manifest_path(pending.skill_relative_path)
        if not relative_path:
            raise AppException(
                error_code=ErrorCode.BAD_REQUEST,
                message="Invalid pending skill relative path",
            )

        source_prefix = f"{workspace_prefix}/{relative_path.lstrip('/')}"
        skill_markdown_key = f"{source_prefix}/SKILL.md"
        storage_service = self._storage_service()
        if not storage_service.exists(skill_markdown_key):
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message="Generated skill files are not available in workspace export",
            )

        version_id = str(uuid.uuid4())
        destination_prefix = f"skills/{user_id}/{final_name}/{version_id}"
        copied = storage_service.copy_prefix(
            source_prefix=source_prefix,
            destination_prefix=destination_prefix,
        )
        if copied == 0:
            raise AppException(
                error_code=ErrorCode.BAD_REQUEST,
                message="No skill files found to create",
            )

        description = pending.description
        if description is None:
            description = self._extract_description_from_key(skill_markdown_key)

        source = {
            "kind": "skill-creator",
            "session_id": str(pending.session_id),
            "pending_creation_id": str(pending.id),
        }
        entry = {
            "s3_key": f"{destination_prefix}/",
            "is_prefix": True,
        }

        overwritten = existing_skill is not None
        if existing_skill is None:
            skill = Skill(
                name=final_name,
                description=description,
                scope="user",
                owner_user_id=user_id,
                entry=entry,
                source=source,
            )
            SkillRepository.create(db, skill)
            db.flush()
        else:
            skill = existing_skill
            skill.name = final_name
            skill.description = description
            skill.entry = entry
            skill.source = source
            db.flush()

        install = UserSkillInstallRepository.get_by_user_and_skill(db, user_id, skill.id)
        if install is None:
            UserSkillInstallRepository.create(
                db,
                UserSkillInstall(user_id=user_id, skill_id=skill.id, enabled=True),
            )
        else:
            install.enabled = True

        pending.description = description
        pending.result = {
            "skill_id": skill.id,
            "skill_name": skill.name,
            "overwritten": overwritten,
        }
        return skill

    def _get_owned_creation(
        self,
        db: Session,
        *,
        user_id: str,
        creation_id: uuid.UUID,
    ) -> PendingSkillCreation:
        item = PendingSkillCreationRepository.get_by_id(db, creation_id)
        if item is None or item.user_id != user_id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Pending skill creation not found: {creation_id}",
            )
        return item

    def _extract_description_from_key(self, key: str) -> str | None:
        content = self._storage_service().get_text(key)
        frontmatter = parse_yaml_front_matter(content)
        description = frontmatter.get("description")
        if not isinstance(description, str):
            return None
        normalized = description.strip()
        return normalized[:1000] if normalized else None

    @staticmethod
    def _match_tool_use_id(
        tool_executions: list,
        *,
        detected_name: str,
    ) -> str | None:
        clean_name = detected_name.strip().lower()
        for execution in tool_executions:
            tool_input = execution.tool_input if isinstance(execution.tool_input, dict) else {}
            for value in tool_input.values():
                if isinstance(value, str) and clean_name in value.lower():
                    return execution.tool_use_id
        return tool_executions[0].tool_use_id if len(tool_executions) == 1 else None

    def _collect_workspace_skill_candidates(
        self,
        *,
        manifest: object,
        workspace_files_prefix: str,
    ) -> list["_DetectedWorkspaceSkill"]:
        files = extract_manifest_files(manifest)
        candidates: list[_DetectedWorkspaceSkill] = []
        seen_paths: set[str] = set()

        for item in files:
            normalized_path = normalize_manifest_path(item.get("path"))
            if not normalized_path or not normalized_path.endswith("/SKILL.md"):
                continue
            parent = PurePosixPath(normalized_path).parent
            parent_str = parent.as_posix()
            if not parent_str.startswith("/.config/skills/"):
                continue
            if parent_str in seen_paths:
                continue
            parts = [part for part in parent.parts if part]
            if len(parts) != 3 or parts[:2] != [".config", "skills"]:
                continue
            detected_name = parts[-1]
            if not self._looks_like_valid_skill_name(detected_name):
                continue

            object_key = (
                item.get("key")
                or item.get("object_key")
                or item.get("oss_key")
                or item.get("s3_key")
            )
            if not isinstance(object_key, str) or not object_key.strip():
                object_key = f"{workspace_files_prefix.rstrip('/')}/{normalized_path.lstrip('/')}"

            candidates.append(
                _DetectedWorkspaceSkill(
                    detected_name=detected_name,
                    description=self._extract_description_from_key(object_key),
                    skill_relative_path=parent_str,
                )
            )
            seen_paths.add(parent_str)

        return candidates

    def _storage_service(self) -> S3StorageService:
        if self.storage_service is None:
            self.storage_service = S3StorageService()
        return self.storage_service

    @staticmethod
    def _looks_like_valid_skill_name(name: str) -> bool:
        return bool(name) and name not in {".", ".."} and bool(
            _SKILL_NAME_PATTERN.fullmatch(name)
        )

    @staticmethod
    def _validate_skill_name(name: str) -> str:
        value = (name or "").strip()
        if not PendingSkillCreationService._looks_like_valid_skill_name(value):
            raise AppException(
                error_code=ErrorCode.BAD_REQUEST,
                message=f"Invalid skill name: {name}",
            )
        return value

    @staticmethod
    def _to_response(
        pending: PendingSkillCreation,
    ) -> PendingSkillCreationResponse:
        return PendingSkillCreationResponse(
            id=pending.id,
            session_id=pending.session_id,
            tool_use_id=pending.tool_use_id,
            detected_name=pending.detected_name,
            resolved_name=pending.resolved_name,
            description=pending.description,
            workspace_files_prefix=pending.workspace_files_prefix,
            skill_relative_path=pending.skill_relative_path,
            status=pending.status,
            skill_id=pending.skill_id,
            error=pending.error,
            result=pending.result,
            created_at=pending.created_at,
            updated_at=pending.updated_at,
        )


class _DetectedWorkspaceSkill:
    def __init__(
        self,
        *,
        detected_name: str,
        description: str | None,
        skill_relative_path: str,
    ) -> None:
        self.detected_name = detected_name
        self.description = description
        self.skill_relative_path = skill_relative_path
