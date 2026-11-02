import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Phone,
  Mail,
  Building2,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  X,
  Target,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  UserX,
  UserCheck,
  FileText,
} from 'lucide-react';
import { Role, User } from '../../types/crm';
import { crmDb } from '../../services/db';

interface UserManagementViewProps {
  currentUser: User;
  onTrackMentor: (mentorId: string) => void;
  onRefreshAll: () => void;
}

const DESIGNATION_SUGGESTIONS = [
  'Senior Academic Mentor',
  'Student Relation Officer',
  'Faculty & Academic Coordinator',
  'IIT-JEE Prodigy Lead',
  'NEET Academic Relations Officer',
  'Foundation Academic Counselor',
];

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUser,
  onTrackMentor,
  onRefreshAll,
}) => {
  const [users, setUsers] = useState<User[]>(crmDb.getUsers());
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'MENTOR' | 'SUPER_ADMIN'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form State (Section 4.2: Passwords never displayed)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('MENTOR');
  const [department, setDepartment] = useState('Senior Academic Mentor');
  const [mobileNumber, setMobileNumber] = useState('');
  const [dailyCallGoal, setDailyCallGoal] = useState(60);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [successToast, setSuccessToast] = useState('');

  const refreshList = () => {
    setUsers(crmDb.getUsers());
    onRefreshAll();
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setName('');
    setEmail('');
    setUsername('');
    setPassword('');
    setRole('MENTOR');
    setDepartment('Senior Academic Mentor');
    setMobileNumber('');
    setDailyCallGoal(60);
    setMustChangePassword(true);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setName(user.name);
    setEmail(user.email);
    setUsername(user.username || '');
    setPassword(''); // Never prefilled per Section 4.2
    setRole(user.role);
    setDepartment(user.department || 'Senior Academic Mentor');
    setMobileNumber(user.mobile_number || '');
    setDailyCallGoal(user.daily_call_goal || 60);
    setMustChangePassword(user.must_change_password || false);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Staff name is required.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setFormError('A valid email address is required.');
      return;
    }

    try {
      if (editingUser) {
        crmDb.updateUser(
          editingUser.id,
          {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            username: username.trim().toLowerCase() || email.trim().toLowerCase(),
            role,
            department: department.trim(),
            mobile_number: mobileNumber.trim(),
            daily_call_goal: Number(dailyCallGoal),
            must_change_password: mustChangePassword,
            ...(password.trim() ? { password_hash: `bcrypt$12$${password.trim()}` } : {}),
          },
          currentUser
        );
        showSuccess(`User ${name} updated successfully.`);
      } else {
        if (!password.trim()) {
          setFormError('Password is required for new user.');
          return;
        }

        crmDb.addUser(
          {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            username: username.trim().toLowerCase() || email.trim().toLowerCase(),
            role,
            department: department.trim(),
            mobile_number: mobileNumber.trim(),
            daily_call_goal: Number(dailyCallGoal),
            status: 'ACTIVE',
            must_change_password: mustChangePassword,
            password_hash: `bcrypt$12$${password.trim()}`,
          },
          currentUser
        );
        showSuccess(`New ${role === 'SUPER_ADMIN' ? 'Administrator' : 'Academic Mentor'} created.`);
      }

      setIsModalOpen(false);
      refreshList();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed.');
    }
  };

  const handleToggleStatus = (user: User) => {
    if (user.id === currentUser.id) {
      alert('You cannot deactivate your own active administrator account.');
      return;
    }

    const nextStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const actionLabel = nextStatus === 'ACTIVE' ? 'activate' : 'deactivate';

    if (window.confirm(`Are you sure you want to ${actionLabel} ${user.name}?`)) {
      crmDb.updateUser(user.id, { status: nextStatus }, currentUser);
      showSuccess(`User account ${user.name} is now ${nextStatus}.`);
      refreshList();
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(''), 3500);
  };

  // Filtered list
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department && u.department.toLowerCase().includes(q)) ||
        (u.mobile_number && u.mobile_number.includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Toast */}
      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Mentor & Staff User Management (Section 4.2)
          </h2>
          <p className="text-xs text-slate-500">
            Manage calling staff, designations, and security credentials. Deactivated staff retain historical audit logs.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <UserPlus className="w-4 h-4 text-amber-400" />
          <span>Add New Staff / Mentor</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, email, or mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white cursor-pointer font-semibold"
        >
          <option value="ALL">All Roles</option>
          <option value="MENTOR">Mentors Only</option>
          <option value="SUPER_ADMIN">Administrators</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white cursor-pointer font-semibold"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active Staff</option>
          <option value="INACTIVE">Deactivated Staff</option>
        </select>
      </div>

      {/* Users Spreadsheet Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Designation</th>
                <th className="py-3 px-4">Direct Contact</th>
                <th className="py-3 px-4">Daily Target</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{u.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.role === 'SUPER_ADMIN'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {u.role === 'SUPER_ADMIN' ? 'ADMIN' : 'MENTOR'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {u.department || 'Senior Academic Mentor'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {u.mobile_number || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {u.daily_call_goal > 0 ? `${u.daily_call_goal} calls/day` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {u.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Track Calls Button (Section 11.C: Replaces banned impersonation) */}
                        {u.role === 'MENTOR' && (
                          <button
                            onClick={() => onTrackMentor(u.id)}
                            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-white rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            title="Open 1-to-1 Mentor Tracking Report"
                          >
                            <FileText className="w-3 h-3 text-amber-400" />
                            <span>Track Calls</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded cursor-pointer"
                          title="Edit credentials / designation"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`p-1.5 rounded cursor-pointer ${
                            u.status === 'ACTIVE'
                              ? 'hover:bg-rose-50 text-rose-600'
                              : 'hover:bg-emerald-50 text-emerald-600'
                          }`}
                          title={u.status === 'ACTIVE' ? 'Deactivate staff member' : 'Reactivate staff member'}
                        >
                          {u.status === 'ACTIVE' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal (Section 4.2) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-950 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">
                  Admin Console · RBAC Security
                </span>
                <h3 className="text-sm font-bold mt-0.5">
                  {editingUser ? `Update Account: ${editingUser.name}` : 'Register New Academic Staff Member'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-semibold">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Full Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Basarat Ansari Sir"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Role <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold"
                  >
                    <option value="MENTOR">Academic Mentor</option>
                    <option value="SUPER_ADMIN">Super Administrator</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Institutional Email <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="name@narayanagroup.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Direct Mobile Number
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Designation with Free-text Suggestions (Section 4.2) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Designation / Operational Role
                </label>
                <input
                  type="text"
                  list="designations-list"
                  placeholder="e.g. Senior Academic Mentor"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <datalist id="designations-list">
                  {DESIGNATION_SUGGESTIONS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>

              {/* Secure Password Input (Section 4.2: Never visible, bcrypt hashed) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  {editingUser ? 'Reset Password (leave empty to keep current)' : 'Account Password'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={editingUser ? 'Enter new password to reset' : 'Set secure initial password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="mustChange"
                    checked={mustChangePassword}
                    onChange={(e) => setMustChangePassword(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="mustChange" className="text-slate-700 font-medium">
                    Force password reset on first login
                  </label>
                </div>
              </div>

              {/* Daily Target */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Daily Call Goal Target
                </label>
                <input
                  type="number"
                  min="0"
                  value={dailyCallGoal}
                  onChange={(e) => setDailyCallGoal(Number(e.target.value))}
                  className="w-32 border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-950 hover:bg-slate-800 text-white font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
