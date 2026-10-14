import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save } from 'lucide-react';
import PageTransition from '../components/PageTransition.jsx';
import Avatar from '../components/Avatar.jsx';
import { useAuth } from '../lib/auth.jsx';
import toast from 'react-hot-toast';
import { useOverallBalance } from '../hooks/useBalances.js';
import { useGroups } from '../hooks/useGroups.js';
import { formatMoney } from '../utils/formatters.js';

export default function Profile() {
  const { user, profile, signOut, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.full_name || '');
  const [busy, setBusy] = useState(false);

  const { data: overall } = useOverallBalance();
  const { data: groups = [] } = useGroups();

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile({ full_name: name.trim() });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <PageTransition className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <h1 className="heading text-3xl mb-6">Profile</h1>

      <div className="card p-6 mb-6">
        <div className="flex items-center gap-4">
          <Avatar name={profile?.full_name || user?.email} url={profile?.avatar_url} size="xl" />
          <div className="min-w-0">
            <h2 className="heading text-lg truncate">{profile?.full_name || 'No name yet'}</h2>
            <p className="text-sm text-text-muted truncate">{user?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div>
            <label className="label">Display name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
            />
          </div>
          <button type="submit" disabled={busy || !name.trim()} className="btn-primary">
            <Save size={16} />
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Groups" value={groups.length} />
        <Stat label="Owed" value={formatMoney(overall?.owed ?? 0)} positive />
        <Stat label="Owing" value={formatMoney(overall?.owing ?? 0)} negative />
      </div>

      <button onClick={handleSignOut} className="btn-danger w-full">
        <LogOut size={16} />
        Sign out
      </button>
    </PageTransition>
  );
}

function Stat({ label, value, positive, negative }) {
  const color = positive ? 'text-accent' : negative ? 'text-danger' : 'text-text';
  return (
    <div className="card p-4 text-center">
      <p className="text-[11px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`font-display font-bold text-lg mt-1 ${color}`}>{value}</p>
    </div>
  );
}
