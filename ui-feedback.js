(function () {
  "use strict";

  let activeDialog = null;
  let dialogQueue = Promise.resolve();

  function ensureFeedbackUI() {
    let toastRegion = document.getElementById("yem-toast-region");
    if (!toastRegion) {
      toastRegion = document.createElement("div");
      toastRegion.id = "yem-toast-region";
      toastRegion.className = "yem-toast-region";
      toastRegion.setAttribute("aria-live", "polite");
      toastRegion.setAttribute("aria-atomic", "false");
      document.body.appendChild(toastRegion);
    }

    let overlay = document.getElementById("yem-feedback-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "yem-feedback-overlay";
      overlay.className = "yem-feedback-overlay";
      overlay.hidden = true;
      document.body.appendChild(overlay);
    }
    return { toastRegion, overlay };
  }

  function inferToastType(message, requestedType) {
    if (requestedType) return requestedType;
    const text = String(message || "");
    if (/❌|invalid|error|could not|cannot|failed/i.test(text)) return "error";
    if (/⚠|please|no entries|no deleted|no history/i.test(text)) return "warning";
    if (/✅|success|saved|restored|posted|updated/i.test(text)) return "success";
    return "info";
  }

  function toastIcon(type) {
    return { success: "✓", error: "!", warning: "!", info: "i" }[type] || "i";
  }

  window.yemToast = function yemToast(message, options) {
    const settings = typeof options === "string" ? { type: options } : (options || {});
    const { toastRegion } = ensureFeedbackUI();
    const type = inferToastType(message, settings.type);
    const toast = document.createElement("div");
    toast.className = `yem-toast yem-toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");

    const icon = document.createElement("span");
    icon.className = "yem-toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = toastIcon(type);
    const text = document.createElement("span");
    text.className = "yem-toast-message";
    text.textContent = String(message || "").replace(/^[✅❌⚠️]+\s*/, "");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "yem-toast-close";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    toast.append(icon, text, close);
    toastRegion.appendChild(toast);

    const dismiss = () => {
      if (!toast.isConnected) return;
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 180);
    };
    close.addEventListener("click", dismiss);
    const duration = Number(settings.duration) || (type === "error" ? 6500 : 4200);
    setTimeout(dismiss, duration);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    return undefined;
  };

  function normalizeDialogOptions(options, fallbackTitle) {
    if (typeof options === "string") return { title: fallbackTitle, message: options };
    return { title: fallbackTitle, ...(options || {}) };
  }

  function enqueueDialog(builder) {
    const result = dialogQueue.then(() => builder());
    dialogQueue = result.catch(() => undefined);
    return result;
  }

  function openDialog(options) {
    return new Promise(resolve => {
      const { overlay } = ensureFeedbackUI();
      const previousFocus = document.activeElement;
      const modal = document.createElement("section");
      modal.className = "yem-feedback-dialog";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "yem-feedback-title");

      const header = document.createElement("div");
      header.className = "yem-feedback-dialog-header";
      const dialogClose = document.createElement("button");
      dialogClose.type = "button";
      dialogClose.className = "yem-feedback-dialog-close";
      dialogClose.setAttribute("aria-label", "Close prompt");
      dialogClose.textContent = "×";
      const title = document.createElement("h2");
      title.id = "yem-feedback-title";
      title.textContent = options.title;
      header.append(dialogClose, title);

      const message = document.createElement("p");
      message.className = "yem-feedback-dialog-message";
      message.textContent = options.message || "";
      modal.append(header, message);

      let input = null;
      if (options.input) {
        const label = document.createElement("label");
        label.className = "yem-feedback-input-label";
        label.textContent = options.inputLabel || "Value";
        input = document.createElement(options.multiline ? "textarea" : "input");
        input.className = "yem-feedback-input";
        if (!options.multiline) input.type = options.inputType || "text";
        input.value = options.defaultValue == null ? "" : String(options.defaultValue);
        input.placeholder = options.placeholder || "";
        label.appendChild(input);
        modal.appendChild(label);
      }

      const actions = document.createElement("div");
      actions.className = `yem-feedback-dialog-actions${options.choices ? " yem-feedback-choice-actions" : ""}`;
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "yem-feedback-secondary-action";
      cancel.textContent = options.cancelLabel || "Cancel";
      const choiceButtons = [];
      let confirm = null;
      if (options.choices) {
        options.choices.forEach(choice => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = choice.danger ? "yem-feedback-danger-action" : "yem-feedback-primary-action";
          button.textContent = choice.label;
          button.addEventListener("click", () => finish(choice.value));
          choiceButtons.push(button);
          actions.appendChild(button);
        });
        actions.appendChild(cancel);
      } else {
        confirm = document.createElement("button");
        confirm.type = "button";
        confirm.className = options.danger ? "yem-feedback-danger-action" : "yem-feedback-primary-action";
        confirm.textContent = options.confirmLabel || "Continue";
        if (options.notice) actions.appendChild(confirm);
        else actions.append(cancel, confirm);
      }
      modal.appendChild(actions);
      overlay.replaceChildren(modal);
      overlay.hidden = false;
      document.body.classList.add("yem-feedback-open");
      activeDialog = modal;

      const finish = value => {
        overlay.hidden = true;
        overlay.replaceChildren();
        document.body.classList.remove("yem-feedback-open");
        document.removeEventListener("keydown", onKeyDown, true);
        overlay.removeEventListener("click", onOverlayClick);
        activeDialog = null;
        if (previousFocus && previousFocus.focus) previousFocus.focus();
        resolve(value);
      };
      const cancelValue = options.choices || options.input || options.notice ? null : false;
      const submit = () => finish(options.input ? input.value : options.choices ? options.choices[0].value : true);
      const onKeyDown = event => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(cancelValue);
        } else if (event.key === "Enter" && document.activeElement.tagName !== "BUTTON" && (!options.multiline || event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        } else if (event.key === "Tab") {
          const focusable = [...modal.querySelectorAll("button, input, textarea")].filter(element => !element.disabled);
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      };
      const onOverlayClick = event => {
        if (event.target === overlay) finish(cancelValue);
      };
      dialogClose.addEventListener("click", () => finish(cancelValue));
      cancel.addEventListener("click", () => finish(cancelValue));
      if (confirm) confirm.addEventListener("click", submit);
      overlay.addEventListener("click", onOverlayClick);
      document.addEventListener("keydown", onKeyDown, true);
      requestAnimationFrame(() => (input || choiceButtons[0] || confirm || cancel).focus());
    });
  }

  window.yemConfirm = function yemConfirm(options) {
    const settings = normalizeDialogOptions(options, "Please confirm");
    return enqueueDialog(() => openDialog(settings));
  };

  window.yemPrompt = function yemPrompt(options, defaultValue) {
    const settings = normalizeDialogOptions(options, "Enter information");
    settings.input = true;
    if (settings.defaultValue == null) settings.defaultValue = defaultValue;
    return enqueueDialog(() => openDialog(settings));
  };

  window.yemChoose = function yemChoose(options) {
    const settings = normalizeDialogOptions(options, "Choose an option");
    settings.choices = Array.isArray(settings.choices) ? settings.choices : [];
    return enqueueDialog(() => openDialog(settings));
  };

  window.yemNotice = function yemNotice(options) {
    const settings = normalizeDialogOptions(options, "Done");
    settings.notice = true;
    if (!settings.confirmLabel) settings.confirmLabel = "Done";
    return enqueueDialog(() => openDialog(settings));
  };

  window.yemFeedbackActive = () => Boolean(activeDialog);
})();
