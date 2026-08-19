(function () {
  "use strict";

  const dialogs = [...document.querySelectorAll(".entry-dialog")];
  let activeDialog = null;
  let openingSnapshot = "";

  function formFor(dialog) {
    return dialog?.querySelector("form") || null;
  }

  function snapshot(form) {
    if (!form) return "";
    return JSON.stringify([...form.querySelectorAll("input, select, textarea")].map(field => ({
      key: field.name || field.id || field.type,
      value: field.type === "checkbox" || field.type === "radio" ? field.checked : field.value
    })));
  }

  function open(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (!dialog) return;
    dialogs.forEach(item => { item.hidden = true; });
    dialog.hidden = false;
    activeDialog = dialog;
    openingSnapshot = snapshot(formFor(dialog));
    document.body.classList.add("entry-dialog-open");
    dialog.querySelector("input, select, button")?.focus();
  }

  function isDirty(dialog) {
    return snapshot(formFor(dialog)) !== openingSnapshot;
  }

  async function requestClose(dialog = activeDialog) {
    if (!dialog || dialog.hidden) return;
    if (isDirty(dialog) && !await yemConfirm({
      title: "Discard this entry?",
      message: "The information entered in this form has not been saved.",
      confirmLabel: "Discard entry",
      cancelLabel: "Continue editing",
      danger: true
    })) return;
    close(dialog);
  }

  function close(dialog = activeDialog) {
    if (!dialog) return;
    dialog.hidden = true;
    if (activeDialog === dialog) activeDialog = null;
    if (!dialogs.some(item => !item.hidden)) document.body.classList.remove("entry-dialog-open");
  }

  document.getElementById("open-entry-actions").addEventListener("click", () => open("entry-choice-dialog"));
  document.getElementById("choose-expense-entry").addEventListener("click", () => open("expense-entry-dialog"));
  document.getElementById("choose-income-entry").addEventListener("click", () => open("income-entry-dialog"));
  document.querySelectorAll("[data-close-entry-dialog]").forEach(button => button.addEventListener("click", () => requestClose(button.closest(".entry-dialog"))));
  dialogs.forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) requestClose(dialog); }));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && activeDialog) requestClose(activeDialog); });

  window.yemEntryDialogSubmitted = function (kind) {
    const dialog = document.getElementById(`${kind}-entry-dialog`);
    openingSnapshot = snapshot(formFor(dialog));
    close(dialog);
  };
})();
