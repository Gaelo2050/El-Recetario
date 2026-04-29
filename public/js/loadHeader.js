(function () {
  const SHARED_HEADER_PATH = "/views/partials/header.html";

  const TOAST_VARIANTS = {
    success: {
      borderClass: "border-emerald-400",
      icon: "check_circle",
      iconClass: "text-emerald-500",
      title: "Éxito",
    },
    error: {
      borderClass: "border-red-400",
      icon: "error",
      iconClass: "text-red-500",
      title: "Error",
    },
    warning: {
      borderClass: "border-amber-400",
      icon: "warning",
      iconClass: "text-amber-500",
      title: "Aviso",
    },
    info: {
      borderClass: "border-blue-400",
      icon: "info",
      iconClass: "text-blue-500",
      title: "Información",
    },
  };

  const ensureToastContainer = () => {
    let container = document.getElementById("toastContainer");
    if (container) return container;
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-3 px-4 pointer-events-none";
    document.body.appendChild(container);
    return container;
  };

  const showPopupMessage = (message, variant = "info") => {
    const container = ensureToastContainer();
    const settings = TOAST_VARIANTS[variant] || TOAST_VARIANTS.info;

    const toast = document.createElement("div");
    toast.role = "alert";
    toast.className = `pointer-events-auto w-full max-w-sm rounded-2xl border-l-4 bg-white p-4 shadow-2xl transition-all duration-200 ease-out ${settings.borderClass}`;
    toast.classList.add("opacity-0", "translate-y-2");

    const wrapper = document.createElement("div");
    wrapper.className = "flex items-start gap-3";

    const icon = document.createElement("span");
    icon.className = `material-symbols-outlined text-2xl ${settings.iconClass}`;
    icon.textContent = settings.icon;

    const content = document.createElement("div");
    content.className = "flex-1 text-sm text-gray-700";
    const title = document.createElement("p");
    title.className = "text-sm font-semibold text-gray-900";
    title.textContent = settings.title;
    const body = document.createElement("p");
    body.className = "mt-1 text-sm text-gray-600";
    body.textContent = message;
    content.appendChild(title);
    content.appendChild(body);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "text-gray-400 hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500";
    closeBtn.innerHTML = '<span class="material-symbols-outlined text-lg">close</span>';

    const removeToast = () => {
      toast.classList.remove("opacity-100", "translate-y-0");
      toast.classList.add("opacity-0", "-translate-y-2");
      setTimeout(() => {
        toast.remove();
        if (!container.children.length) {
          container.remove();
        }
      }, 200);
    };

    closeBtn.addEventListener("click", removeToast);

    wrapper.appendChild(icon);
    wrapper.appendChild(content);
    wrapper.appendChild(closeBtn);
    toast.appendChild(wrapper);
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove("opacity-0", "translate-y-2");
      toast.classList.add("opacity-100", "translate-y-0");
    });

    setTimeout(removeToast, 4500);

    return toast;
  };

  const setupHeaderInteractions = (root) => {
    if (!root) return;

    const toggle = root.querySelector("#mobileMenuToggle");
    const menu = root.querySelector("#mobileMenu");

    const closeMenu = () => {
      if (!menu) return;
      if (!menu.classList.contains("hidden")) {
        menu.classList.add("hidden");
      }
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      const icon = toggle?.querySelector(".material-symbols-outlined");
      if (icon) icon.textContent = "menu";
    };

    if (toggle && menu) {
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = menu.classList.contains("hidden");
        menu.classList.toggle("hidden");
        toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
        const icon = toggle.querySelector(".material-symbols-outlined");
        if (icon) icon.textContent = willOpen ? "close" : "menu";
      });

      document.addEventListener("click", (event) => {
        if (menu.contains(event.target)) return;
        if (event.target === toggle || toggle.contains(event.target)) return;
        closeMenu();
      });
    }

    const userSession = window.UserSession;
    if (userSession && typeof userSession.inicializarPagina === "function") {
      userSession.inicializarPagina({
        root,
        desktopNode: root.querySelector("#userSectionDesktop"),
        mobileNode: root.querySelector("#mobileUserSection"),
        menuItems: ({ defaultItems, tipo }) => {
          const items = Array.isArray(defaultItems) ? [...defaultItems] : [];
          if (Number(tipo) === 1) {
            items.push({
              href: "/administracion",
              icon: "admin_panel_settings",
              label: "Panel de Administración",
            });
          }
          return items;
        },
      });
    }
  };

  const resolveHeaderContainer = () => {
    let placeholder = document.getElementById("headerContainer");
    if (placeholder) return placeholder;

    const firstHeader = document.querySelector("body > header");
    if (firstHeader) {
      placeholder = document.createElement("div");
      placeholder.id = "headerContainer";
      firstHeader.replaceWith(placeholder);
      return placeholder;
    }

    const body = document.body;
    if (body) {
      placeholder = document.createElement("div");
      placeholder.id = "headerContainer";
      body.insertBefore(placeholder, body.firstChild || null);
      return placeholder;
    }

    return null;
  };

  const injectHeader = async () => {
    const container = resolveHeaderContainer();
    if (!container) return;

    try {
      const response = await fetch(SHARED_HEADER_PATH, { cache: "no-store" });
      if (!response.ok) throw new Error(`status_${response.status}`);
      const html = await response.text();
      container.innerHTML = html;
      setupHeaderInteractions(container);
    } catch (error) {
      console.error("[header] Falló al cargar el encabezado compartido", error);
      showPopupMessage("No se pudo cargar el encabezado. Intenta recargar la página.", "error");
    }
  };

  if (typeof window !== "undefined") {
    if (!window.showPopupMessage) {
      window.showPopupMessage = showPopupMessage;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectHeader);
    } else {
      injectHeader();
    }
  }
})();

