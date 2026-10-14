import { authUser, isGroupMember, json } from './_shared.js';

// POST /api/simplify-debts
// Body: { groupId: string }
// Returns: { balances: {userId: net}, transactions: [{ from, to, amount }] }
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const { user, state } = await authUser(event);
    const { groupId } = JSON.parse(event.body || '{}');
    if (!groupId) return json(400, { error: 'groupId required' });

    if (!isGroupMember(state, groupId, user.id)) {
      return json(403, { error: 'Not a member of this group' });
    }

    const expenses = Object.values(state.expenses).filter((e) => e.group_id === groupId);
    const settlements = Object.values(state.settlements).filter((s) => s.group_id === groupId);

    const balances = {};
    const bump = (uid, delta) => {
      if (!uid) return;
      balances[uid] = (balances[uid] ?? 0) + delta;
    };

    for (const e of expenses) {
      bump(e.paid_by, Number(e.amount) || 0);
      for (const s of e.expense_splits ?? []) bump(s.user_id, -Number(s.amount || 0));
    }
    for (const s of settlements) {
      bump(s.from_user_id, Number(s.amount) || 0);
      bump(s.to_user_id, -Number(s.amount) || 0);
    }

    const transactions = simplify(balances);
    return json(200, { balances, transactions });
  } catch (err) {
    return json(err.status || 500, { error: err.message });
  }
};

function simplify(balances) {
  const round = (n) => Math.round(n * 100) / 100;
  const creditors = [];
  const debtors = [];
  for (const [uid, raw] of Object.entries(balances)) {
    const a = round(raw);
    if (a > 0) creditors.push({ uid, amount: a });
    else if (a < 0) debtors.push({ uid, amount: -a });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const tx = [];
  while (creditors.length && debtors.length) {
    const c = creditors[0];
    const d = debtors[0];
    const pay = round(Math.min(c.amount, d.amount));
    if (pay > 0) tx.push({ from: d.uid, to: c.uid, amount: pay });
    c.amount = round(c.amount - pay);
    d.amount = round(d.amount - pay);
    if (c.amount <= 0) creditors.shift();
    if (d.amount <= 0) debtors.shift();
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);
  }
  return tx;
}
