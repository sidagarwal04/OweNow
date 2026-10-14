import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, broadcastChange } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

// All groups the current user belongs to (with member counts).
export function useGroups() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['groups', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { groups } = await apiFetch('/api/groups');
      return groups ?? [];
    },
  });
}

export function useGroup(groupId) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['group', groupId],
    enabled: !!groupId && !!user?.id,
    queryFn: async () => {
      const { group } = await apiFetch(`/api/groups?id=${encodeURIComponent(groupId)}`);
      return group;
    },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, emoji, description }) => {
      const { group } = await apiFetch('/api/groups', {
        method: 'POST',
        body: { name, emoji, description },
      });
      return group;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      broadcastChange({ type: 'groups' });
    },
  });
}

export function useLeaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId) => {
      await apiFetch(`/api/groups?id=${encodeURIComponent(groupId)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      broadcastChange({ type: 'groups' });
    },
  });
}

export function useInviteMember(groupId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, groupName }) => {
      return apiFetch('/api/invite', {
        method: 'POST',
        body: { email, groupId, groupName },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', groupId] });
      qc.invalidateQueries({ queryKey: ['groups'] });
      broadcastChange({ type: 'group', groupId });
    },
  });
}
