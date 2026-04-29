(function () {
  const USER_ENDPOINT = '/api/usuario';
  const LOGOUT_ENDPOINT = '/cerrar-sesion';
  const COOKIE_NAME = 'userInfo';

  if (window.UserSession) {
    return;
  }

  const state = {
    user: null,
    loading: false,
    loaded: false,
    error: null,
    readyPromise: null,
  };

  const subscribers = new Set();

  const DEFAULT_MENU = [
    { href: '/perfil', icon: 'person', label: 'Mi perfil' },
    { href: '/recetas-guardadas', icon: 'bookmark', label: 'Guardados' },
    { href: '/configuracion', icon: 'settings', label: 'Configuración' },
    { divider: true },
    { action: 'logout', icon: 'logout', label: 'Cerrar sesión' },
  ];

  const sanitize = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
  })[char] || char);

  const getRawCookieValue = (name) => {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const cookies = document.cookie.split(';');
    const raw = cookies.find((entry) => entry.trim().startsWith(`${name}=`));
    return raw ? raw.trim().slice(name.length + 1) : null;
  };

  const getCookieValue = (name) => {
    const rawValue = getRawCookieValue(name);
    if (!rawValue) return null;
    try {
      return decodeURIComponent(rawValue);
    } catch (error) {
      console.warn('[UserSession] No se pudo decodificar la cookie', name, error);
      return null;
    }
  };

  const parseUserCookie = () => {
    try {
      const value = getCookieValue(COOKIE_NAME);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn('[UserSession] No se pudo analizar la cookie userInfo', error);
      return null;
    }
  };

  const setUserCookie = (payload) => {
    try {
      if (!payload) {
        document.cookie = `${COOKIE_NAME}=; Path=/; Expires=${new Date(0).toUTCString()}; SameSite=Lax`;
        return;
      }
      const serialized = encodeURIComponent(JSON.stringify({
        id: payload.id,
        nombre: payload.nombre,
        Tipo_Usu_ID: payload.Tipo_Usu_ID,
      }));
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `${COOKIE_NAME}=${serialized}; Path=/; Expires=${expires}; SameSite=Lax`;
    } catch (error) {
      console.warn('[UserSession] No se pudo sincronizar la cookie userInfo', error);
    }
  };

  const setUser = (user) => {
    state.user = user || null;
    state.loaded = true;
    state.error = null;
    if (user && user.id) {
      setUserCookie(user);
    } else {
      setUserCookie(null);
    }
    notify();
  };

  const notify = () => {
    subscribers.forEach((handler) => {
      try {
        handler(state.user);
      } catch (error) {
        console.error('[UserSession] Suscriptor falló', error);
      }
    });
  };

  const fetchUser = async (forceNetwork = false) => {
    if (state.loading) return state.readyPromise;
    if (state.loaded && !forceNetwork) return Promise.resolve(state.user);

    const cookieUser = !forceNetwork ? parseUserCookie() : null;
    if (cookieUser) {
      setUser(cookieUser);
      return Promise.resolve(cookieUser);
    }

    state.loading = true;
    state.readyPromise = fetch(USER_ENDPOINT, { credentials: 'same-origin' })
      .then(async (response) => {
        if (response.status === 401) {
          setUser(null);
          return null;
        }
        if (!response.ok) {
          throw new Error(`status_${response.status}`);
        }
        const data = await response.json();
        setUser(data || null);
        return data;
      })
      .catch((error) => {
        state.error = error;
        console.warn('[UserSession] No se pudo obtener /api/usuario', error);
        if (!state.loaded) {
          setUser(null);
        } else {
          notify();
        }
        return null;
      })
      .finally(() => {
        state.loading = false;
      });

    return state.readyPromise;
  };

  const ensureUserLoaded = () => {
    if (state.loaded || state.loading) return state.readyPromise;
    return fetchUser(false);
  };

  const getUserSnapshot = () => state.user || parseUserCookie();

  const obtenerInfoUsuario = () => getUserSnapshot();

  const obtenerTipoUsuario = (userOverride) => {
    const source = userOverride || getUserSnapshot();
    if (!source) return null;
    const numeric = Number(source.Tipo_Usu_ID);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const obtenerCookie = (name) => {
    if (!name) return null;
    return getCookieValue(name);
  };

  const estaAutenticado = () => {
    const snapshot = getUserSnapshot();
    return Boolean(snapshot && snapshot.id);
  };

  const exigirAutenticacion = (options = {}) => {
    const doc = typeof document !== 'undefined' ? document : null;
    const {
      selector,
      root = doc,
      redirectTo = '/iniciar-sesion',
      eventName,
    } = options || {};

    if (!selector || !root || typeof root.querySelectorAll !== 'function') {
      return () => { };
    }

    const nodes = Array.from(root.querySelectorAll(selector));
    if (!nodes.length) {
      return () => { };
    }

    const handlers = nodes.map((node) => {
      const evt = eventName || (node.tagName === 'FORM' ? 'submit' : 'click');
      const handler = (event) => {
        if (estaAutenticado()) return;
        event.preventDefault();
        event.stopPropagation();
        window.location.href = redirectTo;
      };
      node.addEventListener(evt, handler);
      return { node, evt, handler };
    });

    return () => handlers.forEach(({ node, evt, handler }) => node.removeEventListener(evt, handler));
  };

  const logout = async (event) => {
    if (event) event.preventDefault();
    try {
      await fetch(LOGOUT_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (error) {
      console.warn('[UserSession] Error al cerrar sesión', error);
    } finally {
      setUser(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  };

  const buildMenuItems = (builder, user) => {
    const defaults = DEFAULT_MENU.map((item) => ({ ...item }));
    if (typeof builder === 'function') {
      try {
        const custom = builder({ defaultItems: defaults, tipo: user?.Tipo_Usu_ID, user });
        if (Array.isArray(custom)) {
          return custom;
        }
      } catch (error) {
        console.warn('[UserSession] menuItems builder falló', error);
      }
    }
    return defaults;
  };

  const buildAvatarUrl = (user) => {
    if (user && user.foto) {
      return user.foto.startsWith('http') ? user.foto : `${user.foto}`;
    }
    const name = user && user.nombre ? user.nombre : 'Chef';
    const initials = encodeURIComponent(name.split(' ').slice(0, 2).join(' '));
    return `https://ui-avatars.com/api/?name=${initials}&background=FF7D4A&color=FFFFFF&size=128`;
  };

  const renderMenuDesktop = (items) => items.map((item) => {
    if (item.divider) {
      return '<div class="my-1 border-t border-gray-100"></div>';
    }
    if (item.action === 'logout') {
      return `
        <button type="button" data-logout-btn class="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
          <span class="material-symbols-outlined text-base">${sanitize(item.icon || 'logout')}</span>
          ${sanitize(item.label || 'Cerrar sesión')}
        </button>`;
    }
    const href = sanitize(item.href || '#');
    return `
      <a href="${href}" class="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
        <span class="material-symbols-outlined text-base">${sanitize(item.icon || 'chevron_right')}</span>
        ${sanitize(item.label || 'Opción')}
      </a>`;
  }).join('');

  const renderMenuMobile = (items) => items.map((item) => {
    if (item.divider) {
      return '<div class="border-t border-gray-100 my-2"></div>';
    }
    if (item.action === 'logout') {
      return `
        <button type="button" data-logout-btn class="flex items-center gap-2 text-sm font-semibold text-red-600">
          <span class="material-symbols-outlined text-base">${sanitize(item.icon || 'logout')}</span>
          ${sanitize(item.label || 'Cerrar sesión')}
        </button>`;
    }
    const href = sanitize(item.href || '#');
    return `
      <a href="${href}" class="flex items-center gap-2 text-sm text-gray-700 hover:text-orange-500">
        <span class="material-symbols-outlined text-base">${sanitize(item.icon || 'chevron_right')}</span>
        ${sanitize(item.label || 'Opción')}
      </a>`;
  }).join('');

  const attachMenuHandlers = (container) => {
    if (!container) return;
    if (typeof container.__userMenuCleanup === 'function') {
      container.__userMenuCleanup();
    }

    const toggle = container.querySelector('[data-user-menu-toggle]');
    const menu = container.querySelector('[data-user-menu]');
    if (!toggle || !menu) {
      container.__userMenuCleanup = null;
      return;
    }

    let open = false;
    const closeMenu = () => {
      open = false;
      menu.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      open = true;
      menu.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
    };

    const handleToggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (open) closeMenu(); else openMenu();
    };

    const handleDocumentClick = (event) => {
      if (!container.contains(event.target)) {
        closeMenu();
      }
    };

    const handleEsc = (event) => {
      if (event.key === 'Escape') closeMenu();
    };

    toggle.addEventListener('click', handleToggle);
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleEsc);

    container.__userMenuCleanup = () => {
      toggle.removeEventListener('click', handleToggle);
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleEsc);
    };
  };

  const attachLogoutHandlers = (scope) => {
    if (!scope) return;
    scope.querySelectorAll('[data-logout-btn]').forEach((btn) => {
      btn.addEventListener('click', logout);
    });
  };

  const renderAuthenticated = (target, user, menuItems) => {
    const desktop = target.desktopNode;
    const mobile = target.mobileNode;
    const safeName = sanitize(user?.nombre || user?.username || 'Chef invitado');
    const avatarUrl = buildAvatarUrl(user);
    const subtitle = Number(user?.Tipo_Usu_ID) === 1 ? 'Administrador' : 'Mi cuenta';

    if (desktop) {
      desktop.innerHTML = `
        <div class="relative" data-user-session-root>
          <button type="button" data-user-menu-toggle class="flex items-center gap-3 text-gray-700 hover:text-purple-600" aria-haspopup="true" aria-expanded="false">
            <img src="${avatarUrl}" alt="${safeName}" class="h-10 w-10 rounded-full border border-gray-200 object-cover">
            <div class="text-left">
              <p class="text-sm font-semibold">${safeName}</p>
              <p class="text-xs text-gray-500">${sanitize(subtitle)}</p>
            </div>
            <span class="material-symbols-outlined text-base">expand_more</span>
          </button>
          <div data-user-menu class="absolute right-0 z-50 mt-3 w-64 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl hidden">
            ${renderMenuDesktop(menuItems)}
          </div>
        </div>`;
      attachMenuHandlers(desktop);
      attachLogoutHandlers(desktop);
    }

    if (mobile) {
      mobile.innerHTML = `
        <div class="flex items-center gap-3 rounded-2xl bg-orange-50 px-3 py-3">
          <img src="${avatarUrl}" alt="${safeName}" class="h-12 w-12 rounded-full border border-orange-100 object-cover">
          <div>
            <p class="text-sm font-semibold text-gray-900">${safeName}</p>
            <p class="text-xs text-gray-500">${sanitize(subtitle)}</p>
          </div>
        </div>
        <div class="mt-3 flex flex-col gap-2">
          ${renderMenuMobile(menuItems)}
        </div>`;
      attachLogoutHandlers(mobile);
    }
  };

  const renderAnonymous = (target) => {
    const desktop = target.desktopNode;
    const mobile = target.mobileNode;
    if (desktop) {
      desktop.innerHTML = `
        <a href="/iniciar-sesion" class="text-sm text-gray-600 hover:text-purple-600 transition flex items-center gap-1">
          <span class="material-symbols-outlined text-base">person</span>
          Inicia sesión
        </a>
        <a href="/registro" class="px-6 py-3 text-sm rounded-md bg-orange-500 text-white font-semibold hover:bg-orange-600">
          Regístrate
        </a>`;
    }
    if (mobile) {
      mobile.innerHTML = `
        <a href="/iniciar-sesion" class="text-sm font-medium text-gray-700 hover:text-orange-500 transition">Inicia sesión</a>
        <a href="/registro" class="text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 transition px-3 py-2 rounded-lg text-center">Regístrate</a>`;
    }
  };

  const renderTargets = (target, user) => {
    if (!target) return;
    const menuItems = user ? buildMenuItems(target.menuItems, user) : [];
    if (user) {
      renderAuthenticated(target, user, menuItems);
    } else {
      renderAnonymous(target);
    }
  };

  const resolveSubscriptionNode = (target) => {
    if (!target) return null;
    if (target.subscriptionNode && document.body && document.body.contains(target.subscriptionNode)) {
      return target.subscriptionNode;
    }
    if (target.subscriptionSelector) {
      const scope = target.root && typeof target.root.querySelector === 'function'
        ? target.root
        : document;
      target.subscriptionNode = scope.querySelector(target.subscriptionSelector);
    }
    return target.subscriptionNode || null;
  };

  const manageSubscriptionVisibility = (target, user) => {
    if (!target || (!target.subscriptionSelector && !target.subscriptionNode)) return;
    const node = resolveSubscriptionNode(target);
    if (!node) return;

    const hideSet = target.subscriptionHideSet || new Set();
    const tipo = Number(user?.Tipo_Usu_ID);
    const shouldHide = hideSet.size > 0 && Number.isFinite(tipo) && hideSet.has(tipo);

    if (shouldHide) {
      if (typeof node.dataset.originalDisplay === 'undefined') {
        node.dataset.originalDisplay = node.style.display || '';
      }
      node.style.display = 'none';
      node.setAttribute('aria-hidden', 'true');
      node.dataset.subscriptionHidden = '1';
    } else {
      if (typeof node.dataset.originalDisplay !== 'undefined') {
        node.style.display = node.dataset.originalDisplay;
      } else {
        node.style.display = '';
      }
      node.removeAttribute('aria-hidden');
      delete node.dataset.subscriptionHidden;
    }
  };

  const inicializarPagina = (options = {}) => {
    const hideTypes = Array.isArray(options.hideSubscriptionForTypes)
      ? options.hideSubscriptionForTypes
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
      : [];

    const target = {
      root: options.root || document,
      desktopNode: options.desktopNode || document.getElementById('userSectionDesktop'),
      mobileNode: options.mobileNode || document.getElementById('mobileUserSection'),
      menuItems: options.menuItems || null,
      subscriptionSelector: options.subscriptionSelector || null,
      subscriptionNode: options.subscriptionNode || null,
      subscriptionHideSet: new Set(hideTypes),
    };

    const subscriber = (user) => {
      renderTargets(target, user);
      manageSubscriptionVisibility(target, user);
    };
    subscribers.add(subscriber);
    renderTargets(target, state.user);
    manageSubscriptionVisibility(target, state.user);
    ensureUserLoaded();

    return () => {
      subscribers.delete(subscriber);
    };
  };

  const ready = () => ensureUserLoaded();

  const api = {
    ready,
    ensure: ensureUserLoaded,
    refresh: () => fetchUser(true),
    getUser: () => state.user,
    obtenerInfoUsuario,
    obtenerTipoUsuario,
    obtenerCookie,
    exigirAutenticacion,
    logout,
    subscribe: (handler) => {
      if (typeof handler !== 'function') return () => { };
      subscribers.add(handler);
      handler(state.user);
      return () => subscribers.delete(handler);
    },
    inicializarPagina,
  };

  window.UserSession = api;
  ensureUserLoaded();
})();
