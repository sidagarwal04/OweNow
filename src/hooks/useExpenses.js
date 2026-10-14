import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, broadcastChange, fileToDataUrl, subscribeChanges } from '../lib/api.js';

export function useExpenses(groupId) {
  return useQuery({
    queryKey: ['expenses', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { expenses } = await apiFetch(`/api/expenses?groupId=${encodeURIComponent(groupId)}`);
      return expenses ?? [];
    },
  });
}

export function useSettlements(groupId) {
  return useQuery({
    queryKey: ['settlements', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { settlements } = await apiFetch(
        `/api/settlements?groupId=${encodeURIComponent(groupId)}`
      );
      return settlements ?? [];
    },
  });
}

// Combined activity feed (expenses + settlements) ordered by recency.
export function useActivity(groupId) {
  const { data: expenses = [] } = useExpenses(groupId);
  const { data: settlements = [] } = useSettlements(groupId);
  return [
    ...expenses.map((e) => ({ kind: 'expense', at: e.created_at, data: e })),
    ...settlements.map((s) => ({ kind: 'settlement', at: s.settled_at, data: s })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
}

async function uploadReceipt(file) {
  if (!file) return null;
  const ext = file.name?.split('.').pop() || 'jpg';
  const dataUrl = await fileToDataUrl(file);
  const { path } = await apiFetch('/api/receipts', {
    method: 'POST',
    body: { dataUrl, ext },
  });
  return path;
}

export function useCreateExpense(groupId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      title,
      amount,
      currency,
      paid_by,
      date,
      category,
      notes,
      splits,
      receipt,
    }) => {
      const receipt_url = await uploadReceipt(receipt);
      const { expense } = await apiFetch('/api/expenses', {
        method: 'POST',
        body: {
          group_id: groupId,
          paid_by,
          title,
          amount,
          currency,
          category,
          date,
          notes,
          receipt_url,
          splits,
        },
      });
      return expense;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', groupId] });
      qc.invalidateQueries({ queryKey: ['balances', groupId] });
      qc.invalidateQueries({ queryKey: ['overall-balance'] });
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
      broadcastChange({ type: 'expenses', groupId });
    },
  });
}

export function useUpdateExpense(groupId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      title,
      amount,
      currency,
      paid_by,
      date,
      category,
      notes,
      splits,
      receipt,
    }) => {
      let receipt_url;
      if (receipt instanceof File) {
        receipt_url = await uploadReceipt(receipt);
      }

      const updatePayload = {
        id,
        title,
        amount,
        currency,
        paid_by,
        date,
        category,
        notes,
        splits,
      };
      if (receipt_url) updatePayload.receipt_url = receipt_url;

      const { expense } = await apiFetch('/api/expenses', {
        method: 'PUT',
        body: updatePayload,
      });
      return expense;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', groupId] });
      qc.invalidateQueries({ queryKey: ['balances', groupId] });
      qc.invalidateQueries({ queryKey: ['overall-balance'] });
      broadcastChange({ type: 'expenses', groupId });
    },
  });
}

export function useDeleteExpense(groupId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await apiFetch(`/api/expenses?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', groupId] });
      qc.invalidateQueries({ queryKey: ['balances', groupId] });
      qc.invalidateQueries({ queryKey: ['overall-balance'] });
      broadcastChange({ type: 'expenses', groupId });
    },
  });
}

export function useCreateSettlement(groupId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ from_user_id, to_user_id, amount, note }) => {
      const { settlement } = await apiFetch('/api/settlements', {
        method: 'POST',
        body: { group_id: groupId, from_user_id, to_user_id, amount, note },
      });
      return settlement;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements', groupId] });
      qc.invalidateQueries({ queryKey: ['expenses', groupId] });
      qc.invalidateQueries({ queryKey: ['balances', groupId] });
      qc.invalidateQueries({ queryKey: ['overall-balance'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
      broadcastChange({ type: 'settlements', groupId });
    },
  });
}

// Subscribe to cross-tab & background changes for a group's expenses + settlements.
export function useGroupRealtime(groupId) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['expenses', groupId] });
      qc.invalidateQueries({ queryKey: ['settlements', groupId] });
      qc.invalidateQueries({ queryKey: ['group', groupId] });
    };

    const unsubscribe = subscribeChanges((msg) => {
      if (!msg.groupId || msg.groupId === groupId) {
        invalidate();
      }
    });

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        invalidate();
      }
    }, 15_000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [groupId, qc]);
}
