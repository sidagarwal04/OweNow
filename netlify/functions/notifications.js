import { authUser, json, writeStore } from './_shared.js';

export const handler = async (event) => {
  const method = (event.httpMethod || 'GET').toUpperCase();

  try {
    const { user, state } = await authUser(event);

    if (method === 'GET') {
      const userNotifs = state.notifications
        .filter((n) => n.user_id === user.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const unreadCount = userNotifs.filter((n) => !n.is_read).length;
      return json(200, {
        notifications: userNotifs.slice(0, 50),
        unreadCount,
      });
    }

    if (method === 'PATCH' || method === 'PUT' || method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (body.all) {
        for (const n of state.notifications) {
          if (n.user_id === user.id) n.is_read = true;
        }
      } else if (body.id) {
        const found = state.notifications.find(
          (n) => n.id === body.id && n.user_id === user.id
        );
        if (found) found.is_read = true;
      }
      await writeStore(state);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(err.status || 500, { error: err.message });
  }
};
