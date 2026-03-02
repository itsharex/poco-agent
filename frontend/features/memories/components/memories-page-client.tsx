"use client";

import * as React from "react";
import {
  Brain,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import { PageHeaderShell } from "@/components/shared/page-header-shell";
import { HeaderSearchInput } from "@/components/shared/header-search-input";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
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

  const handleCreate = async () => {
    const trimmed = newMemoryText.trim();
    if (!trimmed) return;

    await store.create({
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

  const handleCloseEditDialog = () => {
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
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => void handleSearch()}
          disabled={store.isMutating || !searchQuery.trim()}
        >
          <Search className="size-4" />
          {t("memories.actions.search", "Search")}
        </Button>
        <Button
          variant="ghost"
          className="gap-2"
          onClick={() => void store.refresh()}
          disabled={store.isMutating || store.isLoading}
        >
          <RefreshCw className="size-4" />
          {t("memories.actions.showAll", "Show All")}
        </Button>
        <HeaderSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
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
        right={
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => void store.refresh()}
            disabled={store.isMutating || store.isLoading}
          >
            <RefreshCw className="size-4" />
            {t("memories.actions.refresh", "Refresh")}
          </Button>
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
                      return (
                        <div className="group flex min-h-[72px] items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
                          <div className="min-w-0 flex-1">
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
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                handleStartEdit(item.id, item.text)
                              }
                              disabled={store.isMutating}
                              title={t("memories.actions.edit", "Edit")}
                            >
                              <Pencil className="size-4" />
                            </Button>
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
                className="w-full gap-2"
                onClick={() => void handleCreate()}
                disabled={store.isMutating || !newMemoryText.trim()}
              >
                <Plus className="size-4" />
                {t("memories.actions.create", "Create")}
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

      <Dialog
        open={Boolean(editingMemoryId)}
        onOpenChange={(open) => !open && handleCloseEditDialog()}
      >
        <CapabilityDialogContent
          title={t("memories.edit.title", "Edit Memory")}
          size="sm"
          maxHeight="34dvh"
          desktopMaxHeight="34dvh"
          bodyClassName="space-y-4 px-6 pt-4 pb-6"
          footer={
            <DialogFooter className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleCloseEditDialog}
                disabled={store.isMutating}
                className="w-full"
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                className="w-full gap-2"
                onClick={() => void handleSaveEditedMemory()}
                disabled={store.isMutating || !editingMemoryText.trim()}
              >
                <Save className="size-4" />
                {t("memories.actions.update", "Save")}
              </Button>
            </DialogFooter>
          }
        >
          <Textarea
            value={editingMemoryText}
            onChange={(event) => setEditingMemoryText(event.target.value)}
            placeholder={t(
              "memories.edit.contentPlaceholder",
              "Update memory content",
            )}
            className="min-h-32"
          />
        </CapabilityDialogContent>
      </Dialog>
    </>
  );
}
