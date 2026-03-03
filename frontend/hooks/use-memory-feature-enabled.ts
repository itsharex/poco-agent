"use client";

import * as React from "react";
import type { ModelConfigResponse } from "@/features/chat/types";
import { apiClient, API_ENDPOINTS } from "@/services/api-client";

let cachedValue: boolean | null = null;
let inflight: Promise<boolean> | null = null;

type ModelConfigWithMemoryFlag = ModelConfigResponse & {
  mem0_enabled?: boolean;
};

async function fetchMemoryFeatureEnabled(): Promise<boolean> {
  if (cachedValue !== null) {
    return cachedValue;
  }

  if (!inflight) {
    inflight = apiClient
      .get<ModelConfigWithMemoryFlag>(API_ENDPOINTS.models)
      .then((config) => {
        const enabled = config.mem0_enabled === true;
        cachedValue = enabled;
        return enabled;
      })
      .catch((error) => {
        console.error("[MemoryFeature] Failed to load model config:", error);
        cachedValue = false;
        return false;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

export function useMemoryFeatureEnabled(): boolean {
  const [enabled, setEnabled] = React.useState<boolean>(cachedValue === true);

  React.useEffect(() => {
    let active = true;
    fetchMemoryFeatureEnabled().then((value) => {
      if (!active) return;
      setEnabled(value);
    });

    return () => {
      active = false;
    };
  }, []);

  return enabled;
}
