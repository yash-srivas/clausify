/**
 * Toast notification utility using Bootstrap 5 Toasts
 */

export function showToast(message, type = 'info', title = null) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  }

  const toastId = 'toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const bgClass =
    type === 'danger' || type === 'error'
      ? 'bg-danger text-white'
      : type === 'success'
      ? 'bg-success text-white'
      : type === 'warning'
      ? 'bg-warning text-dark'
      : 'bg-primary text-white';

  const defaultTitle =
    type === 'danger' || type === 'error'
      ? 'Error'
      : type === 'success'
      ? 'Success'
      : type === 'warning'
      ? 'Warning'
      : 'Notification';

  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center ${bgClass} border-0 shadow" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header ${bgClass} border-bottom border-light-subtle">
        <strong class="me-auto">${title || defaultTitle}</strong>
        <small class="text-white-50">just now</small>
        <button type="button" class="btn-close ${type === 'warning' ? '' : 'btn-close-white'}" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        ${message}
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', toastHtml);
  const toastEl = document.getElementById(toastId);

  if (window.bootstrap && window.bootstrap.Toast) {
    const toast = new window.bootstrap.Toast(toastEl, { delay: 4000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  } else {
    // Fallback if bootstrap JS is not loaded
    toastEl.style.display = 'block';
    setTimeout(() => {
      toastEl.remove();
    }, 4000);
  }
}

export default { showToast };

