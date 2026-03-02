export interface MemoryMessageInput {
  role: string;
  content: string;
}

export interface MemoryCreateInput {
  messages: MemoryMessageInput[];
  metadata?: Record<string, unknown>;
}

export interface MemoryCreateJobEnqueue {
  job_id: string;
  status: string;
}

export interface MemoryCreateJobStatus {
  job_id: string;
  status: string;
  progress?: number;
  result?: unknown;
  error?: string | null;
}

export interface MemorySearchInput {
  query: string;
  filters?: Record<string, unknown>;
}

export interface MemoryUpdateInput {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryListItem {
  id: string;
  text: string;
  createdAt: string | null;
  updatedAt: string | null;
  raw: Record<string, unknown>;
}
