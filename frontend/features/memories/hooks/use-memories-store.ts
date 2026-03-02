"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/lib/i18n/client";
import { memoriesApi } from "@/features/memories/api/memories-api";
import type {
  MemoryCreateInput,
  MemoryListItem,
  MemorySearchInput,
  MemoryUpdateInput,
} from "@/features/memories/types";

const MEMORY_CREATE_POLL_INTERVAL_MS = 1000;
const MEMORY_CREATE_POLL_MAX_ATTEMPTS = 60;

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const obj = toRecord(payload);
  if (!obj) return [];

  const candidates = [
    obj.items,
    obj.memories,
    obj.results,
    obj.data,
    obj.entries,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function normalizeMemoryItems(payload: unknown): MemoryListItem[] {
  const items = extractItems(payload);
  return items
    .map((item, index) => {
      const raw = toRecord(item);
      if (!raw) return null;

      const id =
        asString(raw.id) ??
        asString(raw.memory_id) ??
        asString(raw.memoryId) ??
        `row-${index}`;
      const text =
        asString(raw.memory) ??
        asString(raw.text) ??
        asString(raw.content) ??
        asString(raw.value) ??
        JSON.stringify(raw, null, 2);
      const createdAt =
        asString(raw.created_at) ??
        asString(raw.createdAt) ??
        asString(raw.timestamp);
      const updatedAt = asString(raw.updated_at) ?? asString(raw.updatedAt);

      return {
        id,
        text,
        createdAt,
        updatedAt,
        raw,
      };
    })
    .filter((item): item is MemoryListItem => item !== null);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function useMemoriesStore() {
  const { t } = useT("translation");
  const [items, setItems] = useState<MemoryListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [lastPayload, setLastPayload] = useState<unknown>(null);
  const [mode, setMode] = useState<"list" | "search">("list");

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setIsLoading(true);
      try {
        const payload = await memoriesApi.list();
        setItems(normalizeMemoryItems(payload));
        setLastPayload(payload);
        setMode("list");
      } catch (error) {
        console.error("[Memories] list failed", error);
        toast.error(t("memories.toasts.error", "Operation failed"));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const search = useCallback(
    async (input: MemorySearchInput) => {
      setIsMutating(true);
      try {
        const payload = await memoriesApi.search(input);
        setItems(normalizeMemoryItems(payload));
        setLastPayload(payload);
        setMode("search");
      } catch (error) {
        console.error("[Memories] search failed", error);
        toast.error(t("memories.toasts.error", "Operation failed"));
      } finally {
        setIsMutating(false);
      }
    },
    [t],
  );

  const waitForCreateJob = useCallback(
    async (jobId: string) => {
      for (
        let attempt = 0;
        attempt < MEMORY_CREATE_POLL_MAX_ATTEMPTS;
        attempt += 1
      ) {
        const payload = await memoriesApi.getCreateJob(jobId);
        setLastPayload(payload);

        const raw = toRecord(payload);
        const status = asString(raw?.status)?.toLowerCase();
        if (status === "success") {
          toast.success(t("memories.toasts.created", "Memory created"));
          await refresh({ silent: true });
          return;
        }
        if (status === "failed") {
          console.error("[Memories] create job failed", raw);
          toast.error(t("memories.toasts.error", "Operation failed"));
          return;
        }

        await sleep(MEMORY_CREATE_POLL_INTERVAL_MS);
      }

      console.error("[Memories] create job polling timeout", { jobId });
      toast.error(t("memories.toasts.error", "Operation failed"));
    },
    [refresh, t],
  );

  const create = useCallback(
    async (input: MemoryCreateInput) => {
      setIsMutating(true);
      try {
        const payload = await memoriesApi.create(input);
        setLastPayload(payload);

        const raw = toRecord(payload);
        const jobId = asString(raw?.job_id) ?? asString(raw?.jobId);
        if (jobId) {
          void waitForCreateJob(jobId);
          return;
        }

        toast.success(t("memories.toasts.created", "Memory created"));
        await refresh({ silent: true });
      } catch (error) {
        console.error("[Memories] create failed", error);
        toast.error(t("memories.toasts.error", "Operation failed"));
      } finally {
        setIsMutating(false);
      }
    },
    [refresh, t, waitForCreateJob],
  );

  const getById = useCallback(
    async (memoryId: string) => {
      setIsMutating(true);
      try {
        const payload = await memoriesApi.get(memoryId);
        setLastPayload(payload);
      } catch (error) {
        console.error("[Memories] get failed", error);
        toast.error(t("memories.toasts.error", "Operation failed"));
      } finally {
        setIsMutating(false);
      }
    },
    [t],
  );

  const getHistory = useCallback(
    async (memoryId: string) => {
      setIsMutating(true);
      try {
        const payload = await memoriesApi.getHistory(memoryId);
        setLastPayload(payload);
      } catch (error) {
        console.error("[Memories] history failed", error);
        toast.error(t("memories.toasts.error", "Operation failed"));
      } finally {
        setIsMutating(false);
      }
    },
    [t],
  );

  const update = useCallback(
    async (memoryId: string, input: MemoryUpdateInput) => {
      setIsMutating(true);
      try {
        const payload = await memoriesApi.update(memoryId, input);
        setLastPayload(payload);
        toast.success(t("memories.toasts.updated", "Memory updated"));
        await refresh({ silent: true });
      } catch (error) {
        console.error("[Memories] update failed", error);
        toast.error(t("memories.toasts.error", "Operation failed"));
      } finally {
        setIsMutating(false);
      }
    },
    [refresh, t],
  );

  const remove = useCallback(
    async (memoryId: string) => {
      setIsMutating(true);
      try {
        const payload = await memoriesApi.remove(memoryId);
        setLastPayload(payload);
        toast.success(t("memories.toasts.deleted", "Memory deleted"));
        await refresh({ silent: true });
      } catch (error) {
        console.error("[Memories] remove failed", error);
        toast.error(t("memories.toasts.error", "Operation failed"));
      } finally {
        setIsMutating(false);
      }
    },
    [refresh, t],
  );

  const clearAll = useCallback(async () => {
    setIsMutating(true);
    try {
      const payload = await memoriesApi.clearAll();
      setLastPayload(payload);
      toast.success(t("memories.toasts.cleared", "All memories cleared"));
      await refresh({ silent: true });
    } catch (error) {
      console.error("[Memories] clear all failed", error);
      toast.error(t("memories.toasts.error", "Operation failed"));
    } finally {
      setIsMutating(false);
    }
  }, [refresh, t]);

  return {
    items,
    isLoading,
    isMutating,
    lastPayload,
    mode,
    refresh,
    search,
    create,
    getById,
    getHistory,
    update,
    remove,
    clearAll,
  };
}
