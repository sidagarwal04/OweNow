import crypto from 'node:crypto';
import { authUser, isGroupMember, json, writeStore } from './_shared.js';

// POST /api/invite
// Body: { email, groupId, groupName }
// - If a profile with this email exists in the store, the user is added straight to the group.
// - Otherwise, a pending invite is recorded in Netlify Blobs / local store and an email is sent via Resend.
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { user, state } = await authUser(event);
    const { email, groupId, groupName } = JSON.parse(event.body || '{}');
    if (!email || !groupId) return json(400, { error: 'email and groupId required' });

    if (!isGroupMember(state, groupId, user.id)) {
      return json(403, { error: 'Not a member' });
    }

    const normalized = email.trim().toLowerCase();
    const nowIso = new Date().toISOString();

    const existingProfile = Object.values(state.profiles).find(
      (p) => p.email?.toLowerCase() === normalized
    );

    if (existingProfile) {
      const alreadyMember = isGroupMember(state, groupId, existingProfile.id);
      if (alreadyMember) {
        return json(200, { added: true, alreadyMember: true, profile: existingProfile });
      }

      state.group_members.push({
        id: crypto.randomUUID(),
        group_id: groupId,
        user_id: existingProfile.id,
        role: 'member',
        joined_at: nowIso,
      });

      state.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: existingProfile.id,
        type: 'group_invite',
        message: `You were added to "${groupName ?? state.groups[groupId]?.name ?? 'a group'}"`,
        is_read: false,
        related_group_id: groupId,
        created_at: nowIso,
      });

      await writeStore(state);
      return json(200, { added: true, profile: existingProfile });
    }

    // Not on OweNow yet — record a pending invite so when they sign in with Google,
    // upsertUserOnSignIn auto-joins them.
    const expiresIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const existingInviteIdx = state.pending_invites.findIndex(
      (pi) => pi.email?.toLowerCase() === normalized && pi.group_id === groupId
    );
    const inviteRow = {
      id: existingInviteIdx >= 0 ? state.pending_invites[existingInviteIdx].id : crypto.randomUUID(),
      email: normalized,
      group_id: groupId,
      invited_by: user.id,
      created_at: nowIso,
      expires_at: expiresIso,
    };

    if (existingInviteIdx >= 0) {
      state.pending_invites[existingInviteIdx] = inviteRow;
    } else {
      state.pending_invites.push(inviteRow);
    }

    await writeStore(state);

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || 'OweNow <onboarding@resend.dev>';
    const appUrl =
      process.env.NEXTAUTH_URL || process.env.VITE_APP_URL || 'https://owenow.app';

    if (!apiKey) {
      return json(200, {
        added: false,
        pending: true,
        emailSent: false,
        warning: 'RESEND_API_KEY not configured; invite recorded and will auto-join on sign-in.',
      });
    }

    const html = inviteEmail({
      groupName,
      inviterName: user.user_metadata?.full_name || user.email,
      inviteeEmail: normalized,
      appUrl,
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [normalized],
        subject: `You've been invited to ${groupName ?? 'a group'} on OweNow`,
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resend error: ${text}`);
    }

    return json(200, { added: false, pending: true, emailSent: true });
  } catch (err) {
    return json(err.status || 500, { error: err.message });
  }
};

function inviteEmail({ groupName, inviterName, inviteeEmail, appUrl }) {
  return `<!doctype html>
<html><body style="background:#0A0F1E;color:#E6EAF2;font-family:Inter,system-ui,sans-serif;margin:0;padding:32px;">
  <div style="max-width:480px;margin:auto;background:#111A33;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
    <div style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#00D4AA,#6366F1);-webkit-background-clip:text;color:transparent;">OweNow</div>
    <h2 style="margin-top:24px;">You've been invited!</h2>
    <p style="color:#8A93A6;line-height:1.5;">
      <strong style="color:#fff;">${escapeHtml(inviterName)}</strong> invited you to join the group
      <strong style="color:#fff;">"${escapeHtml(groupName ?? 'a group')}"</strong> on OweNow — the simplest way to split expenses with friends.
    </p>
    <a href="${appUrl}" style="display:inline-block;margin-top:24px;background:#00D4AA;color:#0A0F1E;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:600;">
      Join group
    </a>
    <p style="color:#8A93A6;line-height:1.5;margin-top:24px;font-size:14px;">
      Sign in with <strong style="color:#fff;">${escapeHtml(inviteeEmail ?? 'this email')}</strong> and you'll be added to the group automatically. Using a different email? Ask ${escapeHtml(inviterName)} to invite that one instead.
    </p>
    <p style="color:#5C667D;font-size:12px;margin-top:32px;">
      If you didn't expect this, you can safely ignore this email.
    </p>
  </div>
</body></html>`;
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
