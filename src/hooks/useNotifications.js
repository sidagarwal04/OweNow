import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, broadcastChange, subscribeChanges } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeChanges(() => {
      qc.invalidateQueries({ queryKey: ['notifications', user.id] });
      qc.invalidateQueries({ queryKey: ['notifications-unread', user.id] });
    });
    return unsubscribe;
  }, [user?.id, qc]);

  return useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { notifications } = await apiFetch('/api/notifications');
      return notifications ?? [];
    },
  });
}

export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications-unread', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { unreadCount } = await apiFetch('/api/notifications');
      return unreadCount ?? 0;
    },
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id) => {
      await apiFetch('/api/notifications', {
        method: 'PATCH',
        body: { id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', user?.id] });
      qc.invalidateQueries({ queryKey: ['notifications-unread', user?.id] });
      broadcastChange({ type: 'notifications' });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      await apiFetch('/api/notifications', {
        method: 'PATCH',
        body: { all: true },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', user?.id] });
      qc.invalidateQueries({ queryKey: ['notifications-unread', user?.id] });
      broadcastChange({ type: 'notifications' });
    },
  });
}
