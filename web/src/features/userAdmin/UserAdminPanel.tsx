import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authApi } from "../../data/authApi";
import type { AuthUser } from "../../contracts/api";

type UserAdminPanelProps = {
  onClose: () => void;
};

type EditingUser = {
  username: string;
  firstname: string;
  lastname: string;
  is_admin: boolean;
};

export function UserAdminPanel({ onClose }: UserAdminPanelProps) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // ── Create user form ──
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirstname, setNewFirstname] = useState("");
  const [newLastname, setNewLastname] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  // ── Edit user ──
  const [editing, setEditing] = useState<EditingUser | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Delete confirmation ──
  const [deleting, setDeleting] = useState<string | null>(null);

  // ── Password reset ──
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await authApi.listUsers();
      setUsers(result.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const clearMessage = () => {
    setMessage("");
    setError("");
  };

  // ── Create ──
  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    clearMessage();
    setCreating(true);
    try {
      await authApi.createUser({
        username: newUsername.trim(),
        password: newPassword,
        firstname: newFirstname.trim(),
        lastname: newLastname.trim(),
        is_admin: newIsAdmin,
      });
      setMessage(`User "${newUsername.trim()}" created.`);
      setNewUsername("");
      setNewPassword("");
      setNewFirstname("");
      setNewLastname("");
      setNewIsAdmin(false);
      setShowCreateForm(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setCreating(false);
    }
  };

  // ── Edit ──
  const startEdit = (user: AuthUser) => {
    setEditing({
      username: user.username,
      firstname: user.firstname,
      lastname: user.lastname,
      is_admin: user.is_admin,
    });
    clearMessage();
  };

  const handleSaveEdit = async () => {
    if (!editing || saving) return;
    clearMessage();
    setSaving(true);
    try {
      await authApi.updateUser(editing.username, {
        firstname: editing.firstname,
        lastname: editing.lastname,
        is_admin: editing.is_admin,
      });
      setMessage(`User "${editing.username}" updated.`);
      setEditing(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = async (username: string) => {
    clearMessage();
    try {
      await authApi.deleteUser(username);
      setMessage(`User "${username}" deleted.`);
      setDeleting(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    }
  };

  // ── Reset password ──
  const handleResetPassword = async (username: string) => {
    if (!resetPasswordValue) return;
    clearMessage();
    try {
      const result = await authApi.resetUserPassword(username, resetPasswordValue);
      setMessage(result.message);
      setResettingPassword(null);
      setResetPasswordValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    }
  };

  return (
    <div className="kiss-ai-update-modal-backdrop" role="presentation">
      <section className="kiss-ai-update-modal user-admin-modal" role="dialog" aria-modal="true" aria-labelledby="user-admin-title">
        <div className="kiss-ai-update-modal-header">
          <div>
            <span className="eyebrow">Administration</span>
            <h2 id="user-admin-title">User Management</h2>
          </div>
          <button className="kiss-ai-update-close" onClick={onClose} type="button" aria-label="Close user admin dialog">
            x
          </button>
        </div>

        {error ? (
          <div className="warning-callout" role="alert">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        ) : null}

        {message ? (
          <div className="settings-success-callout" role="status">
            <p>{message}</p>
          </div>
        ) : null}

        {loading ? (
          <p className="user-admin-loading">Loading users…</p>
        ) : (
          <>
            <div className="user-admin-toolbar">
              <button
                className="user-admin-add-btn"
                onClick={() => { setShowCreateForm(!showCreateForm); setEditing(null); clearMessage(); }}
                type="button"
              >
                {showCreateForm ? "Cancel" : "+ Add User"}
              </button>
            </div>

            {showCreateForm ? (
              <form className="user-admin-form" onSubmit={handleCreate}>
                <div className="user-admin-form-row">
                  <label className="user-admin-form-field">
                    <span>Username</span>
                    <input
                      autoFocus
                      disabled={creating}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="username"
                      type="text"
                      value={newUsername}
                    />
                  </label>
                  <label className="user-admin-form-field">
                    <span>Password</span>
                    <input
                      autoComplete="new-password"
                      disabled={creating}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="min 8 characters"
                      type="password"
                      value={newPassword}
                    />
                  </label>
                </div>
                <div className="user-admin-form-row">
                  <label className="user-admin-form-field">
                    <span>First Name</span>
                    <input
                      disabled={creating}
                      onChange={(e) => setNewFirstname(e.target.value)}
                      placeholder="First name"
                      type="text"
                      value={newFirstname}
                    />
                  </label>
                  <label className="user-admin-form-field">
                    <span>Last Name</span>
                    <input
                      disabled={creating}
                      onChange={(e) => setNewLastname(e.target.value)}
                      placeholder="Last name"
                      type="text"
                      value={newLastname}
                    />
                  </label>
                </div>
                <label className="user-admin-checkbox">
                  <input
                    checked={newIsAdmin}
                    disabled={creating}
                    onChange={(e) => setNewIsAdmin(e.target.checked)}
                    type="checkbox"
                  />
                  <span>Administrator</span>
                </label>
                <button className="user-admin-submit" disabled={creating || !newUsername.trim() || !newPassword} type="submit">
                  {creating ? "Creating…" : "Create User"}
                </button>
              </form>
            ) : null}

            <div className="user-admin-list">
              {users.map((user) => (
                <div className="user-admin-row" key={user.username}>
                  {editing?.username === user.username ? (
                    <div style={{ flex: 1 }}>
                      <div className="user-admin-row-name" style={{ marginBottom: "0.5rem" }}>
                        {user.username}
                      </div>
                      <div className="user-admin-edit-card">
                        <div className="user-admin-edit-fields">
                          <input
                            autoFocus
                            disabled={saving}
                            onChange={(e) => setEditing({ ...editing, firstname: e.target.value })}
                            placeholder="First name"
                            type="text"
                            value={editing.firstname}
                          />
                          <input
                            disabled={saving}
                            onChange={(e) => setEditing({ ...editing, lastname: e.target.value })}
                            placeholder="Last name"
                            type="text"
                            value={editing.lastname}
                          />
                        </div>
                        <div className="user-admin-edit-footer">
                          <label className="user-admin-checkbox">
                            <input
                              checked={editing.is_admin}
                              disabled={saving}
                              onChange={(e) => setEditing({ ...editing, is_admin: e.target.checked })}
                              type="checkbox"
                            />
                            <span>Admin</span>
                          </label>
                          <div className="user-admin-actions" style={{ marginLeft: "auto" }}>
                            <button
                              disabled={saving}
                              onClick={() => void handleSaveEdit()}
                              type="button"
                            >
                              {saving ? "Saving…" : "Save"}
                            </button>
                            <button onClick={() => setEditing(null)} type="button">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="user-admin-row-info">
                        <div className="user-admin-row-name">
                          {user.username}
                          {user.is_system ? <span className="user-admin-badge-system">system</span> : null}
                          {user.is_admin ? <span className="user-admin-badge-role">admin</span> : null}
                        </div>
                        <div className="user-admin-row-detail">
                          {[user.firstname, user.lastname].filter(Boolean).join(" ") || "—"}
                        </div>
                        {resettingPassword === user.username ? (
                          <div className="user-admin-reset-pwd">
                            <input
                              autoFocus
                              onChange={(e) => setResetPasswordValue(e.target.value)}
                              placeholder="New password (min 8 chars)"
                              type="password"
                              value={resetPasswordValue}
                            />
                            <button
                              disabled={resetPasswordValue.length < 8}
                              onClick={() => void handleResetPassword(user.username)}
                              type="button"
                            >
                              Confirm
                            </button>
                            <button onClick={() => { setResettingPassword(null); setResetPasswordValue(""); }} type="button">
                              Cancel
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="user-admin-actions">
                        {user.is_system ? (
                          <span className="user-admin-muted">CLI only</span>
                        ) : (
                          <>
                            <button onClick={() => startEdit(user)} type="button">Edit</button>
                            <button onClick={() => { setResettingPassword(user.username); setResetPasswordValue(""); clearMessage(); }} type="button">Reset Pwd</button>
                            {deleting === user.username ? (
                              <>
                                <button className="user-admin-danger" onClick={() => void handleDelete(user.username)} type="button">Confirm</button>
                                <button onClick={() => setDeleting(null)} type="button">Cancel</button>
                              </>
                            ) : (
                              <button onClick={() => { setDeleting(user.username); clearMessage(); }} type="button">Delete</button>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
