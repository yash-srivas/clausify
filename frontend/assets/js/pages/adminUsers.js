/**
 * Admin Users Controller
 */

import { api } from '../api.js';
import { requireAuth, renderNavbar } from '../auth.js';
import { showToast } from '../toast.js';

let users = [];

document.addEventListener('DOMContentLoaded', async () => {
  const admin = requireAuth(['admin']);
  if (!admin) return;

  renderNavbar('admin-users');

  setupUserForm();
  setupResetPasswordForm();

  await loadUsers();
});

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  try {
    const res = await api.get('/admin/users');
    users = Array.isArray(res) ? res : (res.users || []);
    renderTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-danger small py-3 text-center">Failed to load users: ${err.message}</td></tr>`;
  }
}

function renderTable() {
  const tbody = document.getElementById('usersTableBody');
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = users
    .map((u) => {
      const roleBadge =
        u.role === 'admin'
          ? '<span class="badge badge-risk-high text-uppercase">ADMIN</span>'
          : u.role === 'partner'
          ? '<span class="badge bg-primary text-white text-uppercase">PARTNER</span>'
          : '<span class="badge bg-secondary text-white text-uppercase">ASSOCIATE</span>';

      const statusBadge = u.is_active
        ? '<span class="clay-badge clay-badge-approved"><i class="bi bi-check-circle-fill"></i> ACTIVE</span>'
        : '<span class="clay-badge clay-badge-rejected"><i class="bi bi-dash-circle-fill"></i> INACTIVE</span>';

      const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';
      const createdDate = u.created_at ? new Date(u.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '--';

      return `
        <tr>
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="rounded-circle bg-white shadow-xs border text-primary fw-bold d-flex align-items-center justify-content-center" style="width: 36px; height: 36px; font-size: 0.9rem;">
                ${(u.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <div class="fw-bold text-dark fs-6">${u.name}</div>
                <div class="small text-muted">${u.email}</div>
              </div>
            </div>
          </td>
          <td>${roleBadge}</td>
          <td>${statusBadge}</td>
          <td class="small text-muted fw-medium">${createdDate}</td>
          <td class="small text-muted fw-medium">${lastLogin}</td>
          <td class="text-end">
            <div class="d-flex justify-content-end align-items-center gap-1">
              <button class="btn btn-outline-secondary btn-sm edit-user-btn p-1 px-2" data-id="${u.id}" title="Edit User">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-outline-secondary btn-sm reset-pass-btn p-1 px-2" data-id="${u.id}" title="Reset Password">
                <i class="bi bi-key"></i>
              </button>
              <button class="btn ${u.is_active ? 'btn-outline-danger' : 'btn-outline-success'} btn-sm toggle-status-btn p-1 px-2" data-id="${u.id}" data-active="${u.is_active}" title="${u.is_active ? 'Deactivate User' : 'Activate User'}">
                <i class="bi ${u.is_active ? 'bi-person-slash' : 'bi-person-check'}"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // Edit listeners
  tbody.querySelectorAll('.edit-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openEditModal(id);
    });
  });

  // Reset password listeners
  tbody.querySelectorAll('.reset-pass-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openResetModal(id);
    });
  });

  // Toggle status listeners
  tbody.querySelectorAll('.toggle-status-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const isCurrentlyActive = btn.getAttribute('data-active') === 'true';
      const newStatus = !isCurrentlyActive;

      try {
        await api.patch(`/admin/users/${id}/status`, { is_active: newStatus });
        showToast(`User ${newStatus ? 'activated' : 'deactivated'} successfully!`, 'success');
        await loadUsers();
      } catch (err) {
        showToast('Failed to toggle status: ' + err.message, 'danger');
      }
    });
  });
}

function openEditModal(userId) {
  const user = users.find((u) => u.id === userId);
  if (!user) return;

  document.getElementById('editUserId').value = user.id;
  document.getElementById('userNameInput').value = user.name;
  document.getElementById('userEmailInput').value = user.email;
  document.getElementById('userRoleSelect').value = user.role;
  document.getElementById('userModalLabel').textContent = 'Edit User Account';

  // Hide password field for edit
  document.getElementById('passwordGroup').classList.add('d-none');
  document.getElementById('userPasswordInput').removeAttribute('required');

  const modalEl = document.getElementById('userModal');
  new window.bootstrap.Modal(modalEl).show();
}

function openResetModal(userId) {
  const user = users.find((u) => u.id === userId);
  if (!user) return;

  document.getElementById('resetUserId').value = user.id;
  document.getElementById('resetUserName').textContent = `${user.name} (${user.email})`;
  document.getElementById('newPasswordInput').value = '';

  const modalEl = document.getElementById('resetPasswordModal');
  new window.bootstrap.Modal(modalEl).show();
}

function setupUserForm() {
  const form = document.getElementById('userForm');
  const modalEl = document.getElementById('userModal');

  modalEl.addEventListener('show.bs.modal', (e) => {
    // If opened via "Create" button
    if (!document.getElementById('editUserId').value) {
      document.getElementById('userModalLabel').textContent = 'Create User Account';
      document.getElementById('passwordGroup').classList.remove('d-none');
      document.getElementById('userPasswordInput').setAttribute('required', 'true');
      form.reset();
      document.getElementById('editUserId').value = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('editUserId').value;
    const name = document.getElementById('userNameInput').value.trim();
    const email = document.getElementById('userEmailInput').value.trim();
    const role = document.getElementById('userRoleSelect').value;
    const password = document.getElementById('userPasswordInput').value;

    const saveBtn = document.getElementById('saveUserBtn');
    saveBtn.disabled = true;

    try {
      if (editId) {
        await api.put(`/admin/users/${editId}`, { name, email, role });
        showToast('User updated successfully!', 'success');
      } else {
        await api.post('/admin/users', { name, email, role, password });
        showToast('User created successfully!', 'success');
      }

      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      if (modal) modal.hide();
      form.reset();
      document.getElementById('editUserId').value = '';
      await loadUsers();
    } catch (err) {
      showToast('Error saving user: ' + err.message, 'danger');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function setupResetPasswordForm() {
  const form = document.getElementById('resetPasswordForm');
  const modalEl = document.getElementById('resetPasswordModal');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('resetUserId').value;
    const newPassword = document.getElementById('newPasswordInput').value;

    try {
      await api.post(`/admin/users/${userId}/reset-password`, { password: newPassword });
      showToast('Password reset successfully!', 'success');
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      if (modal) modal.hide();
    } catch (err) {
      showToast('Failed to reset password: ' + err.message, 'danger');
    }
  });
}
