"use strict";

(function () {
  const readArray = key => {
    try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  const readObject = key => {
    try { const value = JSON.parse(localStorage.getItem(key) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
    catch { return {}; }
  };
  const dateKey = date => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const parseDate = value => {
    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const addDays = (value, days) => { const result = new Date(value); result.setDate(result.getDate() + days); return result; };
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  let plans = readArray("scheduledPayments");
  let occurrences = readObject("scheduledOccurrences");
  let notifications = readArray("scheduledNotifications");
  let dismissed = new Set(readArray("dismissedScheduledNotifications"));
  let approvalNotificationId = null;

  function save() {
    localStorage.setItem("scheduledPayments", JSON.stringify(plans));
    localStorage.setItem("scheduledOccurrences", JSON.stringify(occurrences));
    localStorage.setItem("scheduledNotifications", JSON.stringify(notifications));
    localStorage.setItem("dismissedScheduledNotifications", JSON.stringify([...dismissed]));
  }

  function dueDateFor(plan, year, month) {
    const finalDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(Number(plan.scheduledDay) || 1, finalDay));
  }

  function occurrenceId(plan, dueDate) { return `${plan.id}|${dateKey(dueDate)}`; }

  function planActiveOn(plan, dueDate) {
    const due = dateKey(dueDate);
    return (!plan.activeStart || due >= plan.activeStart) && (!plan.activeEnd || due <= plan.activeEnd);
  }

  function reminderLabel(kind) {
    return kind === "before" ? "Due tomorrow" : kind === "due" ? "Due today" : "Was due yesterday";
  }

  function generateNotifications() {
    const today = parseDate(dateKey(new Date()));
    plans.filter(plan => plan.status !== "stopped").forEach(plan => {
      for (let offset = -1; offset <= 1; offset += 1) {
        const cursor = new Date(today.getFullYear(), today.getMonth() + offset, 1);
        const dueDate = dueDateFor(plan, cursor.getFullYear(), cursor.getMonth());
        if (!planActiveOn(plan, dueDate)) continue;
        const occId = occurrenceId(plan, dueDate);
        const state = occurrences[occId];
        if (state && ["posted", "skipped"].includes(state.status)) continue;
        [
          { kind: "before", day: addDays(dueDate, -1) },
          { kind: "due", day: dueDate },
          { kind: "after", day: addDays(dueDate, 1) }
        ].forEach(reminder => {
          if (reminder.day > today) return;
          const id = `${occId}|${reminder.kind}`;
          if (dismissed.has(id) || notifications.some(item => item.id === id)) return;
          notifications.push({ id, occurrenceId: occId, planId: plan.id, dueDate: dateKey(dueDate), kind: reminder.kind, createdAt: new Date().toISOString() });
        });
      }
    });
    save();
  }

  function related(notification) {
    const plan = plans.find(item => item.id === notification.planId);
    return { plan, occurrence: occurrences[notification.occurrenceId] || null };
  }

  function removeOccurrenceNotifications(occurrenceId) {
    notifications = notifications.filter(item => item.occurrenceId !== occurrenceId);
  }

  function refreshBadge() {
    const badge = document.getElementById("notification-count");
    const button = document.getElementById("notification-center-button");
    badge.textContent = String(notifications.length);
    badge.hidden = notifications.length === 0;
    button.classList.toggle("has-notifications", notifications.length > 0);
    button.setAttribute("aria-label", notifications.length ? `Open notification center, ${notifications.length} pending` : "Open notification center");
  }

  function renderNotifications() {
    const list = document.getElementById("notification-center-list");
    list.replaceChildren();
    if (!notifications.length) {
      const empty = document.createElement("div");
      empty.className = "notification-empty";
      empty.textContent = "✓ You have no pending scheduled-expense notifications.";
      list.appendChild(empty);
      refreshBadge();
      return;
    }
    notifications.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).forEach(notification => {
      const { plan } = related(notification);
      if (!plan) return;
      const card = document.createElement("article");
      card.className = "notification-card";
      card.innerHTML = `<h3>${reminderLabel(notification.kind)}: ${escapeHtml(plan.details || plan.category)}</h3>
        <p><strong>${escapeHtml(plan.category)}</strong> · Expected $${Number(plan.expectedAmount).toFixed(2)}</p>
        <p>Expected due date: ${parseDate(notification.dueDate).toLocaleDateString()}</p>`;
      const actions = document.createElement("div");
      actions.className = "notification-actions";
      actions.append(
        actionButton("Approve", () => openApproval(notification.id)),
        actionButton("Skip this payment", () => skipOccurrence(notification.id), "danger-notification-action"),
        actionButton("Dismiss this reminder", () => dismissNotification(notification.id), "secondary-notification-action")
      );
      card.appendChild(actions);
      list.appendChild(card);
    });
    refreshBadge();
  }

  function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = String(value || "");
    return element.innerHTML;
  }

  function actionButton(text, handler, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = className;
    button.addEventListener("click", handler);
    return button;
  }

  function openApproval(notificationId) {
    const notification = notifications.find(item => item.id === notificationId);
    if (!notification) return;
    const { plan } = related(notification);
    approvalNotificationId = notificationId;
    document.getElementById("approval-occurrence-id").value = notification.occurrenceId;
    document.getElementById("approval-actual-date").value = dateKey(new Date());
    document.getElementById("approval-actual-amount").value = Number(plan.expectedAmount).toFixed(2);
    document.getElementById("approval-payment-method").value = plan.paymentMethod || "debit-card";
    document.getElementById("approval-statement-description").value = "";
    document.getElementById("approval-notes").value = "";
    document.getElementById("scheduled-approval-summary").textContent = `${plan.details || plan.category}: expected $${Number(plan.expectedAmount).toFixed(2)} on ${parseDate(notification.dueDate).toLocaleDateString()}. The expected details are copied automatically.`;
    yemCloseFeatureModals();
    yemOpenFeatureModal(document.getElementById("scheduled-approval-modal"));
  }

  async function skipOccurrence(notificationId) {
    const notification = notifications.find(item => item.id === notificationId);
    if (!notification || !await yemConfirm({
      title: "Skip this occurrence?",
      message: "No expense will be posted for this occurrence. Future monthly occurrences will remain scheduled.",
      confirmLabel: "Skip occurrence",
      danger: true
    })) return;
    occurrences[notification.occurrenceId] = { status: "skipped", dueDate: notification.dueDate, decidedAt: new Date().toISOString() };
    removeOccurrenceNotifications(notification.occurrenceId);
    save(); renderNotifications();
  }

  function dismissNotification(notificationId) {
    dismissed.add(notificationId);
    notifications = notifications.filter(item => item.id !== notificationId);
    save(); renderNotifications();
  }

  window.yemCreateScheduledPayment = function (data) {
    const selected = new Date(data.date);
    const start = data.activeStart || dateKey(selected);
    const plan = {
      id: uid("schedule"),
      category: data.category,
      expectedAmount: Number(data.amount),
      details: data.details,
      transactionType: data.transactionType || "debit",
      paymentMethod: data.paymentMethod || "debit-card",
      scheduledDay: selected.getDate(),
      activeStart: start,
      activeEnd: data.activeEnd || "",
      createdAt: new Date().toISOString(),
      status: "active"
    };
    plans.push(plan);
    save();
    generateNotifications();
    renderNotifications();
    yemToast(`Scheduled expense saved for day ${plan.scheduledDay} of each month. It will not count as spent until you approve an occurrence.`);
  };

  document.getElementById("notification-center-button").addEventListener("click", () => {
    generateNotifications(); renderNotifications();
    yemOpenFeatureModal(document.getElementById("notification-center-modal"));
  });

  document.getElementById("scheduled-approval-form").addEventListener("submit", event => {
    event.preventDefault();
    const notification = notifications.find(item => item.id === approvalNotificationId);
    if (!notification) return;
    const { plan } = related(notification);
    const actualDate = document.getElementById("approval-actual-date").value;
    const actualAmount = Number(document.getElementById("approval-actual-amount").value);
    const paymentMethod = document.getElementById("approval-payment-method").value;
    if (!actualDate || !Number.isFinite(actualAmount) || actualAmount <= 0) return yemToast("Enter a valid deduction date and amount.");
    if (expenses.some(item => item.scheduledOccurrenceId === notification.occurrenceId)) {
      removeOccurrenceNotifications(notification.occurrenceId); save();
      return yemToast("This scheduled occurrence has already been posted.");
    }
    const statement = document.getElementById("approval-statement-description").value.trim();
    const notes = document.getElementById("approval-notes").value.trim();
    const postedDate = new Date(`${actualDate}T12:00:00`);
    const cardLabel = paymentMethod === "credit-card" ? "Credit Card" : "Debit Card";
    const baseDetails = String(plan.details || "").replace(/\s*[—-]\s*(?:Credit|Debit) Card\s*$/i, "").trim();
    const details = [baseDetails, statement && `Statement: ${statement}`, notes, cardLabel].filter(Boolean).join(" — ");
    expenses.push({
      date: postedDate.toISOString(), category: plan.category, amount: actualAmount,
      details, transactionType: plan.transactionType, paymentMethod, paymentPattern: "regular", activeStart: "", activeEnd: "",
      expectedDueDate: notification.dueDate, actualDeductionDate: actualDate,
      expectedAmount: Number(plan.expectedAmount), statementDescription: statement,
      scheduledPaymentId: plan.id, scheduledOccurrenceId: notification.occurrenceId, status: "posted"
    });
    occurrences[notification.occurrenceId] = {
      status: "posted", dueDate: notification.dueDate, actualDeductionDate: actualDate,
      expectedAmount: Number(plan.expectedAmount), actualAmount, postedAt: new Date().toISOString()
    };
    removeOccurrenceNotifications(notification.occurrenceId);
    save(); saveExpenses();
    yemCloseFeatureModals();
    yemToast("Expense approved and posted using the actual deduction date.");
    location.reload();
  });

  document.getElementById("approval-not-deducted").addEventListener("click", () => {
    if (approvalNotificationId) dismissNotification(approvalNotificationId);
    yemCloseFeatureModals();
  });

  generateNotifications();
  refreshBadge();
})();
