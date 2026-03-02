import { apiClient, API_ENDPOINTS } from "@/services/api-client";
import type {
  MemoryCreateJobEnqueue,
  MemoryCreateJobStatus,
  MemoryCreateInput,
  MemorySearchInput,
  MemoryUpdateInput,
} from "@/features/memories/types";

export const memoriesApi = {
  list: async (): Promise<unknown> => {
    return apiClient.get<unknown>(API_ENDPOINTS.memories);
  },

  create: async (input: MemoryCreateInput): Promise<MemoryCreateJobEnqueue> => {
    return apiClient.post<MemoryCreateJobEnqueue>(
      API_ENDPOINTS.memories,
      input,
    );
  },

  getCreateJob: async (jobId: string): Promise<MemoryCreateJobStatus> => {
    return apiClient.get<MemoryCreateJobStatus>(
      API_ENDPOINTS.memoryCreateJob(jobId),
    );
  },

  search: async (input: MemorySearchInput): Promise<unknown> => {
    return apiClient.post<unknown>(API_ENDPOINTS.memoriesSearch, input);
  },

  get: async (memoryId: string): Promise<unknown> => {
    return apiClient.get<unknown>(API_ENDPOINTS.memory(memoryId));
  },

  update: async (
    memoryId: string,
    input: MemoryUpdateInput,
  ): Promise<unknown> => {
    return apiClient.put<unknown>(API_ENDPOINTS.memory(memoryId), input);
  },

  getHistory: async (memoryId: string): Promise<unknown> => {
    return apiClient.get<unknown>(API_ENDPOINTS.memoryHistory(memoryId));
  },

  remove: async (memoryId: string): Promise<Record<string, unknown>> => {
    return apiClient.delete<Record<string, unknown>>(
      API_ENDPOINTS.memory(memoryId),
    );
  },

  clearAll: async (): Promise<Record<string, unknown>> => {
    return apiClient.delete<Record<string, unknown>>(API_ENDPOINTS.memories);
  },
};
