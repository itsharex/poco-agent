"use client";

import * as React from "react";
import { Bot, FileCode2, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { getFilesAction } from "@/features/chat/actions/query-actions";
import { FileSidebar } from "@/features/chat/components/execution/file-panel/file-sidebar";
import { DocumentViewer } from "@/features/chat/components/execution/file-panel/document-viewer";
import { skillsService } from "@/features/capabilities/skills/api/skills-api";
import type { FileNode, PendingSkillCreation } from "@/features/chat/types";

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function filterTreeByPrefix(nodes: FileNode[], prefix: string): FileNode[] {
  const normalizedPrefix = normalizePath(prefix);
  const prefixWithSlash = normalizedPrefix ? `${normalizedPrefix}/` : "";

  const visit = (node: FileNode): FileNode | null => {
    const nodePath = normalizePath(node.path);
    const matches =
      nodePath === normalizedPrefix || nodePath.startsWith(prefixWithSlash);

    if (node.type === "file") {
      return matches ? node : null;
    }

    const children = (node.children ?? [])
      .map((child) => visit(child))
      .filter((child): child is FileNode => child !== null);

    if (!matches && children.length === 0) {
      return null;
    }

    return {
      ...node,
      children,
    };
  };

  return nodes
    .map((node) => visit(node))
    .filter((node): node is FileNode => node !== null);
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  const visit = (items: FileNode[]) => {
    for (const item of items) {
      if (item.type === "file") {
        result.push(item);
        continue;
      }
      if (item.children?.length) {
        visit(item.children);
      }
    }
  };
  visit(nodes);
  return result;
}

interface SkillCreationReviewCardProps {
  creation: PendingSkillCreation;
  isSubmitting?: boolean;
  onConfirm: (payload: {
    resolved_name?: string | null;
    overwrite?: boolean;
  }) => Promise<unknown>;
  onCancel: () => Promise<unknown>;
}

export function SkillCreationReviewCard({
  creation,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: SkillCreationReviewCardProps) {
  const { t } = useT("translation");
  const [resolvedName, setResolvedName] = React.useState(
    creation.resolved_name || creation.detected_name,
  );
  const [overwrite, setOverwrite] = React.useState(false);
  const [files, setFiles] = React.useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = React.useState<FileNode>();
  const [isLoadingFiles, setIsLoadingFiles] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);

  React.useEffect(() => {
    setResolvedName(creation.resolved_name || creation.detected_name);
    setOverwrite(false);
  }, [creation.detected_name, creation.id, creation.resolved_name]);

  React.useEffect(() => {
    let cancelled = false;

    const loadFiles = async () => {
      if (!creation.session_id) {
        setFiles([]);
        setSelectedFile(undefined);
        return;
      }
      try {
        setIsLoadingFiles(true);
        const workspaceFiles = await getFilesAction({
          sessionId: creation.session_id,
        });
        if (cancelled) return;
        const filtered = filterTreeByPrefix(
          workspaceFiles,
          creation.skill_relative_path,
        );
        const flatFiles = flattenFiles(filtered);
        setFiles(filtered);
        setSelectedFile(flatFiles[0]);
      } catch (error) {
        console.error("[SkillCreationReviewCard] Failed to load files", error);
        if (!cancelled) {
          setFiles([]);
          setSelectedFile(undefined);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFiles(false);
        }
      }
    };

    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, [creation.session_id, creation.skill_relative_path]);

  React.useEffect(() => {
    let cancelled = false;
    const loadConflict = async () => {
      try {
        const skills = await skillsService.listSkills({ revalidate: 0 });
        if (cancelled) return;
        const normalized = resolvedName.trim().toLowerCase();
        setConflict(
          Boolean(
            normalized &&
              skills.some((skill) => skill.name.trim().toLowerCase() === normalized),
          ),
        );
      } catch {
        if (!cancelled) {
          setConflict(false);
        }
      }
    };

    void loadConflict();
    return () => {
      cancelled = true;
    };
  }, [resolvedName]);

  const handleConfirm = async () => {
    try {
      await onConfirm({
        resolved_name: resolvedName.trim() || undefined,
        overwrite,
      });
      toast.success(t("chat.skillCreationReview.createSuccess"));
    } catch (error) {
      console.error("[SkillCreationReviewCard] Failed to confirm skill", error);
      toast.error(t("chat.skillCreationReview.createFailed"));
    }
  };

  const handleCancel = async () => {
    try {
      await onCancel();
      toast.success(t("chat.skillCreationReview.cancelSuccess"));
    } catch (error) {
      console.error("[SkillCreationReviewCard] Failed to cancel skill", error);
      toast.error(t("chat.skillCreationReview.cancelFailed"));
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">
                {t("chat.skillCreationReview.title")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("chat.skillCreationReview.subtitle")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-10">
            <Badge variant="secondary" className="gap-1">
              <Bot className="size-3" />
              {t("chat.skillCreationReview.badge")}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {creation.detected_name}
            </span>
          </div>
        </div>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`skill-creation-name-${creation.id}`}>
              {t("chat.skillCreationReview.nameLabel")}
            </Label>
            <Input
              id={`skill-creation-name-${creation.id}`}
              value={resolvedName}
              disabled={isSubmitting}
              onChange={(event) => setResolvedName(event.target.value)}
              placeholder={creation.detected_name}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("chat.skillCreationReview.descriptionLabel")}
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground">
              {creation.description?.trim() ||
                t("chat.skillCreationReview.emptyDescription")}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("chat.skillCreationReview.pathLabel")}
            </div>
            <code className="block rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {creation.skill_relative_path}
            </code>
          </div>

          {conflict ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-2">
                  <div>{t("chat.skillCreationReview.conflictWarning")}</div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`skill-creation-overwrite-${creation.id}`}
                      checked={overwrite}
                      disabled={isSubmitting}
                      onCheckedChange={(checked) => setOverwrite(checked === true)}
                    />
                    <Label
                      htmlFor={`skill-creation-overwrite-${creation.id}`}
                      className="text-sm font-normal"
                    >
                      {t("chat.skillCreationReview.overwriteLabel")}
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-h-[280px] overflow-hidden rounded-lg border border-border/60 bg-background">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-sm text-muted-foreground">
            <FileCode2 className="size-4" />
            {t("chat.skillCreationReview.filesTitle")}
          </div>
          {isLoadingFiles ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("chat.skillCreationReview.loadingFiles")}
            </div>
          ) : files.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {t("chat.skillCreationReview.emptyFiles")}
            </div>
          ) : (
            <div className="grid h-[320px] min-h-0 grid-cols-[minmax(220px,32%)_minmax(0,68%)] overflow-hidden">
              <div className="border-r border-border/60 bg-muted/20">
                <ScrollArea className="h-full">
                  <FileSidebar
                    files={files}
                    onFileSelect={setSelectedFile}
                    selectedFile={selectedFile}
                    embedded
                  />
                </ScrollArea>
              </div>
              <div className="min-w-0 overflow-hidden">
                {selectedFile ? (
                  <DocumentViewer
                    file={selectedFile}
                    ensureFreshFile={async (file) => file}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    {t("chat.skillCreationReview.selectFile")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {creation.error ? (
        <div
          className={cn(
            "mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive",
          )}
        >
          {creation.error}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={handleCancel}
        >
          {t("chat.skillCreationReview.cancel")}
        </Button>
        <Button
          type="button"
          disabled={isSubmitting || (conflict && !overwrite)}
          onClick={handleConfirm}
        >
          {conflict
            ? t("chat.skillCreationReview.confirmOverwrite")
            : t("chat.skillCreationReview.confirm")}
        </Button>
      </div>
    </div>
  );
}
