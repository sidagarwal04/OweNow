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

      const settlements = Object.values(state.settlements)
        .filter((s) => allowedIds.has(s.group_id))
        .sort((a, b) => new Date(b.settled_at) - new Date(a.settled_at));

      return json(200, { settlements });
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { group_id, from_user_id, to_user_id, amount, note = null } = body;

      if (!group_id || !from_user_id || !to_user_id || !(Number(amount) > 0)) {
        return json(400, { error: 'group_id, from_user_id, to_user_id, and positive amount required' });
      }
      if (from_user_id === to_user_id) {
        return json(400, { error: 'Cannot settle with yourself' });
      }
      if (!isGroupMember(state, group_id, user.id)) {
        return json(403, { error: 'Not a member of this group' });
      }

      const nowIso = new Date().toISOString();
      const settlement = {
        id: crypto.randomUUID(),
        group_id,
        from_user_id,
        to_user_id,
        amount: Number(amount),
        note,
        settled_at: nowIso,
      };

      state.settlements[settlement.id] = settlement;

      // Notify recipient
      const group = state.groups[group_id];
      const payer = state.profiles[from_user_id];
      state.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: to_user_id,
        type: 'settled_up',
        message: `${payer?.full_name || 'Someone'} paid you in ${group?.name || 'a group'}`,
        is_read: false,
        related_group_id: group_id,
        created_at: nowIso,
      });

      await writeStore(state);
      return json(200, { settlement });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(err.status || 500, { error: err.message });
  }
};
