import crypto from 'node:crypto';
import { authUser, isGroupMember, json, writeStore } from './_shared.js';

export const handler = async (event) => {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const params = event.queryStringParameters || {};

  try {
    const { user, state } = await authUser(event);

    if (method === 'GET') {
      const requestedIds = params.groupIds
        ? params.groupIds.split(',').map((s) => s.trim()).filter(Boolean)
        : params.groupId
        ? [params.groupId]
        : [];

      const allowedIds = new Set(
        requestedIds.filter((gid) => isGroupMember(state, gid, user.id))
      );

      const expenses = Object.values(state.expenses)
        .filter((e) => allowedIds.has(e.group_id))
        .sort((a, b) => {
          const dDiff = new Date(b.date || b.created_at) - new Date(a.date || a.created_at);
          if (dDiff !== 0) return dDiff;
          return new Date(b.created_at) - new Date(a.created_at);
        });

      return json(200, { expenses });
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        group_id,
        paid_by,
        title,
        amount,
        currency = 'INR',
        category = 'general',
        date,
        notes = null,
        receipt_url = null,
        splits = [],
      } = body;

      if (!group_id || !title || !paid_by) {
        return json(400, { error: 'group_id, title, and paid_by are required' });
      }
      if (!isGroupMember(state, group_id, user.id)) {
        return json(403, { error: 'Not a member of this group' });
      }

      const nowIso = new Date().toISOString();
      const expenseId = crypto.randomUUID();
      const expenseSplits = (splits || []).map((s) => ({
        id: crypto.randomUUID(),
        expense_id: expenseId,
        user_id: s.user_id,
        amount: Number(s.amount) || 0,
        split_type: s.split_type || 'equal',
      }));

      const expense = {
        id: expenseId,
        group_id,
        paid_by,
        title: String(title).trim(),
        amount: Number(amount) || 0,
        currency,
        category,
        date: date || nowIso.slice(0, 10),
        notes,
        receipt_url,
        created_at: nowIso,
        expense_splits: expenseSplits,
      };

      state.expenses[expenseId] = expense;

      // Notify every other group member
      const group = state.groups[group_id];
      const payer = state.profiles[paid_by];
      const members = state.group_members.filter(
        (m) => m.group_id === group_id && m.user_id !== paid_by
      );
      for (const m of members) {
        state.notifications.unshift({
          id: crypto.randomUUID(),
          user_id: m.user_id,
          type: 'expense_added',
          message: `${payer?.full_name || 'Someone'} added "${expense.title}" in ${group?.name || 'a group'}`,
          is_read: false,
          related_group_id: group_id,
          created_at: nowIso,
        });
      }

      await writeStore(state);
      return json(200, { expense });
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = JSON.parse(event.body || '{}');
      const { id, title, amount, currency, paid_by, date, category, notes, receipt_url, splits } =
        body;
      const existing = state.expenses[id];
      if (!existing) return json(404, { error: 'Expense not found' });
      if (!isGroupMember(state, existing.group_id, user.id)) {
        return json(403, { error: 'Not a member of this group' });
      }

      const updatedSplits = Array.isArray(splits)
        ? splits.map((s) => ({
            id: crypto.randomUUID(),
            expense_id: id,
            user_id: s.user_id,
            amount: Number(s.amount) || 0,
            split_type: s.split_type || 'equal',
          }))
        : existing.expense_splits;

      const updated = {
        ...existing,
        title: title !== undefined ? String(title).trim() : existing.title,
        amount: amount !== undefined ? Number(amount) || 0 : existing.amount,
        currency: currency ?? existing.currency,
        paid_by: paid_by ?? existing.paid_by,
        date: date ?? existing.date,
        category: category ?? existing.category,
        notes: notes !== undefined ? notes : existing.notes,
        receipt_url: receipt_url !== undefined ? receipt_url : existing.receipt_url,
        expense_splits: updatedSplits,
      };

      state.expenses[id] = updated;
      await writeStore(state);
      return json(200, { expense: updated });
    }

    if (method === 'DELETE') {
      const id = params.id || JSON.parse(event.body || '{}').id;
      const existing = state.expenses[id];
      if (!existing) return json(404, { error: 'Expense not found' });
      if (!isGroupMember(state, existing.group_id, user.id)) {
        return json(403, { error: 'Not a member of this group' });
      }
      delete state.expenses[id];
      await writeStore(state);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(err.status || 500, { error: err.message });
  }
};
