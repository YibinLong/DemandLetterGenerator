// React Query client configuration with optimized caching settings
import { QueryClient, QueryClientConfig } from '@tanstack/react-query';

// Default stale times for different types of queries
export const staleTime = {
  // List data can be stale for 30 seconds before refetching
  list: 30 * 1000,
  // Detail data can be stale for 1 minute
  detail: 60 * 1000,
  // Static/config data can be stale for 5 minutes
  static: 5 * 60 * 1000,
  // Real-time data should always refetch
  realtime: 0,
};

// Default garbage collection times
export const gcTime = {
  // Keep list data in cache for 5 minutes
  list: 5 * 60 * 1000,
  // Keep detail data in cache for 10 minutes
  detail: 10 * 60 * 1000,
  // Keep static data in cache for 30 minutes
  static: 30 * 60 * 1000,
};

// Query key factories for consistent key naming
export const queryKeys = {
  // Demand Letters
  demandLetters: {
    all: ['demandLetters'] as const,
    lists: () => [...queryKeys.demandLetters.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.demandLetters.lists(), filters] as const,
    details: () => [...queryKeys.demandLetters.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.demandLetters.details(), id] as const,
    versions: (id: string) => [...queryKeys.demandLetters.detail(id), 'versions'] as const,
    aiHistory: (id: string) => [...queryKeys.demandLetters.detail(id), 'ai-history'] as const,
  },

  // Documents
  documents: {
    all: ['documents'] as const,
    lists: () => [...queryKeys.documents.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.documents.lists(), filters] as const,
    details: () => [...queryKeys.documents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.documents.details(), id] as const,
  },

  // Templates
  templates: {
    all: ['templates'] as const,
    lists: () => [...queryKeys.templates.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.templates.lists(), filters] as const,
    details: () => [...queryKeys.templates.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.templates.details(), id] as const,
  },

  // AI Prompts
  aiPrompts: {
    all: ['aiPrompts'] as const,
    lists: () => [...queryKeys.aiPrompts.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.aiPrompts.lists(), filters] as const,
    details: () => [...queryKeys.aiPrompts.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.aiPrompts.details(), id] as const,
  },

  // Export options (static)
  exportOptions: ['exportOptions'] as const,

  // User/Auth
  user: {
    current: ['user', 'current'] as const,
  },
};

// Query client configuration
const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      // Data is considered stale after 30 seconds by default
      staleTime: staleTime.list,
      // Keep unused data in cache for 5 minutes
      gcTime: gcTime.list,
      // Retry failed queries up to 3 times
      retry: 3,
      // Exponential backoff for retries
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Don't refetch on window focus in production (can be enabled per-query)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect by default
      refetchOnReconnect: false,
      // Don't refetch on mount if data is fresh
      refetchOnMount: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
};

// Create and export the query client singleton
export const queryClient = new QueryClient(queryClientConfig);

// Helper to invalidate all demand letter queries
export const invalidateDemandLetters = () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.demandLetters.all });
};

// Helper to invalidate all document queries
export const invalidateDocuments = () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
};

// Helper to invalidate all template queries
export const invalidateTemplates = () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
};

// Prefetch helpers for predictive data loading
export const prefetchDemandLetter = async (id: string, queryFn: () => Promise<unknown>) => {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.demandLetters.detail(id),
    queryFn,
    staleTime: staleTime.detail,
  });
};

export const prefetchDocuments = async (filters: Record<string, unknown>, queryFn: () => Promise<unknown>) => {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.documents.list(filters),
    queryFn,
    staleTime: staleTime.list,
  });
};

export default queryClient;
