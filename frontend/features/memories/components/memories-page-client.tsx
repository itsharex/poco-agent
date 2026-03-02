"use client";

import * as React from "react";
import { Brain, Plus, Trash2 } from "lucide-react";

import { PageHeaderShell } from "@/components/shared/page-header-shell";
import { HeaderSearchInput } from "@/components/shared/header-search-input";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonShimmer } from "@/components/ui/skeleton-shimmer";
import { StaggeredList } from "@/components/ui/staggered-entrance";
import { CapabilityContentShell } from "@/features/capabilities/components/capability-content-shell";
import { CapabilityCreateCard } from "@/features/capabilities/components/capability-create-card";
import { CapabilityDialogContent } from "@/features/capabilities/components/capability-dialog-content";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { useMemoriesStore } from "@/features/memories/hooks/use-memories-store";
import { useT } from "@/lib/i18n/client";

function buildCreateMessage(rawMemoryText: string): string {
  const normalized = rawMemoryText.trim();
  return `User preference: ${normalized}`;
}

export function MemoriesPageClient() {
  const { t } = useT("translation");
  const store = useMemoriesStore();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [newMemoryText, setNewMemoryText] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [editingMemoryId, setEditingMemoryId] = React.useState<string | null>(
    null,
  );
  const [editingMemoryText, setEditingMemoryText] = React.useState("");

  const createJobStatus = (store.createJob.status || "").toLowerCase();
  const isCreating =
    createJobStatus === "queued" || createJobStatus === "running";
  const createStatusLabel = t(
    `memories.progress.statuses.${createJobStatus || "unknown"}`,
    createJobStatus || t("memories.progress.statuses.unknown", "Unknown"),
  );
  const createStatusHint = isCreating
    ? t("memories.progress.hints.running", "Adding memory...")
    : createJobStatus === "success"
      ? t("memories.progress.hints.success", "Memory added")
      : createJobStatus === "failed"
        ? t("memories.progress.hints.failed", "Failed to add memory")
        : null;

  const handleCreate = () => {
    const trimmed = newMemoryText.trim();
    if (!trimmed) return;

    void store.create({
      messages: [{ role: "user", content: buildCreateMessage(trimmed) }],
    });
    setNewMemoryText("");
    setIsCreateOpen(false);
  };

  const handleSearch = async () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    await store.search({ query: trimmedQuery });
  };

  const handleStartEdit = (memoryId: string, text: string) => {
    setEditingMemoryId(memoryId);
    setEditingMemoryText(text);
  };

  const handleSaveEditedMemory = async () => {
    const memoryId = editingMemoryId;
    if (!memoryId) return;

    const nextText = editingMemoryText.trim();
    if (!nextText) return;

    await store.update(memoryId, { text: nextText });
    setEditingMemoryId(null);
    setEditingMemoryText("");
  };

  const handleCancelEdit = () => {
    setEditingMemoryId(null);
    setEditingMemoryText("");
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    setNewMemoryText("");
  };

  const toolbar = (
    <div className="rounded-xl bg-muted/50 px-5 py-3 flex flex-wrap items-center gap-3 md:flex-nowrap md:justify-between">
      <span className="text-sm text-muted-foreground">
        {t("memories.stats.count", "{{count}} items", {
          count: store.items.length,
        })}
      </span>
      <div className="flex flex-1 flex-nowrap items-center justify-end gap-2 overflow-x-auto">
        <HeaderSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleSearch();
            }
          }}
          placeholder={t(
            "memories.search.queryPlaceholder",
            "Search memories...",
          )}
          className="w-full md:w-72"
        />
      </div>
    </div>
  );

  return (
    <>
      <PageHeaderShell
        left={
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Brain className="hidden size-5 text-muted-foreground md:block" />
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight text-foreground">
                {t("memories.title", "Memories")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "memories.subtitle",
                  "Manage user-level long-term memory entries.",
                )}
              </p>
            </div>
          </div>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <PullToRefresh onRefresh={store.refresh} isLoading={store.isLoading}>
          <CapabilityContentShell contentClassName="max-w-5xl">
            <div className="space-y-5">
              {toolbar}
              <div className="space-y-3">
                <CapabilityCreateCard
                  label={t("memories.create.title", "Add Memory")}
                  onClick={() => setIsCreateOpen(true)}
                  disabled={store.isMutating}
                />
                {createStatusHint ? (
                  <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground">
                          {createStatusHint}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium text-foreground">
                        {createStatusLabel}
                      </span>
                    </div>
                    {store.createJob.error ? (
                      <div className="mt-1 text-xs text-destructive break-words">
                        {store.createJob.error}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {store.isLoading && store.items.length === 0 ? (
                  <SkeletonShimmer
                    count={5}
                    itemClassName="min-h-[72px]"
                    gap="md"
                  />
                ) : store.items.length === 0 ? (
                  <div className="rounded-xl border border-border/40 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
                    {t("memories.list.empty", "No memories found.")}
                  </div>
                ) : (
                  <StaggeredList
                    items={store.items}
                    show={!store.isLoading}
                    keyExtractor={(item) => item.id}
                    staggerDelay={40}
                    duration={320}
                    renderItem={(item) => {
                      const isEditing = editingMemoryId === item.id;
                      return (
                        <div className="group flex min-h-[72px] items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <Input
                                autoFocus
                                value={editingMemoryText}
                                onChange={(e) =>
                                  setEditingMemoryText(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    void handleSaveEditedMemory();
                                  } else if (e.key === "Escape") {
                                    handleCancelEdit();
                                  }
                                }}
                                className="h-10 text-base"
                                disabled={store.isMutating}
                              />
                            ) : (
                              <button
                                type="button"
                                className="w-full truncate whitespace-nowrap rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left text-base text-foreground transition-colors hover:border-border/90 hover:bg-muted/30"
                                onClick={() =>
                                  handleStartEdit(item.id, item.text)
                                }
                                disabled={store.isMutating}
                                aria-label={t("memories.actions.edit", "Edit")}
                              >
                                {item.text}
                              </button>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => void store.remove(item.id)}
                              disabled={store.isMutating}
                              title={t("memories.actions.delete", "Delete")}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    }}
                  />
                )}
              </div>
            </div>
          </CapabilityContentShell>
        </PullToRefresh>
      </div>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => !open && handleCloseCreate()}
      >
        <CapabilityDialogContent
          title={t("memories.create.title", "Add Memory")}
          size="sm"
          maxHeight="34dvh"
          desktopMaxHeight="34dvh"
          bodyClassName="space-y-4 px-6 pt-4 pb-6"
          footer={
            <DialogFooter className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleCloseCreate}
                disabled={store.isMutating}
                className="w-full"
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={store.isMutating || !newMemoryText.trim()}
                className="w-full gap-2"
              >
                <span className="inline-flex items-center gap-2">
                  <Plus className="size-4" />
                  {t("memories.actions.create", "Create")}
                </span>
              </Button>
            </DialogFooter>
          }
        >
          <Textarea
            value={newMemoryText}
            onChange={(event) => setNewMemoryText(event.target.value)}
            placeholder={t(
              "memories.create.contentPlaceholder",
              "Type memory content",
            )}
            className="min-h-32"
          />
        </CapabilityDialogContent>
      </Dialog>
    </>
  );
}
