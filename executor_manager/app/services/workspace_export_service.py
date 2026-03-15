import json
import logging
import mimetypes
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from app.core.errors.exceptions import AppException
from app.schemas.workspace import WorkspaceExportResult
from app.services.storage_service import S3StorageService
from app.services.workspace_manager import WorkspaceManager

logger = logging.getLogger(__name__)


workspace_manager = WorkspaceManager()
storage_service = S3StorageService()


class WorkspaceExportService:
    def export_workspace(self, session_id: str) -> WorkspaceExportResult:
        user_id = workspace_manager.resolve_user_id(session_id)
        if not user_id:
            return WorkspaceExportResult(
                error="Unable to resolve user_id for session",
                workspace_export_status="failed",
            )

        workspace_dir = workspace_manager.get_session_workspace_dir(
            user_id=user_id, session_id=session_id
        )
        if not workspace_dir:
            return WorkspaceExportResult(
                error="Workspace directory not found",
                workspace_export_status="failed",
            )

        prefix = f"workspaces/{user_id}/{session_id}"
        files_prefix = f"{prefix}/files"
        manifest_key = f"{prefix}/manifest.json"
        archive_key = f"{prefix}/archive.zip"

        try:
            files = self._collect_files(workspace_dir)
            manifest = {
                "version": 1,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "files": [],
            }

            for file_path in files:
                rel_path = file_path.relative_to(workspace_dir).as_posix()
                object_key = f"{files_prefix}/{rel_path}"
                mime_type, _ = mimetypes.guess_type(file_path.name)

                storage_service.upload_file(
                    file_path=str(file_path),
                    key=object_key,
                    content_type=mime_type,
                )

                manifest["files"].append(
                    {
                        "path": rel_path,
                        "key": object_key,
                        "size": file_path.stat().st_size,
                        "mimeType": mime_type,
                        "status": "uploaded",
                        "last_modified": datetime.fromtimestamp(
                            file_path.stat().st_mtime, tz=timezone.utc
                        ).isoformat(),
                    }
                )

            storage_service.put_object(
                key=manifest_key,
                body=json.dumps(manifest, ensure_ascii=False).encode("utf-8"),
                content_type="application/json",
            )

            archive_path = self._create_archive(
                workspace_dir=workspace_dir,
                session_id=session_id,
                files=files,
            )
            storage_service.upload_file(
                file_path=str(archive_path),
                key=archive_key,
                content_type="application/zip",
            )

            try:
                archive_path.unlink(missing_ok=True)
            except Exception:
                logger.warning(f"Failed to cleanup archive temp file: {archive_path}")

            return WorkspaceExportResult(
                workspace_files_prefix=files_prefix,
                workspace_manifest_key=manifest_key,
                workspace_archive_key=archive_key,
                workspace_export_status="ready",
            )
        except AppException as exc:
            logger.error(f"Workspace export failed: {exc.message}")
            return WorkspaceExportResult(
                error=exc.message, workspace_export_status="failed"
            )
        except Exception as exc:
            logger.error(f"Workspace export failed: {exc}")
            return WorkspaceExportResult(
                error=str(exc), workspace_export_status="failed"
            )

    def _collect_files(self, workspace_dir: Path) -> list[Path]:
        files: list[Path] = []
        ignore_names = workspace_manager._ignore_names
        ignore_dot = workspace_manager.ignore_dot_files

        for root, dirnames, filenames in os.walk(workspace_dir):
            root_path = Path(root)
            dirnames[:] = [
                d
                for d in dirnames
                if not self._should_skip(
                    root_path / d,
                    workspace_dir=workspace_dir,
                    ignore_names=ignore_names,
                    ignore_dot=ignore_dot,
                )
            ]
            for filename in filenames:
                file_path = root_path / filename
                if self._should_skip(
                    file_path,
                    workspace_dir=workspace_dir,
                    ignore_names=ignore_names,
                    ignore_dot=ignore_dot,
                ):
                    continue
                if file_path.is_symlink():
                    continue
                if not file_path.is_file():
                    continue
                files.append(file_path)

        return files

    def _create_archive(
        self,
        *,
        workspace_dir: Path,
        session_id: str,
        files: list[Path],
    ) -> Path:
        temp_dir = workspace_manager.temp_dir
        temp_dir.mkdir(parents=True, exist_ok=True)
        archive_path = temp_dir / f"{session_id}.zip"

        with zipfile.ZipFile(
            archive_path,
            "w",
            compression=zipfile.ZIP_DEFLATED,
        ) as zipf:
            for file_path in files:
                rel_path = file_path.relative_to(workspace_dir).as_posix()
                zipf.write(file_path, arcname=f"workspace/{rel_path}")

        return archive_path

    @staticmethod
    def _is_allowed_hidden_skill_path(path: Path, workspace_dir: Path) -> bool:
        try:
            relative_parts = path.relative_to(workspace_dir).parts
        except Exception:
            return False

        if not relative_parts:
            return False
        if relative_parts[0] not in {".config", ".config_data"}:
            return False
        if len(relative_parts) == 1:
            return True
        return relative_parts[1] == "skills"

    @classmethod
    def _should_skip(
        cls,
        path: Path,
        *,
        workspace_dir: Path,
        ignore_names: set[str],
        ignore_dot: bool,
    ) -> bool:
        name = path.name
        if name in ignore_names:
            return True
        if ignore_dot and name.startswith("."):
            if not cls._is_allowed_hidden_skill_path(path, workspace_dir):
                return True
        if path.is_symlink():
            return True
        return False
