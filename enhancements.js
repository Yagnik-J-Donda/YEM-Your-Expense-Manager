"use strict";

const yemCategoryMeta = (() => {
  try { return JSON.parse(localStorage.getItem("categoryMeta") || "{}"); }
  catch { return {}; }
})();

const yemCategoryProjections = (() => {
  try { return JSON.parse(localStorage.getItem("categoryProjections") || "{}"); }
  catch { return {}; }
})();

const yemCategoryBudgetModes = (() => {
  try { return JSON.parse(localStorage.getItem("categoryBudgetModes") || "{}"); }
  catch { return {}; }
})();

const yemCategoryVisibility = (() => {
  try { return JSON.parse(localStorage.getItem("categoryVisibility") || "{}"); }
  catch { return {}; }
})();

const yemCategoryBudgetSnapshots = (() => {
  try { return JSON.parse(localStorage.getItem("categoryBudgetSnapshots") || "{}"); }
  catch { return {}; }
})();

const yemVisibilityReviews = (() => {
  try { return JSON.parse(localStorage.getItem("categoryVisibilityReviews") || "{}"); }
  catch { return {}; }
})();

function yemMonthBounds(month, year) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function yemParseDateOnly(value, endOfDay = false) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
}

function yemRangeOverlapsMonth(startValue, endValue, month, year) {
  const bounds = yemMonthBounds(month, year);
  const start = yemParseDateOnly(startValue) || new Date(-8640000000000000);
  const end = yemParseDateOnly(endValue, true) || new Date(8640000000000000);
  return start <= bounds.end && end >= bounds.start;
}

function yemCategoryActive(category, month, year) {
  const meta = yemCategoryMeta[category] || {};
  if (meta.unlimited === true || (!meta.startDate && !meta.endDate)) return true;
  return yemRangeOverlapsMonth(meta.startDate, meta.endDate, month, year);
}

function yemIsCurrentMonth(month, year) {
  const now = new Date();
  return month === now.getMonth() && year === now.getFullYear();
}

function yemDateInRange(date, startValue, endValue) {
  const start = yemParseDateOnly(startValue) || new Date(-8640000000000000);
  const end = yemParseDateOnly(endValue, true) || new Date(8640000000000000);
  return date >= start && date <= end;
}

function yemBudgetInfo(category, month, year) {
  const mode = yemCategoryBudgetModes[category] === "projections" ? "projections" : "allowance";
  const bounds = yemMonthBounds(month, year);
  const currentMonth = yemIsCurrentMonth(month, year);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (mode === "allowance") {
    const meta = yemCategoryMeta[category] || {};
    const active = meta.unlimited === true || (!meta.startDate && !meta.endDate) ||
      (currentMonth ? yemDateInRange(today, meta.startDate, meta.endDate) : yemRangeOverlapsMonth(meta.startDate, meta.endDate, month, year));
    const grace = currentMonth && !active && meta.endDate && yemParseDateOnly(meta.endDate) >= bounds.start && yemParseDateOnly(meta.endDate) <= bounds.end;
    return { amount: active ? Number(categoryLimits[category]) || 0 : 0, relevant: active || grace, grace, mode, items: [] };
  }
  const allItems = Array.isArray(yemCategoryProjections[category]) ? yemCategoryProjections[category] : [];
  const activeItems = allItems.filter(item => currentMonth
    ? yemDateInRange(today, item.startDate, item.endDate)
    : yemRangeOverlapsMonth(item.startDate, item.endDate, month, year));
  const grace = currentMonth && !activeItems.length && allItems.some(item => {
    const end = yemParseDateOnly(item.endDate);
    return end && end >= bounds.start && end <= bounds.end;
  });
  return {
    amount: activeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    relevant: activeItems.length > 0 || grace,
    grace,
    mode,
    items: activeItems
  };
}

let yemVisibilityReviewRunning = false;

async function yemReviewDormantVisibility(month, year) {
  if (!yemIsCurrentMonth(month, year) || yemVisibilityReviewRunning) return;
  yemVisibilityReviewRunning = true;
  const monthStart = new Date(year, month, 1);
  let changed = false;
  const reviewKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  try {
    for (const category of Object.keys(categoryLimits)) {
      const info = yemBudgetInfo(category, month, year);
      if (yemCategoryVisibility[category] === "hidden" && info.amount > 0) {
        if (yemVisibilityReviews[category] === reviewKey) continue;
        const show = await yemConfirm({
          title: "Show active category?",
          message: `"${category}" has active budget plans again. Show it in the Remaining Budget table?`,
          confirmLabel: "Show category"
        });
        if (show) yemCategoryVisibility[category] = "visible";
        else yemVisibilityReviews[category] = reviewKey;
        changed = true;
        continue;
      }
      if (yemCategoryVisibility[category] && yemCategoryVisibility[category] !== "visible") continue;
      if (info.amount > 0 || info.grace) continue;
      const mode = yemCategoryBudgetModes[category] === "projections" ? "projections" : "allowance";
      const endDates = mode === "projections"
        ? (yemCategoryProjections[category] || []).map(item => yemParseDateOnly(item.endDate)).filter(Boolean)
        : [yemParseDateOnly((yemCategoryMeta[category] || {}).endDate)].filter(Boolean);
      if (!endDates.length || endDates.some(end => end >= monthStart)) continue;
      const hide = await yemConfirm({
        title: "Hide inactive category?",
        message: `"${category}" has no active budget plans. Hide it from current and future Remaining Budget tables?`,
        confirmLabel: "Hide category",
        cancelLabel: "Keep visible"
      });
      yemCategoryVisibility[category] = hide ? "hidden" : "keep";
      changed = true;
    }
    if (changed) {
      localStorage.setItem("categoryVisibility", JSON.stringify(yemCategoryVisibility));
      localStorage.setItem("categoryVisibilityReviews", JSON.stringify(yemVisibilityReviews));
      updateRemainingBudget();
    }
  } finally {
    yemVisibilityReviewRunning = false;
  }
}

function yemExpenseActive(expense, month, year) {
  if (expense.paymentPattern === "spread" && /^\d{4}-\d{2}$/.test(expense.allocationStartMonth || "")) {
    const [startYear, startMonth] = expense.allocationStartMonth.split("-").map(Number);
    const offset = (year - startYear) * 12 + month - (startMonth - 1);
    return offset >= 0 && offset < (Number(expense.allocationMonths) || 0);
  }
  if (expense.activeStart || expense.activeEnd) {
    return yemRangeOverlapsMonth(expense.activeStart, expense.activeEnd, month, year);
  }
  const date = new Date(expense.date);
  return !Number.isNaN(date.getTime()) && date.getMonth() === month && date.getFullYear() === year;
}

function yemAmountForMonth(expense, month, year) {
  const amount = Number(expense.amount) || 0;
  if (expense.paymentPattern !== "spread" || month === undefined || year === undefined) return amount;
  const [startYear, startMonth] = String(expense.allocationStartMonth || "").split("-").map(Number);
  const count = Number(expense.allocationMonths) || 0;
  const offset = (year - startYear) * 12 + month - (startMonth - 1);
  if (!Number.isInteger(startYear) || !Number.isInteger(startMonth) || !Number.isInteger(count) || count < 1 || offset < 0 || offset >= count) return 0;
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / count);
  const remainder = cents % count;
  return (base + (offset < remainder ? 1 : 0)) / 100;
}

function yemSignedAmount(expense, month, year) {
  const amount = yemAmountForMonth(expense, month, year);
  return expense.transactionType === "credit" ? -amount : amount;
}

function yemMoney(value) {
  const number = Number(value) || 0;
  return `${number < 0 ? "-​" : ""}$${Math.abs(number).toFixed(2)}`;
}

function yemSelectedMonthYear() {
  return {
    month: Number(document.getElementById("month-select").value),
    year: Number(document.getElementById("year-select").value)
  };
}

renderCategoryDropdown = function () {
  const select = document.getElementById("category");
  const selected = select.value;
  const expenseDate = new Date(document.getElementById("date").value || new Date());
  const month = expenseDate.getMonth();
  const year = expenseDate.getFullYear();
  select.replaceChildren(new Option("--Select Category--", ""));
  Object.keys(categoryLimits)
    .sort((a, b) => a.localeCompare(b))
    .forEach(category => select.add(new Option(category, category)));
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
};

function yemOpenFeatureModal(modal) {
  document.getElementById("feature-modal-overlay").hidden = false;
  modal.hidden = false;
  document.body.classList.add("no-scroll");
}

function yemCloseFeatureModals() {
  document.getElementById("feature-modal-overlay").hidden = true;
  document.querySelectorAll(".feature-modal").forEach(modal => { modal.hidden = true; });
  document.body.classList.remove("no-scroll");
}

function yemRenderExpenseCard(expense, options = {}) {
  const card = document.createElement("article");
  card.className = "feature-result-card";
  const heading = document.createElement("h3");
  heading.textContent = `${expense.transactionType === "credit" ? "Refund / Credit" : "Expense"}: ${yemMoney(yemSignedAmount(expense))}`;
  const meta = document.createElement("p");
  meta.textContent = `${expense.category || "Uncategorized"} · ${new Date(expense.date).toLocaleString()}`;
  const notes = document.createElement("p");
  notes.textContent = expense.details || "No notes";
  const duration = document.createElement("p");
  duration.className = "feature-duration";
  duration.textContent = expense.paymentPattern === "spread"
    ? `Paid once; allocated across ${expense.allocationMonths} months from ${expense.allocationStartMonth}`
    : expense.activeStart || expense.activeEnd
      ? `Active: ${expense.activeStart || "No start limit"} to ${expense.activeEnd || "No expiry"}`
      : "One-time entry";
  card.append(heading, meta, notes, duration);
  if (expense.paymentPattern === "spread" && options.month !== undefined && options.year !== undefined) {
    const allocation = document.createElement("p");
    allocation.className = "feature-allocation";
    allocation.textContent = `Contribution to this month’s budget: ${yemMoney(yemSignedAmount(expense, options.month, options.year))}`;
    card.appendChild(allocation);
  }
  if (options.editable) {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "✏️ Edit";
    edit.addEventListener("click", () => openEditExpenseModal(expense.category, expense.date, expense.amount));
    card.appendChild(edit);
  }
  return card;
}

function yemShowProjectionBreakdown(category) {
  const { month, year } = yemSelectedMonthYear();
  const modal = document.getElementById("projection-breakdown-modal");
  document.getElementById("projection-breakdown-title").textContent = `Projected Expenses: ${category}`;
  const content = document.getElementById("projection-breakdown-content");
  content.replaceChildren();
  const budgetInfo = yemBudgetInfo(category, month, year);
  let items = budgetInfo.items;
  if (budgetInfo.mode === "allowance") {
    items = [{
      name: `${category} monthly allowance`,
      amount: budgetInfo.amount,
      date: "",
      createdAt: "",
      notes: "Overall variable or fixed monthly allowance",
      startDate: (yemCategoryMeta[category] || {}).startDate || "",
      endDate: (yemCategoryMeta[category] || {}).endDate || "",
      scheduleVariable: true
    }];
  }
  if (!items.length) {
    const empty = document.createElement("p");
    empty.textContent = budgetInfo.grace
      ? "All projections have ended. This category remains visible at $0 until the month ends."
      : "No projected expenses are active for this month.";
    content.appendChild(empty);
  }
  let total = 0;
  items.forEach(item => {
    total += Number(item.amount) || 0;
    const card = document.createElement("article");
    card.className = "feature-result-card";
    const heading = document.createElement("h3");
    heading.textContent = item.name || "Projected expense";
    const amount = document.createElement("p");
    amount.textContent = `Amount: ${yemMoney(item.amount)}`;
    const created = document.createElement("p");
    const createdValue = item.createdAt || item.date;
    const createdDate = createdValue ? new Date(`${String(createdValue).slice(0, 10)}T12:00:00`) : null;
    created.textContent = `Created: ${createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.toLocaleDateString() : "Not recorded (legacy category)"}`;
    const occurrence = document.createElement("p");
    const recurrenceSource = item.scheduleDate || item.date || item.startDate || item.createdAt;
    const hasVariableSchedule = item.scheduleVariable !== undefined
      ? item.scheduleVariable
      : String(categoryKinds[category]).toLowerCase() === "variable";
    if (!hasVariableSchedule) {
      const sourceDate = recurrenceSource ? new Date(`${String(recurrenceSource).slice(0, 10)}T00:00:00`) : null;
      const recurrenceDay = item.scheduleDay || (sourceDate && !Number.isNaN(sourceDate.getTime()) ? sourceDate.getDate() : 1);
      const now = new Date();
      let nextYear = now.getFullYear();
      let nextMonth = now.getMonth();
      const activeStart = yemParseDateOnly(item.startDate || (yemCategoryMeta[category] || {}).startDate);
      const activeEnd = yemParseDateOnly(item.endDate || (yemCategoryMeta[category] || {}).endDate, true);
      if (activeStart && activeStart > now) {
        nextYear = activeStart.getFullYear();
        nextMonth = activeStart.getMonth();
      }
      const resolveDay = (targetYear, targetMonth) => {
        const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
        return recurrenceDay === "last" ? lastDay : Math.min(Number(recurrenceDay) || 1, lastDay);
      };
      const dayInMonth = resolveDay(nextYear, nextMonth);
      let nextDate = new Date(nextYear, nextMonth, dayInMonth);
      const earliestDate = activeStart && activeStart > now ? activeStart : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (nextDate < earliestDate) {
        nextMonth += 1;
        if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
        nextDate = new Date(nextYear, nextMonth, resolveDay(nextYear, nextMonth));
      }
      occurrence.textContent = activeEnd && nextDate > activeEnd
        ? "Next monthly occurrence: None (category has expired)"
        : `Next monthly occurrence: ${nextDate.toLocaleDateString()}${recurrenceDay === "last" ? " (last day of the month)" : ""}`;
    } else {
      occurrence.textContent = "Scheduled day: Variable";
    }
    const notes = document.createElement("p");
    notes.textContent = `Notes: ${item.notes || "None"}`;
    card.append(heading, amount, created, occurrence, notes);
    content.appendChild(card);
  });
  const totalLine = document.createElement("strong");
  totalLine.className = "feature-total-line";
  totalLine.textContent = `Projected total: ${yemMoney(total)}`;
  content.prepend(totalLine);
  yemOpenFeatureModal(modal);
}

updateRemainingBudget = function () {
  const { month, year } = yemSelectedMonthYear();
  yemReviewDormantVisibility(month, year);
  const kindFilter = document.getElementById("budget-kind-filter").value;
  const budgetByCategory = Object.fromEntries(Object.keys(categoryLimits).map(category => [category, yemBudgetInfo(category, month, year)]));
  const historical = new Date(year, month + 1, 0) < new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const snapshotKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  if (historical && yemCategoryBudgetSnapshots[snapshotKey]) {
    Object.entries(yemCategoryBudgetSnapshots[snapshotKey]).forEach(([category, amount]) => {
      if (budgetByCategory[category]) budgetByCategory[category] = { ...budgetByCategory[category], amount: Number(amount) || 0, relevant: true };
    });
  }
  const activeCategories = Object.keys(categoryLimits).filter(category => {
    const info = budgetByCategory[category];
    const visible = historical ? info.relevant : yemCategoryVisibility[category] !== "hidden" && (info.relevant || yemCategoryVisibility[category] === "keep");
    return visible && (kindFilter === "All" || (categoryKinds[category] || "Variable") === kindFilter);
  });
  const activeExpenses = expenses.filter(expense => activeCategories.includes(expense.category) && yemExpenseActive(expense, month, year));
  const spent = {};
  activeExpenses.forEach(expense => {
    spent[expense.category] = (spent[expense.category] || 0) + yemSignedAmount(expense, month, year);
  });

  const totalLimit = activeCategories.reduce((sum, category) => sum + budgetByCategory[category].amount, 0);
  const pairs = sortEntriesByMode(activeCategories.map(category => [category, budgetByCategory[category].amount]));
  const body = document.getElementById("budget-body");
  body.replaceChildren();
  pairs.forEach(([category, limit]) => {
    const used = spent[category] || 0;
    const remaining = limit - used;
    const percent = limit > 0 ? (used / limit * 100).toFixed(1) : "0.0";
    const allocation = totalLimit > 0 ? (limit / totalLimit * 100).toFixed(1) : "0.0";
    const usedTotal = totalLimit > 0 ? (used / totalLimit * 100).toFixed(1) : "0.0";
    const row = document.createElement("tr");
    row.dataset.category = category;

    const categoryCell = document.createElement("td");
    const categoryButton = document.createElement("button");
    categoryButton.className = "table-link-button";
    categoryButton.textContent = category;
    categoryButton.title = "Open Manage Categories";
    categoryButton.addEventListener("click", () => { window.location.href = "categories.html"; });
    categoryCell.appendChild(categoryButton);

    const spentCell = document.createElement("td");
    const spentButton = document.createElement("button");
    spentButton.className = "table-link-button debit-link";
    spentButton.textContent = yemMoney(used);
    spentButton.addEventListener("click", () => viewCategoryExpenses(category));
    spentCell.appendChild(spentButton);

    const remainingCell = document.createElement("td");
    remainingCell.className = "budget-remaining-value";
    remainingCell.textContent = yemMoney(remaining);
    const projectedCell = document.createElement("td");
    const projectedButton = document.createElement("button");
    projectedButton.className = "table-link-button projection-link";
    projectedButton.textContent = yemMoney(limit);
    projectedButton.setAttribute("aria-label", `View projected expense breakdown for ${category}`);
    projectedButton.addEventListener("click", () => yemShowProjectionBreakdown(category));
    projectedCell.appendChild(projectedButton);

    [categoryCell, spentCell, remainingCell, projectedCell, `${percent}%`, `${usedTotal}% / ${allocation}%`]
      .forEach(value => {
        if (value instanceof HTMLElement) row.appendChild(value);
        else { const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell); }
      });
    body.appendChild(row);
  });

  const totalUsed = activeCategories.reduce((sum, category) => sum + (spent[category] || 0), 0);
  const remaining = totalLimit - totalUsed;
  const percent = totalLimit > 0 ? (totalUsed / totalLimit * 100).toFixed(1) : "0.0";
  const selectedKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  let incomeEntries = [];
  try { incomeEntries = JSON.parse(localStorage.getItem("incomeEntries") || "[]"); }
  catch { incomeEntries = []; }
  const incomeReceived = incomeEntries
    .filter(item => String(item.date || "").slice(0, 7) === selectedKey)
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const expensesRecorded = expenses
    .filter(expense => yemExpenseActive(expense, month, year))
    .reduce((sum, expense) => sum + yemSignedAmount(expense, month, year), 0);
  const netProfit = incomeReceived - expensesRecorded;
  document.getElementById("total-summary").innerHTML = `
    <div class="total-summary-grid">
      <div class="summary-financial-row">
        <div class="summary-metric income-metric"><span>💰 Income Received</span><strong>${yemMoney(incomeReceived)}</strong></div>
        <div class="summary-metric expense-metric"><span>💸 Expenses Recorded</span><strong>${yemMoney(expensesRecorded)}</strong></div>
        <div class="summary-metric net-metric ${netProfit >= 0 ? "profit" : "loss"}"><span>${netProfit >= 0 ? "✨ Net Profit" : "⚠️ Net Shortfall"}</span><strong>${yemMoney(netProfit)}</strong></div>
      </div>
      <div class="summary-budget-row">
        <div class="summary-metric"><span>💼 Total Remaining</span><strong>${yemMoney(remaining)}</strong></div>
        <div class="summary-metric"><span>📈 Projected Expenses</span><strong>${yemMoney(totalLimit)}</strong></div>
        <div class="summary-metric"><span>📊 Budget Used</span><strong>${percent}%</strong></div>
      </div>
    </div>`;
  enableRowDragAndDrop("budget-body");
};

viewCategoryExpenses = function (category) {
  const { month, year } = yemSelectedMonthYear();
  const filtered = expenses.filter(expense => expense.category === category && yemExpenseActive(expense, month, year));
  document.getElementById("expense-modal-title").textContent = `Expenses for "${category}"`;
  const list = document.getElementById("expense-list");
  list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.textContent = "No expenses found for this category and month.";
    list.appendChild(empty);
  } else {
    filtered.forEach(expense => list.appendChild(yemRenderExpenseCard(expense, { editable: true, month, year })));
  }
  document.getElementById("modal-overlay").style.display = "block";
  document.getElementById("category-expense-modal").style.display = "block";
  document.body.classList.add("no-scroll");
};

function yemRunSearch() {
  const query = document.getElementById("entry-search-input").value.trim().toLowerCase();
  const results = document.getElementById("entry-search-results");
  results.replaceChildren();
  if (!query) {
    const prompt = document.createElement("p");
    prompt.textContent = "Enter something to search for.";
    results.appendChild(prompt);
    return;
  }
  const searchableValues = expense => [
    expense.category,
    expense.details,
    expense.amount,
    expense.date,
    expense.transactionType || "debit",
    expense.paymentMethod || "legacy-payment-method",
    expense.paymentPattern || "regular",
    expense.allocationStartMonth,
    expense.allocationMonths,
    categoryKinds[expense.category] || "Variable"
  ].map(value => String(value || "").toLowerCase());
  const matches = expenses.filter(expense => searchableValues(expense).some(value => value.includes(query)));
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.textContent = "No entries matched your search.";
    results.appendChild(empty);
    return;
  }
  matches.sort((a, b) => {
    const rank = expense => searchableValues(expense).some(value => value.split(/\s+/).some(word => word.startsWith(query))) ? 0 : 1;
    const rankDifference = rank(a) - rank(b);
    if (rankDifference) return rankDifference;
    const aText = `${a.category || ""} ${a.details || ""}`;
    const bText = `${b.category || ""} ${b.details || ""}`;
    const alphabetical = aText.localeCompare(bText, undefined, { sensitivity: "base" });
    return alphabetical || new Date(b.date) - new Date(a.date);
  }).forEach(expense => results.appendChild(yemRenderExpenseCard(expense)));
}

renderDateHistory = function (dateString) {
  const view = document.getElementById("history-view");
  view.replaceChildren();
  const records = expenses
    .filter(expense => new Date(expense.date).toLocaleDateString("en-CA") === dateString)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!records.length) {
    const empty = document.createElement("p");
    empty.textContent = dateString ? `No entries for ${dateString}.` : "No history available.";
    view.appendChild(empty);
    return;
  }
  const heading = document.createElement("h3");
  heading.textContent = `Entries for ${dateString}`;
  const wrapper = document.createElement("div");
  wrapper.className = "table-wrapper";
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Time", "Category", "Type", "Paid With", "Amount", "Details", "Budget Treatment"].forEach(label => {
    const cell = document.createElement("th");
    cell.textContent = label;
    headRow.appendChild(cell);
  });
  head.appendChild(headRow);
  const body = document.createElement("tbody");
  records.forEach(expense => {
    const row = document.createElement("tr");
    const values = [
      new Date(expense.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      expense.category,
      expense.transactionType === "credit" ? "Refund / Credit" : "Expense",
      expense.paymentMethod === "credit-card" ? "Credit Card" : expense.paymentMethod === "debit-card" ? "Debit Card" : "Legacy entry",
      yemMoney(yemSignedAmount(expense)),
      expense.details || "-",
      expense.paymentPattern === "spread"
        ? `Paid once; ${expense.allocationMonths}-month allocation from ${expense.allocationStartMonth}`
        : expense.activeStart || expense.activeEnd ? `${expense.activeStart || "…"} to ${expense.activeEnd || "…"}` : "One-time"
    ];
    values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  table.append(head, body);
  wrapper.appendChild(table);
  view.append(heading, wrapper);
};

document.getElementById("open-entry-search").addEventListener("click", () => {
  yemOpenFeatureModal(document.getElementById("entry-search-modal"));
  document.getElementById("entry-search-input").focus();
});
document.getElementById("run-entry-search").addEventListener("click", yemRunSearch);
document.getElementById("entry-search-input").addEventListener("keydown", event => {
  if (event.key === "Enter") yemRunSearch();
});
document.getElementById("entry-search-input").addEventListener("input", yemRunSearch);
document.querySelectorAll("[data-close-feature-modal]").forEach(button => button.addEventListener("click", yemCloseFeatureModals));
document.getElementById("feature-modal-overlay").addEventListener("click", yemCloseFeatureModals);
document.getElementById("budget-kind-filter").addEventListener("change", updateRemainingBudget);
document.getElementById("date").addEventListener("change", renderCategoryDropdown);
document.addEventListener("keydown", event => { if (event.key === "Escape") yemCloseFeatureModals(); });

const yemOriginalExportData = exportData;
exportData = async function () {
  const payload = {
    expenses,
    categoryLimits,
    categoryKinds,
    categoryMeta: yemCategoryMeta,
    categoryProjections: yemCategoryProjections,
    categoryBudgetModes: yemCategoryBudgetModes,
    categoryVisibility: yemCategoryVisibility,
    categoryBudgetSnapshots: yemCategoryBudgetSnapshots,
    categoryVisibilityReviews: yemVisibilityReviews,
    itemCategoryMappings: (() => {
      try { return JSON.parse(localStorage.getItem("itemCategoryMappings") || "{}"); }
      catch { return {}; }
    })(),
    deletedCategories,
    deletedEntries,
    scheduledPayments: (() => {
      try { return JSON.parse(localStorage.getItem("scheduledPayments") || "[]"); }
      catch { return []; }
    })(),
    scheduledOccurrences: (() => {
      try { return JSON.parse(localStorage.getItem("scheduledOccurrences") || "{}"); }
      catch { return {}; }
    })(),
    scheduledNotifications: (() => {
      try { return JSON.parse(localStorage.getItem("scheduledNotifications") || "[]"); }
      catch { return []; }
    })(),
    dismissedScheduledNotifications: (() => {
      try { return JSON.parse(localStorage.getItem("dismissedScheduledNotifications") || "[]"); }
      catch { return []; }
    })(),
    incomeEntries: (() => {
      try { return JSON.parse(localStorage.getItem("incomeEntries") || "[]"); }
      catch { return []; }
    })()
  };
  const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  const suggestedName = `Expense Backup - ${stamp}.json`;
  const requestedName = await yemPrompt({
    title: "Name your backup",
    message: "Choose the file name for this YEM backup.",
    inputLabel: "Backup file name",
    defaultValue: suggestedName,
    confirmLabel: "Download backup"
  });
  if (requestedName === null) return;
  const trimmedName = requestedName.trim();
  if (!trimmedName) {
    yemToast("Please enter a file name.");
    return;
  }
  const filename = trimmedName.toLowerCase().endsWith(".json") ? trimmedName : `${trimmedName}.json`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

renderCategoryDropdown();
updateRemainingBudget();
updateHistory();
