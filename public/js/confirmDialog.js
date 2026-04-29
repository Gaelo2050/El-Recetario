(function () {
  if (window.showPopupConfirm) return;

  const appendWhenReady = (node) => {
    if (document.body) {
      document.body.appendChild(node);
      return;
    }

    const onReady = () => {
      document.removeEventListener('DOMContentLoaded', onReady);
      if (document.body && !node.isConnected) {
        document.body.appendChild(node);
      }
    };

    document.addEventListener('DOMContentLoaded', onReady);
  };

  const createDialog = () => {
    const overlay = document.createElement('div');
    overlay.id = 'appConfirmOverlay';
    overlay.className = 'fixed inset-0 z-[1200] hidden items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6';

    overlay.innerHTML = `
      <div class="max-w-sm w-full rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100">
          <p class="text-xs uppercase tracking-wide font-semibold text-orange-500" id="appConfirmSubtitle">Confirmación</p>
          <h2 class="text-lg font-bold text-gray-900" id="appConfirmTitle">¿Deseas continuar?</h2>
        </div>
        <div class="px-5 py-4 text-sm text-gray-700" id="appConfirmMessage">
          ¿Seguro que deseas realizar esta acción?
        </div>
        <div class="flex flex-col gap-3 px-5 py-4 border-t border-gray-100 sm:flex-row sm:justify-end">
          <button type="button" class="app-confirm-cancel inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="button" class="app-confirm-accept inline-flex items-center justify-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">Aceptar</button>
        </div>
      </div>`;

    appendWhenReady(overlay);
    return overlay;
  };

  const overlay = createDialog();
  const cancelButton = overlay.querySelector('.app-confirm-cancel');
  const acceptButton = overlay.querySelector('.app-confirm-accept');
  const titleElement = overlay.querySelector('#appConfirmTitle');
  const subtitleElement = overlay.querySelector('#appConfirmSubtitle');
  const messageElement = overlay.querySelector('#appConfirmMessage');

  let resolver = null;

  const closeOverlay = () => {
    overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  };

  const openOverlay = () => {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    document.body.classList.add('overflow-hidden');
  };

  cancelButton.addEventListener('click', () => {
    closeOverlay();
    if (resolver) resolver(false);
  });

  acceptButton.addEventListener('click', () => {
    closeOverlay();
    if (resolver) resolver(true);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeOverlay();
      if (resolver) resolver(false);
    }
  });

  window.showPopupConfirm = (message, options = {}) => new Promise((resolve) => {
    const { title = 'Confirmación', subtitle = 'Acción requerida', confirmText = 'Aceptar', cancelText = 'Cancelar' } = options;
    titleElement.textContent = title;
    subtitleElement.textContent = subtitle;
    messageElement.textContent = message;
    acceptButton.textContent = confirmText;
    cancelButton.textContent = cancelText;
    resolver = resolve;
    openOverlay();
  });
})();
