import crypto from 'node:crypto';
import { authUser, isGroupMember, json, writeStore } from './_shared.js';

function hydrateGroupMembers(state, groupId) {
  return state.group_members
    .filter((m) => m.group_id === groupId)
    .map((m) => ({
      ...m,
      profiles: state.profiles[m.user_id] || {
        id: m.user_id,
        full_name: 'Member',
        avatar_url: null,
        email: '',
      },
    }));
}

export const handler = async (event) => {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const params = event.queryStringParameters || {};

  try {
    const { user, state } = await authUser(event);

    if (method === 'GET') {
      if (params.id) {
        const group = state.groups[params.id];
        if (!group) return json(404, { error: 'Group not found' });
        if (group.created_by !== user.id && !isGroupMember(state, group.id, user.id)) {
          return json(403, { error: 'Not a member of this group' });
        }
        return json(200, {
          group: {
            ...group,
            group_members: hydrateGroupMembers(state, group.id),
          },
        });
      }

      const myMemberships = state.group_members.filter((m) => m.user_id === user.id);
      const groups = myMemberships
        .map((m) => {
          const g = state.groups[m.group_id];
          if (!g) return null;
          const members = hydrateGroupMembers(state, g.id);
          return {
            ...g,
            your_role: m.role,
            members,
            group_members: members,
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return json(200, { groups });
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const name = String(body.name || '').trim();
      if (!name) return json(400, { error: 'Group name is required' });

      const nowIso = new Date().toISOString();
      const group = {
        id: crypto.randomUUID(),
        name,
        emoji: body.emoji || '💸',
        description: body.description ? String(body.description).trim() : '',
        created_by: user.id,
        created_at: nowIso,
      };

      state.groups[group.id] = group;
      state.group_members.push({
        id: crypto.randomUUID(),
        group_id: group.id,
        user_id: user.id,
        role: 'admin',
        joined_at: nowIso,
      });

      await writeStore(state);
      return json(200, { group });
    }

    if (method === 'DELETE') {
      const groupId = params.id || JSON.parse(event.body || '{}').groupId;
      if (!groupId) return json(400, { error: 'groupId required' });

      state.group_members = state.group_members.filter(
        (m) => !(m.group_id === groupId && m.user_id === user.id)
      );
      await writeStore(state);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(err.status || 500, { error: err.message });
  }
};
