(function () {
  "use strict";

  const CURRENT_VERSION = 1;
  const VERSION_KEY = "yemOnboardingVersion";
  const steps = [
    {
      icon: "👋",
      title: "Welcome to YEM",
      text: "YEM brings your income, spending categories, expenses and monthly position into one place. This short tour shows the safest order for setting everything up."
    },
    {
      target: "[data-tour='categories']",
      icon: "🗂️",
      title: "Set up categories",
      text: "Start in Categories. Create fixed costs such as rent and flexible budgets such as groceries, then choose an allowance or projected-expense plan."
    },
    {
      target: "[data-tour='income']",
      icon: "💰",
      title: "Record your income",
      text: "Add salary, freelance payments or other income here. YEM uses these entries to calculate your monthly net position."
    },
    {
      target: "[data-tour='add-entry']",
      icon: "➕",
      title: "Add income or expenses",
      text: "Use this button whenever money comes in or goes out. Expenses can be regular, scheduled for approval, or spread across several months."
    },
    {
      target: "[data-tour='budget']",
      icon: "📊",
      title: "Read your monthly budget",
      text: "Use the month, year and category filters to compare each budget with what you spent and what remains. Select a category value for its detailed breakdown."
    },
    {
      target: "[data-tour='history']",
      icon: "🔎",
      title: "Review transaction history",
      text: "Filter and search past entries here. You can inspect, edit or remove incorrect entries without losing track of the month they belong to."
    },
    {
      target: "[data-tour='notifications']",
      icon: "🔔",
      title: "Approve scheduled payments",
      text: "Scheduled expenses appear in Notifications when they are expected. Approve them only after the money is actually deducted, or skip that occurrence."
    },
    {
      target: "[data-tour='safety']",
      icon: "🛟",
      title: "Protect and recover your data",
      text: "Actions contains backup import/export and this guided tour. Deleted entries can be recovered from the Recycle Bin. Reset All Data should be used only when you intentionally want a clean start."
    },
    {
      icon: "✅",
      title: "You’re ready",
      text: "Recommended next step: create your categories, add this month’s income, and then record your first expense. You can restart this guide anytime from Actions → Help & Guided Tour."
    }
  ];

  let currentStep = 0;
  let activeTarget = null;
  let previouslyFocused = null;
  let overlay;
  let dialog;
  let spotlight;
  let tourOpenedNavigation = false;
  let tourOpenedActions = false;

  function createTour() {
    if (dialog) return;
    overlay = document.createElement("div");
    overlay.className = "yem-tour-overlay";
    overlay.hidden = true;
    overlay.innerHTML = '<span data-tour-pane="top"></span><span data-tour-pane="right"></span><span data-tour-pane="bottom"></span><span data-tour-pane="left"></span>';

    spotlight = document.createElement("div");
    spotlight.className = "yem-tour-spotlight";
    spotlight.hidden = true;

    dialog = document.createElement("section");
    dialog.className = "yem-tour-dialog";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "yem-tour-title");
    dialog.setAttribute("aria-describedby", "yem-tour-description");
    dialog.innerHTML = `
      <div class="yem-tour-progress" aria-hidden="true"><span></span></div>
      <div class="yem-tour-step-label"></div>
      <div class="yem-tour-icon" aria-hidden="true"></div>
      <h2 id="yem-tour-title"></h2>
      <p id="yem-tour-description"></p>
      <div class="yem-tour-actions">
        <button type="button" class="yem-tour-skip">Skip tour</button>
        <div>
          <button type="button" class="yem-tour-back">Back</button>
          <button type="button" class="yem-tour-next">Next</button>
        </div>
      </div>`;

    document.body.append(overlay, spotlight, dialog);
    dialog.querySelector(".yem-tour-skip").addEventListener("click", () => finish(true));
    dialog.querySelector(".yem-tour-back").addEventListener("click", () => showStep(currentStep - 1));
    dialog.querySelector(".yem-tour-next").addEventListener("click", () => {
      if (currentStep === steps.length - 1) finish(false);
      else showStep(currentStep + 1);
    });
    document.addEventListener("keydown", handleKeydown);
  }

  function clearTarget() {
    if (!activeTarget) return;
    activeTarget.classList.remove("yem-tour-target");
    activeTarget = null;
    spotlight.hidden = true;
  }

  function closeTemporaryNavigation() {
    if (tourOpenedActions) {
      const actions = document.querySelector("details.header-actions");
      if (actions) actions.open = false;
      tourOpenedActions = false;
    }
    if (tourOpenedNavigation) {
      const sidebar = document.getElementById("sidebar");
      const navOverlay = document.getElementById("nav-overlay");
      if (sidebar) sidebar.classList.remove("nav-open");
      if (navOverlay) navOverlay.style.display = "none";
      tourOpenedNavigation = false;
    }
  }

  function prepareTarget(step) {
    const isHeaderTarget = step.target && /categories|notifications|safety/.test(step.target);
    if (isHeaderTarget && window.matchMedia("(max-width: 820px)").matches) {
      const sidebar = document.getElementById("sidebar");
      const navOverlay = document.getElementById("nav-overlay");
      if (sidebar && !sidebar.classList.contains("nav-open")) {
        sidebar.classList.add("nav-open");
        if (navOverlay) navOverlay.style.display = "block";
        tourOpenedNavigation = true;
      }
    }
    if (step.target && step.target.includes("safety")) {
      const actions = document.querySelector("details.header-actions");
      if (actions && !actions.open) {
        actions.open = true;
        tourOpenedActions = true;
      }
    }
    return step.target ? document.querySelector(step.target) : null;
  }

  function setRect(element, rect) {
    Object.assign(element.style, {
      left: `${Math.max(0, rect.left)}px`,
      top: `${Math.max(0, rect.top)}px`,
      width: `${Math.max(0, rect.width)}px`,
      height: `${Math.max(0, rect.height)}px`
    });
  }

  function positionHighlight() {
    const panes = {
      top: overlay.querySelector('[data-tour-pane="top"]'),
      right: overlay.querySelector('[data-tour-pane="right"]'),
      bottom: overlay.querySelector('[data-tour-pane="bottom"]'),
      left: overlay.querySelector('[data-tour-pane="left"]')
    };
    if (!activeTarget) {
      Object.values(panes).forEach((pane, index) => pane.hidden = index !== 0);
      setRect(panes.top, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
      spotlight.hidden = true;
      dialog.classList.remove("yem-tour-dialog-top");
      dialog.classList.add("yem-tour-dialog-bottom");
      return;
    }

    const padding = 9;
    const targetRect = activeTarget.getBoundingClientRect();
    const hole = {
      left: Math.max(0, targetRect.left - padding),
      top: Math.max(0, targetRect.top - padding),
      right: Math.min(window.innerWidth, targetRect.right + padding),
      bottom: Math.min(window.innerHeight, targetRect.bottom + padding)
    };
    hole.width = Math.max(0, hole.right - hole.left);
    hole.height = Math.max(0, hole.bottom - hole.top);
    Object.values(panes).forEach((pane) => pane.hidden = false);
    setRect(panes.top, { left: 0, top: 0, width: window.innerWidth, height: hole.top });
    setRect(panes.bottom, { left: 0, top: hole.bottom, width: window.innerWidth, height: window.innerHeight - hole.bottom });
    setRect(panes.left, { left: 0, top: hole.top, width: hole.left, height: hole.height });
    setRect(panes.right, { left: hole.right, top: hole.top, width: window.innerWidth - hole.right, height: hole.height });
    setRect(spotlight, hole);
    spotlight.hidden = false;

    const targetCenter = hole.top + hole.height / 2;
    dialog.classList.toggle("yem-tour-dialog-top", targetCenter > window.innerHeight / 2);
    dialog.classList.toggle("yem-tour-dialog-bottom", targetCenter <= window.innerHeight / 2);
  }

  function revealAndPositionTarget() {
    if (!activeTarget) return positionHighlight();
    const fixedOrHeaderTarget = window.getComputedStyle(activeTarget).position === "fixed" || Boolean(activeTarget.closest(".yem-navbar"));
    activeTarget.scrollIntoView({ behavior: "auto", block: fixedOrHeaderTarget ? "nearest" : "start", inline: "nearest" });
    window.requestAnimationFrame(() => {
      positionHighlight();
      const targetRect = spotlight.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const overlaps = targetRect.left < dialogRect.right && targetRect.right > dialogRect.left && targetRect.top < dialogRect.bottom && targetRect.bottom > dialogRect.top;
      if (overlaps) {
        const dialogAtBottom = dialog.classList.contains("yem-tour-dialog-bottom");
        const desiredEdge = dialogAtBottom ? dialogRect.top - 18 : dialogRect.bottom + 18;
        const scrollAmount = dialogAtBottom ? targetRect.bottom - desiredEdge : targetRect.top - desiredEdge;
        window.scrollBy({ top: scrollAmount, behavior: "auto" });
        window.requestAnimationFrame(() => {
          positionHighlight();
          const adjustedTarget = spotlight.getBoundingClientRect();
          const adjustedDialog = dialog.getBoundingClientRect();
          const stillOverlaps = adjustedTarget.left < adjustedDialog.right && adjustedTarget.right > adjustedDialog.left && adjustedTarget.top < adjustedDialog.bottom && adjustedTarget.bottom > adjustedDialog.top;
          if (stillOverlaps) {
            dialog.classList.toggle("yem-tour-dialog-top", dialogAtBottom);
            dialog.classList.toggle("yem-tour-dialog-bottom", !dialogAtBottom);
          }
        });
      }
    });
    if (fixedOrHeaderTarget) window.setTimeout(positionHighlight, 300);
  }

  function showStep(index) {
    createTour();
    clearTarget();
    closeTemporaryNavigation();
    currentStep = Math.max(0, Math.min(index, steps.length - 1));
    const step = steps[currentStep];
    activeTarget = prepareTarget(step);
    if (activeTarget) {
      activeTarget.classList.add("yem-tour-target");
    }

    dialog.querySelector(".yem-tour-step-label").textContent = `Step ${currentStep + 1} of ${steps.length}`;
    dialog.querySelector(".yem-tour-icon").textContent = step.icon;
    dialog.querySelector("#yem-tour-title").textContent = step.title;
    dialog.querySelector("#yem-tour-description").textContent = step.text;
    dialog.querySelector(".yem-tour-progress span").style.width = `${((currentStep + 1) / steps.length) * 100}%`;
    dialog.querySelector(".yem-tour-back").disabled = currentStep === 0;
    dialog.querySelector(".yem-tour-next").textContent = currentStep === steps.length - 1 ? "Finish" : "Next";
    dialog.querySelector(".yem-tour-skip").hidden = currentStep === steps.length - 1;
    dialog.querySelector(".yem-tour-next").focus({ preventScroll: true });
    window.requestAnimationFrame(revealAndPositionTarget);
  }

  function start(options) {
    createTour();
    previouslyFocused = document.activeElement;
    const sidebar = document.getElementById("sidebar");
    const navOverlay = document.getElementById("nav-overlay");
    const actions = document.querySelector("details.header-actions");
    if (sidebar) sidebar.classList.remove("nav-open");
    if (navOverlay) navOverlay.style.display = "none";
    if (actions) actions.open = false;
    tourOpenedNavigation = false;
    tourOpenedActions = false;
    overlay.hidden = false;
    dialog.hidden = false;
    document.body.classList.add("yem-tour-open");
    showStep(options && Number.isInteger(options.step) ? options.step : 0);
  }

  function finish(skipped) {
    localStorage.setItem(VERSION_KEY, String(CURRENT_VERSION));
    clearTarget();
    closeTemporaryNavigation();
    overlay.hidden = true;
    dialog.hidden = true;
    document.body.classList.remove("yem-tour-open");
    if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
    if (!skipped) window.dispatchEvent(new CustomEvent("yem:onboarding-complete", { detail: { version: CURRENT_VERSION } }));
  }

  function handleKeydown(event) {
    if (!dialog || dialog.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (currentStep === steps.length - 1) finish(false);
      else showStep(currentStep + 1);
    } else if (event.key === "ArrowLeft" && currentStep > 0) {
      event.preventDefault();
      showStep(currentStep - 1);
    } else if (event.key === "Tab") {
      const controls = [...dialog.querySelectorAll("button:not([hidden]):not(:disabled)")];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function bindLaunchers() {
    document.querySelectorAll("[data-onboarding-start]").forEach((button) => {
      button.addEventListener("click", () => start());
    });
  }

  function autoStartWhenReady() {
    if (Number(localStorage.getItem(VERSION_KEY) || 0) >= CURRENT_VERSION) return;
    const launch = () => window.setTimeout(() => start(), 450);
    if (!document.documentElement.classList.contains("auth-checking")) return launch();
    const observer = new MutationObserver(() => {
      if (document.documentElement.classList.contains("auth-checking")) return;
      observer.disconnect();
      launch();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindLaunchers();
    autoStartWhenReady();
  });

  window.addEventListener("resize", () => {
    if (dialog && !dialog.hidden) revealAndPositionTarget();
  });

  window.YEMOnboarding = { start, version: CURRENT_VERSION };
})();
