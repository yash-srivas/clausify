/**
 * Login Page Controller - With 1-Click Instant Demo Login
 */

import { api } from '../api.js';
import { setToken, setUser, isLoggedIn, getUser, getDefaultRedirectForRole } from '../auth.js';

document.addEventListener('DOMContentLoaded', () => {
  if (isLoggedIn()) {
    const user = getUser();
    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get('returnUrl');
    window.location.replace(returnUrl ? decodeURIComponent(returnUrl) : getDefaultRedirectForRole(user.role));
    return;
  }

  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');
  const submitBtn = document.getElementById('submitBtn');
  const btnSpinner = document.getElementById('btnSpinner');
  const btnText = document.getElementById('btnText');
  const alertBox = document.getElementById('alertBox');
  const demoButtons = document.querySelectorAll('.demo-btn');

  const params = new URLSearchParams(window.location.search);
  if (params.get('expired') === '1') {
    showAlert('Your session has expired. Please log in again.', 'warning');
  }

  // 1-Click Instant Demo Sign-In
  demoButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-email');
      const pass = btn.getAttribute('data-password');
      emailInput.value = email;
      passwordInput.value = pass;
      await performLogin(email, pass);
    });
  });

  function showAlert(message, type = 'danger') {
    alertBox.className = `alert alert-${type} clay-card-flat py-2 px-3 small border-0 mb-3`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
  }

  function hideAlert() {
    alertBox.classList.add('d-none');
  }

  function setLoading(loading) {
    if (loading) {
      submitBtn.disabled = true;
      btnSpinner.classList.remove('d-none');
      btnText.textContent = 'Signing in...';
    } else {
      submitBtn.disabled = false;
      btnSpinner.classList.add('d-none');
      btnText.textContent = 'Sign In to Workspace';
    }
  }

  async function performLogin(email, password) {
    hideAlert();
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      if (response && response.token && response.user) {
        setToken(response.token);
        setUser(response.user);

        const returnUrl = params.get('returnUrl');
        const target = returnUrl ? decodeURIComponent(returnUrl) : getDefaultRedirectForRole(response.user.role);
        window.location.href = target;
      } else {
        showAlert('Invalid server response. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      showAlert(err.message || 'Login failed. Please verify your credentials.');
      setLoading(false);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showAlert('Please enter both your email address and password.');
      return;
    }

    await performLogin(email, password);
  });

  // Mode Toggle in Login Footer
  const loginModeBtn = document.getElementById('loginModeBtn');
  if (loginModeBtn) {
    loginModeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.toggleMode) {
        window.toggleMode();
      }
    });
  }
});
