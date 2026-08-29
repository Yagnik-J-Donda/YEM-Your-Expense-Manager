// ==== Category Limits ====
let expenses = JSON.parse(localStorage.getItem("expenses") || "[]");
let categoryLimits = JSON.parse(localStorage.getItem("categoryLimits") || "{}");
let categoryKinds = JSON.parse(localStorage.getItem("categoryKinds") || "{}");

let deletedCategories = JSON.parse(localStorage.getItem("deletedCategories") || "[]");
let currentCategory = null;
let deletedEntries = JSON.parse(localStorage.getItem("deletedEntries")) || [];
const HISTORY_VIEW_MODE_KEY = "historyViewMode";
let historyViewMode = localStorage.getItem(HISTORY_VIEW_MODE_KEY) === "timeline" ? "timeline" : "daily";

const yemResetNotice = sessionStorage.getItem("yemResetNotice");
if (yemResetNotice) {
  sessionStorage.removeItem("yemResetNotice");
  yemToast(yemResetNotice, { type: "success" });
}




document.getElementById("month-select").addEventListener("change", updateRemainingBudget);
document.getElementById("year-select").addEventListener("change", updateRemainingBudget);

function getMonthKeyFromDate(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.toLocaleString("en-US", { month: "long" }); // Use fixed locale
  return `${month} ${year}`;
}

function renderCategoryDropdown() {
  const select = document.getElementById("category");
  select.innerHTML = '<option value="">--Select Category--</option>';

  Object.keys(categoryLimits).forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
}
// renderCategoryDropdown();


// ==== State Variables ====
// checkAndHandleMonthChange();
let undoStack = [];
let lastOpenedMonthKey = null;
let sortDescending = true;
let categoryBeingEdited = null; // 🔄 Tracks which category is being edited

// ==== Initialize Current Date ====
function setCurrentDateTime() {
  const now = new Date();
  const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
  document.getElementById("date").value = localISO;
}
setCurrentDateTime();

// Modified: Populate Year dropdown and auto-select current year
function populateYearDropdown() {
  const currentYear = new Date().getFullYear();
  const yearSelect = document.getElementById("year-select");
  yearSelect.innerHTML = ""; // Clear old options (if any)

  for (let y = currentYear - 2; y <= currentYear + 3; y++) {
    const option = document.createElement("option");
    option.value = y;
    option.textContent = y;
    if (y === currentYear) option.selected = true; // ✅ Select current year by default
    yearSelect.appendChild(option);
  }
}

// 🔧 Added: Auto-select current month on load
document.getElementById("month-select").value = new Date().getMonth();

populateYearDropdown();

// 🔧 Added: Update both budget and history views when month/year changes
document.getElementById("month-select").addEventListener("change", () => {
  updateRemainingBudget();
  refreshHistoryView();
});

document.getElementById("year-select").addEventListener("change", () => {
  updateRemainingBudget();
  refreshHistoryView();
});

document.querySelectorAll("[data-history-mode]").forEach(button => {
  button.addEventListener("click", () => setHistoryViewMode(button.dataset.historyMode));
});

// 🔧 Added: Show selected date's entries when changed (IT IS A LISTENER)
document.getElementById("history-date-select").addEventListener("change", (e) => {
  const selectedDate = e.target.value;
  if (!selectedDate) return;

  // ✅ Save the selected date to localStorage
  localStorage.setItem("selectedHistoryDate", selectedDate);

  // ✅ Show that date's history
  renderDateHistory(selectedDate);

  // ⏳ Wait for history DOM to update before measuring
  setTimeout(() => {
    const historySection = document.getElementById("history-view");
    const rect = historySection.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;

    if (rect.bottom > windowHeight) {
      historySection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, 150);
});

// ==== Save and Reload ====
function saveExpenses() {
  localStorage.setItem("expenses", JSON.stringify(expenses));
  localStorage.setItem("categoryLimits", JSON.stringify(categoryLimits));
  localStorage.setItem("categoryKinds", JSON.stringify(categoryKinds));
  localStorage.setItem("deletedCategories", JSON.stringify(deletedCategories));
  localStorage.setItem("deletedEntries", JSON.stringify(deletedEntries));
  updateRemainingBudget();
  refreshHistoryView();
}

// ==== Form Submission ====
function detailsWithCardType(details, paymentMethod) {
  const paymentLabel = paymentMethod === "credit-card"
    ? "Credit Card"
    : paymentMethod === "cash" ? "Cash" : "Debit Card";
  const cleaned = String(details || "")
    .trim()
    .replace(/\s*[—-]\s*(?:(?:Credit|Debit) Card|Cash)\s*$/i, "")
    .trim();
  return cleaned ? `${cleaned} — ${paymentLabel}` : paymentLabel;
}

function monthValueFromDate(value) {
  const date = new Date(value || new Date());
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function allocationEndMonth(startMonth, monthCount) {
  if (!/^\d{4}-\d{2}$/.test(startMonth) || !Number.isInteger(monthCount) || monthCount < 1) return "";
  const [year, month] = startMonth.split("-").map(Number);
  const end = new Date(year, month - 1 + monthCount - 1, 1);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
}

function allocationMonthlyRange(amount, monthCount) {
  if (!Number.isFinite(amount) || !Number.isInteger(monthCount) || monthCount < 1) return "";
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / monthCount);
  const remainder = cents % monthCount;
  if (!remainder) return `$${(base / 100).toFixed(2)} per month`;
  return `$${(base / 100).toFixed(2)}–$${((base + 1) / 100).toFixed(2)} per month`;
}

function syncPaymentPattern() {
  const pattern = document.getElementById("payment-pattern").value;
  const spread = pattern === "spread";
  document.getElementById("spread-payment-fields").hidden = !spread;
  document.getElementById("regular-schedule-fields").hidden = spread;
  document.getElementById("allocation-start-month").required = spread;
  document.getElementById("allocation-months").required = spread;
  document.getElementById("expense-duration-help").hidden = spread;
  updateAllocationPreview();
}

function updateAllocationPreview() {
  const amount = Number(document.getElementById("amount").value);
  const start = document.getElementById("allocation-start-month").value;
  const months = Number(document.getElementById("allocation-months").value);
  const end = allocationEndMonth(start, months);
  document.getElementById("allocation-preview").textContent = amount > 0 && end
    ? `Budget allocation: ${allocationMonthlyRange(amount, months)} from ${start} through ${end}. Actual transaction: $${amount.toFixed(2)} once.`
    : "Enter the amount, coverage start and number of months to preview the allocation.";
}

document.getElementById("payment-pattern").addEventListener("change", syncPaymentPattern);
document.getElementById("amount").addEventListener("input", updateAllocationPreview);
document.getElementById("allocation-start-month").addEventListener("input", updateAllocationPreview);
document.getElementById("allocation-months").addEventListener("input", updateAllocationPreview);
document.getElementById("date").addEventListener("change", () => {
  if (!document.getElementById("allocation-start-month").value) {
    document.getElementById("allocation-start-month").value = monthValueFromDate(document.getElementById("date").value);
  }
  updateAllocationPreview();
});
document.getElementById("allocation-start-month").value = monthValueFromDate(document.getElementById("date").value);
syncPaymentPattern();

document.getElementById("expense-form").addEventListener("submit", (e) => {
  e.preventDefault();

  const date = document.getElementById("date").value;
  const category = document.getElementById("category").value;
  const amount = parseFloat(document.getElementById("amount").value);
  const transactionType = document.getElementById("transaction-type").value;
  const paymentMethod = document.getElementById("payment-method").value;
  const details = detailsWithCardType(document.getElementById("details").value, paymentMethod);
  const paymentPattern = document.getElementById("payment-pattern").value;
  const activeStart = document.getElementById("expense-start-date").value;
  const activeEnd = document.getElementById("expense-end-date").value;

  // ❌ Prevent submission if date/category/amount missing or amount is 0 or negative
  if (!date || !category || isNaN(amount) || amount <= 0) {
    yemToast("Please enter a valid amount greater than 0.");
    return;
  }

  if (paymentPattern !== "spread" && activeStart && activeEnd && activeStart > activeEnd) {
    yemToast("The expense expiry date cannot be before its start date.");
    return;
  }

  const scheduleExpense = paymentPattern === "scheduled";
  if (scheduleExpense) {
    if (typeof window.yemCreateScheduledPayment !== "function") {
      yemToast("The scheduled-payment feature could not be loaded. Please refresh and try again.");
      return;
    }
    window.yemCreateScheduledPayment({
      date,
      category,
      amount,
      details,
      transactionType,
      paymentMethod,
      activeStart,
      activeEnd
    });
    e.target.reset();
    setCurrentDateTime();
    document.getElementById("allocation-start-month").value = monthValueFromDate(document.getElementById("date").value);
    syncPaymentPattern();
    document.activeElement.blur();
    if (typeof window.yemEntryDialogSubmitted === "function") window.yemEntryDialogSubmitted("expense");
    return;
  }

  let allocationStartMonth = "";
  let allocationMonths = 0;
  if (paymentPattern === "spread") {
    allocationStartMonth = document.getElementById("allocation-start-month").value;
    allocationMonths = Number(document.getElementById("allocation-months").value);
    if (!/^\d{4}-\d{2}$/.test(allocationStartMonth) || !Number.isInteger(allocationMonths) || allocationMonths < 2 || allocationMonths > 120) {
      yemToast("Please enter a valid coverage start and a duration between 2 and 120 months.");
      return;
    }
  }

  expenses.push({
    date,
    category,
    amount,
    details,
    transactionType,
    paymentMethod,
    paymentPattern,
    activeStart: paymentPattern === "spread" ? "" : activeStart,
    activeEnd: paymentPattern === "spread" ? "" : activeEnd,
    allocationStartMonth,
    allocationMonths
  });
  saveExpenses();

  e.target.reset();
  document.getElementById("details").value = ""; // ✅ Clear details explicitly (optional)
  setCurrentDateTime(); // ✅ Refill current time after reset
  document.getElementById("allocation-start-month").value = monthValueFromDate(document.getElementById("date").value);
  syncPaymentPattern();
  document.activeElement.blur();
  
  // ✅ Refresh the page
  location.reload();
});



// 🔧 Updated: Show all dates in history selector (not filtered by month/year)
function updateHistory() {
  const dateSelect = document.getElementById("history-date-select");
  const historyView = document.getElementById("history-view");

  dateSelect.innerHTML = "";
  historyView.innerHTML = "";

  const allDates = expenses
    .map(e => new Date(e.date).toLocaleDateString('en-CA'));

  const uniqueDates = [...new Set(allDates)].sort((a, b) => new Date(b) - new Date(a));

  if (uniqueDates.length === 0) {
    dateSelect.innerHTML = `<option value="">No entries found</option>`;
    historyView.innerHTML = `<p style="text-align:center;">No history available.</p>`;
    return;
  }

  uniqueDates.forEach(date => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date;
    dateSelect.appendChild(option);
  });

  const savedDate = localStorage.getItem("selectedHistoryDate");
  const selectedDate = savedDate && uniqueDates.includes(savedDate) ? savedDate : uniqueDates[0];
  dateSelect.value = selectedDate;
  localStorage.setItem("selectedHistoryDate", selectedDate);
  renderDateHistory(selectedDate);
}

function updateHistoryViewControls() {
  const dailySelected = historyViewMode === "daily";
  document.querySelectorAll("[data-history-mode]").forEach(button => {
    const selected = button.dataset.historyMode === historyViewMode;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("active", selected);
  });
  const filterBar = document.getElementById("history-filter-bar");
  if (filterBar) filterBar.hidden = !dailySelected;
}

function refreshHistoryView() {
  updateHistoryViewControls();
  if (historyViewMode === "timeline") showHistory();
  else updateHistory();
}

function setHistoryViewMode(mode) {
  if (mode !== "daily" && mode !== "timeline") return;
  historyViewMode = mode;
  localStorage.setItem(HISTORY_VIEW_MODE_KEY, mode);
  refreshHistoryView();
}

function renderDateHistory(dateStr) {
  const historyView = document.getElementById("history-view");
  historyView.innerHTML = "";

  const entries = expenses.filter(e => new Date(e.date).toLocaleDateString('en-CA') === dateStr);
  if (entries.length === 0) {
    historyView.innerHTML = `<p style="text-align:center;">No entries for ${dateStr}</p>`;
    return;
  }

  const title = document.createElement("h3");
  title.textContent = `Entries for ${dateStr}`;
  historyView.appendChild(title);

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "table-wrapper no-horizontal-scroll";

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Time</th>
        <th>Category</th>
        <th>Amount ($)</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  sorted.forEach(entry => {
    const row = document.createElement("tr");
    row.classList.add("expandable-row");

    const time = new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const detailsText = entry.details?.trim() || "-";
    const isLong = detailsText.length > 30;
    const preview = isLong ? detailsText.slice(0, 30) + "..." : detailsText;

    let expanded = false;

    row.innerHTML = `
      <td>${time}</td>
      <td>${entry.category}</td>
      <td>$${entry.amount.toFixed(2)}</td>
      <td><span class="details-text">${preview}</span></td>
    `;

    row.addEventListener("click", () => {
      const span = row.querySelector(".details-text");

      if (!isLong) return;

      expanded = !expanded;
      span.textContent = expanded ? detailsText : preview;
      row.classList.toggle("expanded-row", expanded);
    });

    tbody.appendChild(row);
  });

  tableWrapper.appendChild(table);
  historyView.appendChild(tableWrapper);
}





function restoreCategory(index) {
  const entry = deletedCategories[index];
  if (!entry) return;

  const { category, monthKey } = entry;

  // Restore the original values when available. Older recycle-bin records did
  // not store them, so keep backwards-compatible defaults for those records.
  categoryLimits[category] = Number(entry.limit) || 0;
  categoryKinds[category] = entry.kind || "Variable";

  localStorage.setItem("categoryLimits", JSON.stringify(categoryLimits));
  localStorage.setItem("categoryKinds", JSON.stringify(categoryKinds));

  deletedCategories.splice(index, 1);
  localStorage.setItem("deletedCategories", JSON.stringify(deletedCategories));

  renderRecycleBin();
  updateRemainingBudget();

  closeDeletedCategoriesView();

  // Older deleted-category records include the month that was being viewed.
  if (monthKey) {
    const [yearStr, monthStr] = monthKey.split("-");
    document.getElementById("year-select").value = parseInt(yearStr);
    document.getElementById("month-select").value = parseInt(monthStr) - 1;
  }

  renderCategoryDropdown();
  updateRemainingBudget();

  // Optional confirmation message
  yemToast(
    monthKey
      ? `Category "${category}" restored for ${monthKey}`
      : `Category "${category}" restored.`
  );
}





// =============== Persistence Keys ===============
const BUDGET_ROW_ORDER_KEY = "budgetRowOrder";
const BUDGET_SORT_MODE_KEY = "budgetSortMode"; // 'default' | 'proj_desc' | 'proj_asc'

// =============== Saved Order Helpers ===============
function getSavedOrder() {
  try {
    const raw = localStorage.getItem(BUDGET_ROW_ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveOrder(orderArr) {
  try { localStorage.setItem(BUDGET_ROW_ORDER_KEY, JSON.stringify(orderArr)); } catch {}
}
function orderEntriesBySaved(entries) {
  const saved = getSavedOrder();
  if (!saved.length) return entries;

  const idx = new Map(saved.map((name, i) => [name, i]));
  const known = [], unknown = [];
  for (const pair of entries) (idx.has(pair[0]) ? known : unknown).push(pair);
  known.sort((a, b) => idx.get(a[0]) - idx.get(b[0]));
  return [...known, ...unknown];
}

// =============== Sort Mode Helpers ===============
function getSortMode() {
  return localStorage.getItem(BUDGET_SORT_MODE_KEY) || "default";
}
function setSortMode(mode) {
  localStorage.setItem(BUDGET_SORT_MODE_KEY, mode);
}
function sortEntriesByMode(entries) {
  const mode = getSortMode();
  const categoryAscending = (a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
  if (mode === "proj_desc") {
    return [...entries].sort((a, b) => (Number(b[1]) - Number(a[1])) || categoryAscending(a, b));
  }
  if (mode === "proj_asc") {
    return [...entries].sort((a, b) => (Number(a[1]) - Number(b[1])) || categoryAscending(a, b));
  }
  return orderEntriesBySaved(entries); // default/manual
}

// =============== Drag & Drop with Auto-Scroll ===============
function enableRowDragAndDrop(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  // Drag only in Default mode
  const dndEnabled = (localStorage.getItem("budgetSortMode") || "default") === "default";
  tbody.dataset.dndEnabled = String(dndEnabled);

  // Toggle draggable on rows each render
  Array.from(tbody.querySelectorAll("tr")).forEach(tr => {
    if (dndEnabled) tr.setAttribute("draggable", "true");
    else tr.removeAttribute("draggable");
  });

  if (tbody._dndBound) return; // bind once
  tbody._dndBound = true;

  const wrapper = tbody.closest(".table-wrapper"); // table container
  let draggedRow = null;
  let lastClientY = 0;
  let autoScrollRAF = null;

  // Find which element actually scrolls (wrapper or page)
  function isWrapperScrollable() {
    if (!wrapper) return false;
    const cs = getComputedStyle(wrapper);
    const vScrollable = (cs.overflowY === "auto" || cs.overflowY === "scroll");
    return vScrollable && wrapper.scrollHeight > wrapper.clientHeight;
  }

  function startAutoScroll() {
    if (autoScrollRAF) return;
    autoScrollRAF = requestAnimationFrame(autoScrollStep);
  }

  function stopAutoScroll() {
    if (autoScrollRAF) cancelAnimationFrame(autoScrollRAF);
    autoScrollRAF = null;
  }

  function autoScrollStep() {
    if (!draggedRow) { stopAutoScroll(); return; }

    const EDGE = 40;  // px sensitivity near top/bottom
    const SPEED = 14; // px per frame
    const useWrapperScroll = isWrapperScrollable();

    // Get visible bounds we should respect
    const wRect = wrapper ? wrapper.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    // The effective visible region (clamped to viewport if page is scroller)
    const visibleTop = useWrapperScroll ? wRect.top : Math.max(0, wRect.top);
    const visibleBottom = useWrapperScroll ? wRect.bottom : Math.min(window.innerHeight, wRect.bottom);

    // Are we near the top/bottom edge (within the visible table area)?
    const nearTop = lastClientY < (visibleTop + EDGE);
    const nearBottom = lastClientY > (visibleBottom - EDGE);

    let didScroll = false;

    if (useWrapperScroll) {
      // Scroll the wrapper, but clamp to its own bounds
      if (nearTop && wrapper.scrollTop > 0) {
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop - SPEED);
        didScroll = true;
      } else if (nearBottom && (wrapper.scrollTop + wrapper.clientHeight < wrapper.scrollHeight)) {
        wrapper.scrollTop = Math.min(wrapper.scrollHeight, wrapper.scrollTop + SPEED);
        didScroll = true;
      }
    } else {
      // Page scroll, but clamp so the table never goes past viewport edges
      // Can scroll up only if wrapper top is above the viewport top
      if (nearTop && wRect.top < 0) {
        window.scrollBy(0, -SPEED);
        didScroll = true;
      }
      // Can scroll down only if wrapper bottom is below the viewport bottom
      else if (nearBottom && wRect.bottom > window.innerHeight) {
        window.scrollBy(0, SPEED);
        didScroll = true;
      }
    }

    // Keep the loop going while dragging; stops when drag ends or no need to scroll
    autoScrollRAF = requestAnimationFrame(autoScrollStep);
  }

  tbody.addEventListener("dragstart", (e) => {
    if (tbody.dataset.dndEnabled !== "true") return;
    const tr = e.target.closest("tr");
    if (!tr) return;
    draggedRow = tr;
    tr.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tr.dataset.category || "");
    // NOTE: we start auto-scroll after the first dragover (smoother)
  });

  tbody.addEventListener("dragend", (e) => {
    const tr = e.target.closest("tr");
    if (tr) tr.classList.remove("dragging");
    draggedRow = null;
    stopAutoScroll();

    // Persist order if DnD enabled
    if (tbody.dataset.dndEnabled === "true") {
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const order = rows.map(r => r.dataset.category).filter(Boolean);
      try { localStorage.setItem("budgetRowOrder", JSON.stringify(order)); } catch {}
    }
  });

  tbody.addEventListener("dragover", (e) => {
    if (tbody.dataset.dndEnabled !== "true") return;
    e.preventDefault();
    lastClientY = e.clientY;

    if (!autoScrollRAF) startAutoScroll();

    const targetRow = e.target.closest("tr");
    if (!draggedRow || !targetRow || targetRow === draggedRow) return;

    const rect = targetRow.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) targetRow.before(draggedRow);
    else targetRow.after(draggedRow);
  });

  tbody.addEventListener("drop", (e) => {
    e.preventDefault();
    // placement handled in dragover
  });
}


// =============== Header Menu ===============
function buildTypeHeaderMenu(anchorEl) {
  // Remove any existing menu
  document.querySelectorAll(".header-menu").forEach(m => m.remove());

  const menu = document.createElement("div");
  menu.className = "header-menu";
  menu.innerHTML = `
    <button data-mode="proj_desc">High → Low (Projected)</button>
    <button data-mode="proj_asc">Low → High (Projected)</button>
    <button data-mode="default">Default (Manual Order)</button>
  `;

  // Mark active
  const active = getSortMode();
  menu.querySelectorAll("button").forEach(btn => {
    if (btn.dataset.mode === active) btn.classList.add("active");
  });

  // Click handlers
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    setSortMode(btn.dataset.mode);
    updateRemainingBudget();
    menu.remove();
  });

  // Position near the header
  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = "absolute";
  menu.style.top = `${window.scrollY + rect.bottom + 6}px`;
  menu.style.left = `${window.scrollX + rect.left}px`;

  document.body.appendChild(menu);

  // Close on outside click or Escape
  const onDocClick = (ev) => {
    if (!menu.contains(ev.target) && ev.target !== anchorEl) {
      menu.remove(); document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    }
  };
  const onEsc = (ev) => {
    if (ev.key === "Escape") {
      menu.remove(); document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    }
  };
  setTimeout(() => document.addEventListener("click", onDocClick), 0);
  document.addEventListener("keydown", onEsc);
}

// =============== Budget Display ===============
function updateRemainingBudget() {
  const selectedMonth = parseInt(document.getElementById("month-select").value);
  const selectedYear = parseInt(document.getElementById("year-select").value);

  const spent = {};
  expenses.forEach(e => {
    const d = new Date(e.date);
    if (d.getMonth() === selectedMonth && d.getFullYear() === selectedYear) {
      spent[e.category] = (spent[e.category] || 0) + e.amount;
    }
  });

  const tableBody = document.getElementById("budget-body");
  tableBody.innerHTML = "";

  const totalLimit = Object.values(categoryLimits).reduce((a, b) => a + b, 0);

  // Sort entries based on mode
  const entries = sortEntriesByMode(Object.entries(categoryLimits));

  // Render rows
  entries.forEach(([category, limit]) => {
    const used = spent[category] || 0;
    const remaining = limit - used;
    const percentUsed = limit > 0 ? ((used / limit) * 100).toFixed(1) : "0.0";
    const allocationPercent = totalLimit > 0 ? ((limit / totalLimit) * 100).toFixed(1) : "0.0";
    const usedOfTotal = totalLimit > 0 ? ((used / totalLimit) * 100).toFixed(1) : "0.0";

    const row = document.createElement("tr");
    row.dataset.category = category;  // for persistence
    // draggable toggled by enableRowDragAndDrop based on mode

    row.innerHTML = `
      <td style="cursor: pointer; color: #3f51b5;" onclick="openCategoryEditModal('${category}')">${category}</td>
      <td>
        <span style="color: #f57c00; cursor: pointer; text-decoration: underline;" onclick="viewCategoryExpenses('${category}')">
          <strong style="color: inherit;">$${used.toFixed(2)}</strong>
        </span>
      </td>
      <td><strong style="color: #388e3c;">$${remaining.toFixed(2)}</strong></td>
      <td><strong style="color: #0077cc;">$${limit.toFixed(2)}</strong></td>
      <td>${percentUsed}%</td>
      <td>${usedOfTotal}% / ${allocationPercent}%</td>
    `;
    tableBody.appendChild(row);
  });

  // Totals
  const totalSummaryBox = document.getElementById("total-summary");
  let totalUsed = 0, fullLimit = 0;
  for (let category in categoryLimits) {
    totalUsed += spent[category] || 0;
    fullLimit += categoryLimits[category];
  }
  const totalRemaining = fullLimit - totalUsed;
  const percentUsedTotal = fullLimit > 0 ? ((totalUsed / fullLimit) * 100).toFixed(1) : "0.0";

  totalSummaryBox.innerHTML = `
    <div class="total-summary-grid">
      <div class="label">💸 Total Spent:</div>
      <div class="value">$${totalUsed.toFixed(2)}</div>

      <div class="label">💼 Total Remaining:</div>
      <div class="value">$${totalRemaining.toFixed(2)}</div>

      <div class="label">📈 Total Projected:</div>
      <div class="value" style="color: ${fullLimit > 0 ? 'green' : 'gray'}">$${fullLimit.toFixed(2)}</div>

      <div class="label">📊 Used:</div>
      <div class="value">${percentUsedTotal}%</div>
    </div>
  `;

  // Enable DnD (bind once + update live flag/attributes every render)
  enableRowDragAndDrop("budget-body");
}

// =============== Wire up the Type header menu (toggle open/close) ===============
document.getElementById("type-header")?.addEventListener("click", (e) => {
  const existing = document.querySelector(".header-menu");
  if (existing) { existing.remove(); return; } // toggle close
  buildTypeHeaderMenu(e.currentTarget);
});



// 📋 Show a modal listing all expenses for a specific category and month
function viewCategoryExpenses(category) {
  // Get the currently selected month and year from dropdowns
  const selectedMonth = parseInt(document.getElementById("month-select").value);
  const selectedYear = parseInt(document.getElementById("year-select").value);

  // Get references to modal elements
  const modal = document.getElementById("category-expense-modal");
  const title = document.getElementById("expense-modal-title");
  const list = document.getElementById("expense-list");

  // Set modal title to include the selected category name
  title.textContent = `💼 Expenses for "${category}"`;

  // 🔍 Filter expenses for:
  // - matching category
  // - matching selected month and year
  const filtered = expenses.filter(e => {
    const d = new Date(e.date);
    return e.category === category &&
           d.getMonth() === selectedMonth &&
           d.getFullYear() === selectedYear;
  });

  // 📝 Display filtered expenses or show "No expenses" message
  if (filtered.length === 0) {
    list.innerHTML = `<p>No expenses found for this category this month.</p>`;
  } else {
      list.innerHTML = filtered.map((e, index) => {
  const dateStr = new Date(e.date).toLocaleDateString();
  const detailsHTML = e.details && e.details.trim() !== ""
    ? `<div style="font-size: 0.85em; color: #666; margin-top: 4px;">↳ ${e.details}</div>`
    : "";

  return `
    <div style="padding: 12px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-weight: 600; color: #333;">📅 ${dateStr}</div>
        <button 
          onclick="openEditExpenseModal('${category}', '${e.date}', ${e.amount})"
          style="background-color: transparent; border: none; color: #3F51B5; font-weight: 500; cursor: pointer; font-size: 0.85rem;">
          ✏️ Edit
        </button>
      </div>
      <div style="margin-top: 6px; font-size: 0.95rem; color: #444;">
        💵 $${e.amount.toFixed(2)}
        ${detailsHTML}
      </div>
    </div>
  `;
}).join("");


  }

  // 📦 Show the modals
  document.getElementById("modal-overlay").style.display = "block"; // Show overlay
  document.getElementById("category-expense-modal").style.display = "block"; // Show modal
  document.body.classList.add("no-scroll"); // Lock scroll
}

// ✅ Edit Expense - Legacy prompt version
async function editExpense(category, dateStr, oldAmount) {
  const targetDate = new Date(dateStr);
  const formattedTargetDate = targetDate.toLocaleDateString();

  const expToEdit = expenses.find(e =>
    e.category === category &&
    new Date(e.date).toLocaleDateString() === formattedTargetDate &&
    e.amount === oldAmount
  );

  if (!expToEdit) {
    yemToast("Expense not found.");
    return;
  }

  const newAmount = await yemPrompt({
    title: "Edit expense amount",
    message: `Update the amount for ${category}.`,
    inputLabel: "Amount",
    inputType: "number",
    defaultValue: expToEdit.amount,
    confirmLabel: "Continue"
  });
  if (newAmount === null || isNaN(newAmount)) return;

  const newDetails = await yemPrompt({
    title: "Edit expense details",
    message: "Update the description or leave it blank.",
    inputLabel: "Details",
    defaultValue: expToEdit.details || "",
    confirmLabel: "Continue"
  });
  if (newDetails === null) return;

  const currentDateTime = new Date(expToEdit.date).toISOString().slice(0, 16);
  const newDateTime = await yemPrompt({
    title: "Edit expense date and time",
    message: "Choose the date and time for this expense.",
    inputLabel: "Date and time",
    inputType: "datetime-local",
    defaultValue: currentDateTime,
    confirmLabel: "Save expense"
  });

  const newDate = newDateTime ? new Date(newDateTime) : null;
  if (!newDate || isNaN(newDate.getTime())) {
    yemToast("Invalid date/time format.");
    return;
  }

  expToEdit.amount = parseFloat(newAmount);
  expToEdit.details = newDetails;
  expToEdit.date = newDate.toISOString();

  saveExpenses();
  viewCategoryExpenses(category);
}

// ✅ Open Edit Modal
function openEditExpenseModal(category, dateStr, amount) {
  currentCategory = category;

  const targetDate = new Date(dateStr).toLocaleDateString();
  const index = expenses.findIndex(e =>
    e.category === category &&
    new Date(e.date).toLocaleDateString() === targetDate &&
    e.amount === amount
  );

  if (index === -1) {
    yemToast("Expense not found.");
    return;
  }

  const exp = expenses[index];
  document.getElementById("edit-date").value = new Date(exp.date).toISOString().slice(0, 16);
  document.getElementById("edit-amount").value = exp.amount;
  document.getElementById("edit-details").value = exp.details || "";
  document.getElementById("edit-transaction-type").value = exp.transactionType || "debit";
  document.getElementById("edit-payment-method").value = exp.paymentMethod || "debit-card";
  document.getElementById("edit-payment-pattern").value = exp.paymentPattern === "spread" ? "spread" : "regular";
  document.getElementById("edit-allocation-start-month").value = exp.allocationStartMonth || monthValueFromDate(exp.date);
  document.getElementById("edit-allocation-months").value = Number(exp.allocationMonths) || 12;
  document.getElementById("edit-expense-start-date").value = exp.activeStart || "";
  document.getElementById("edit-expense-end-date").value = exp.activeEnd || "";
  document.getElementById("edit-index").value = index;
  syncEditPaymentPattern();

  document.getElementById("edit-expense-modal").style.display = "block";
  document.getElementById("edit-overlay").style.display = "block";
  document.body.classList.add("no-scroll");
}

function updateEditAllocationPreview() {
  const amount = Number(document.getElementById("edit-amount").value);
  const start = document.getElementById("edit-allocation-start-month").value;
  const months = Number(document.getElementById("edit-allocation-months").value);
  const end = allocationEndMonth(start, months);
  document.getElementById("edit-allocation-preview").textContent = amount > 0 && end
    ? `Budget allocation: ${allocationMonthlyRange(amount, months)} from ${start} through ${end}.`
    : "Enter valid allocation details.";
}

function syncEditPaymentPattern() {
  const spread = document.getElementById("edit-payment-pattern").value === "spread";
  document.getElementById("edit-spread-payment-fields").hidden = !spread;
  document.getElementById("edit-regular-duration-fields").hidden = spread;
  document.getElementById("edit-allocation-start-month").required = spread;
  document.getElementById("edit-allocation-months").required = spread;
  updateEditAllocationPreview();
}

document.getElementById("edit-payment-pattern").addEventListener("change", syncEditPaymentPattern);
document.getElementById("edit-amount").addEventListener("input", updateEditAllocationPreview);
document.getElementById("edit-allocation-start-month").addEventListener("input", updateEditAllocationPreview);
document.getElementById("edit-allocation-months").addEventListener("input", updateEditAllocationPreview);

// ✅ Delete (Soft Delete) to deletedEntries[]
async function deleteCurrentExpense() {
  if (!await yemConfirm({
    title: "Delete expense entry?",
    message: "This entry will be moved to the Recycle Bin and can be restored later.",
    confirmLabel: "Move to Recycle Bin",
    danger: true
  })) return;

  const index = parseInt(document.getElementById("edit-index").value);

  if (index >= 0 && index < expenses.length) {
    const deletedEntry = expenses.splice(index, 1)[0];
    deletedEntries.push({ ...deletedEntry, deletedAt: new Date().toISOString() });
    saveExpenses();
    closeEditModal();
    viewCategoryExpenses(currentCategory);
  } else {
    yemToast("Invalid expense entry.");
  }
}

// ✅ Show Deleted Entries Modal
function showDeletedEntries() {
  if (deletedEntries.length === 0) {
    yemToast("No deleted entries found.");
    return;
  }

  let html = `<h2>💵 Deleted Entries</h2><ul style="list-style:none; padding-left:0;">`;

  deletedEntries.forEach((entry, index) => {
    html += `
      <li style="margin-bottom: 12px; border-bottom: 1px solid #ccc; padding-bottom: 8px;">
        <strong>${entry.category}</strong><br>
        $${entry.amount} — ${new Date(entry.date).toLocaleString()}<br>
        ${entry.details ? `📝 ${entry.details}` : ""}
        <br><button onclick="restoreDeletedEntry(${index})" style="margin-top: 6px;">♻️ Restore</button>
      </li>
    `;
  });

  html += `</ul><button onclick="closeDeletedEntriesView()">❌ Close</button>`;

  const modal = document.createElement("div");
  modal.id = "deleted-entries-modal";
  modal.style = `
    position:fixed;
    top:10%;
    left:50%;
    transform:translateX(-50%);
    background:white;
    padding:20px;
    border-radius:10px;
    z-index:4000;
    width:90%;
    max-width:600px;
    max-height:80vh;
    overflow-y:auto;
  `;
  modal.innerHTML = html;

  document.body.appendChild(modal);
  document.body.classList.add("no-scroll");
}

// ✅ Restore a Deleted Entry
function restoreDeletedEntry(index) {
  const restored = deletedEntries.splice(index, 1)[0];
  if (!restored) return;
  delete restored.deletedAt;
  expenses.push(restored);
  saveExpenses();
  closeDeletedEntriesView();
  viewCategoryExpenses(restored.category);
}

// ✅ Show Deleted Category Modal
function showDeletedCategories() {
  if (deletedCategories.length === 0) {
    yemToast("No deleted categories found.");
    return;
  }

  let html = `<h2>🗂️ Deleted Categories</h2><ul style="list-style:none; padding-left:0;">`;

  deletedCategories.forEach((entry, index) => {
    html += `
      <li style="margin-bottom: 12px; border-bottom: 1px solid #ccc; padding-bottom: 8px;">
        <strong>📁 ${entry.category}</strong><br>
        Month: ${entry.monthKey}<br>
        ${entry.entries && entry.entries.length > 0 ? `🧾 ${entry.entries.length} entries` : ""}
        <br><button onclick="restoreCategory(${index})" style="margin-top: 6px;">♻️ Restore</button>
      </li>
    `;
  });

  html += `</ul><button onclick="closeDeletedCategoriesView()">❌ Close</button>`;

  const modal = document.createElement("div");
  modal.id = "deleted-categories-modal";
  modal.style = `
    position:fixed;
    top:10%;
    left:50%;
    transform:translateX(-50%);
    background:white;
    padding:20px;
    border-radius:10px;
    z-index:4000;
    width:90%;
    max-width:600px;
    max-height:80vh;
    overflow-y:auto;
  `;
  modal.innerHTML = html;

  document.body.appendChild(modal);
  document.body.classList.add("no-scroll");
}

// ✅ Restore a Deleted 
function closeDeletedCategoriesView() {
  const modal = document.getElementById("deleted-categories-modal");
  if (modal) modal.remove();
  document.body.classList.remove("no-scroll");
}

// ✅ Close Deleted Entries View
function closeDeletedEntriesView() {
  const modal = document.getElementById("deleted-entries-modal");
  if (modal) modal.remove();
  document.body.classList.remove("no-scroll");
}

// ✅ Close Sidebar
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("nav-open");
  document.getElementById("nav-overlay").style.display = "none";
  document.getElementById("menu-toggle")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("no-scroll");
}

// ✅ Handle Show Deleted Switch
function handleShowDeleted(type) {
  closeSidebar(); // Ensures sidebar is closed
  setTimeout(() => {
    if (type === "category") {
      showDeletedCategories();
    } else {
      showDeletedEntries();
    }
  }, 300); // Delay to avoid z-index overlay conflict
}

// ✅ Render Recycle Bin Sidebar Buttons
function renderRecycleBin() {
  const binList = document.getElementById("recycle-bin-list");
  if (!binList) return;

  binList.innerHTML = `
    <li><button onclick="handleShowDeleted('category')">🗂️ View Deleted Categories</button></li>
    <li><button onclick="handleShowDeleted('entry')">💵 View Deleted Entries</button></li>
  `;

  if (deletedCategories.length === 0 && deletedEntries.length === 0) {
    binList.innerHTML += `<li style="margin-top: 10px;"><em>Recycle Bin is empty.</em></li>`;
  }
}


// Close modal
function closeEditModal() {
  document.getElementById("edit-expense-modal").style.display = "none";
  document.getElementById("edit-overlay").style.display = "none";
  document.body.classList.remove("no-scroll");
}


document.getElementById("edit-expense-form").addEventListener("submit", async function(e) {
  e.preventDefault();

  if (!await yemConfirm({
    title: "Save expense changes?",
    message: "The updated expense details will replace the current values.",
    confirmLabel: "Save changes"
  })) return;

  const index = parseInt(document.getElementById("edit-index").value);
  const newDate = new Date(document.getElementById("edit-date").value);
  const newAmount = parseFloat(document.getElementById("edit-amount").value);
  const newDetails = document.getElementById("edit-details").value.trim();
  const transactionType = document.getElementById("edit-transaction-type").value;
  const paymentMethod = document.getElementById("edit-payment-method").value;
  const paymentPattern = document.getElementById("edit-payment-pattern").value;
  const activeStart = document.getElementById("edit-expense-start-date").value;
  const activeEnd = document.getElementById("edit-expense-end-date").value;

  if (isNaN(newAmount) || isNaN(newDate.getTime())) {
    yemToast("Invalid input.");
    return;
  }

  if (paymentPattern !== "spread" && activeStart && activeEnd && activeStart > activeEnd) {
    yemToast("The expense expiry date cannot be before its start date.");
    return;
  }

  const allocationStartMonth = paymentPattern === "spread" ? document.getElementById("edit-allocation-start-month").value : "";
  const allocationMonths = paymentPattern === "spread" ? Number(document.getElementById("edit-allocation-months").value) : 0;
  if (paymentPattern === "spread" && (!/^\d{4}-\d{2}$/.test(allocationStartMonth) || !Number.isInteger(allocationMonths) || allocationMonths < 2 || allocationMonths > 120)) {
    yemToast("Please enter valid allocation details.");
    return;
  }

  expenses[index].date = newDate.toISOString();
  expenses[index].amount = newAmount;
  expenses[index].details = detailsWithCardType(newDetails, paymentMethod);
  expenses[index].transactionType = transactionType;
  expenses[index].paymentMethod = paymentMethod;
  expenses[index].paymentPattern = paymentPattern;
  expenses[index].activeStart = paymentPattern === "spread" ? "" : activeStart;
  expenses[index].activeEnd = paymentPattern === "spread" ? "" : activeEnd;
  expenses[index].allocationStartMonth = allocationStartMonth;
  expenses[index].allocationMonths = allocationMonths;

  saveExpenses();

  // ✅ FIRST close the edit modal
  closeEditModal();

  // ✅ THEN refresh the category box after a minimal delay
  setTimeout(() => {
    viewCategoryExpenses(currentCategory);
  }, 50);
});





// ❌ Close the category expenses modal
function closeCategoryExpenseModal() {
  const modal = document.getElementById("category-expense-modal");
  const overlay = document.getElementById("modal-overlay");

  if (modal) modal.style.display = "none";       // Hide popup
  if (overlay) overlay.style.display = "none";   // Hide background dim
  document.body.classList.remove("no-scroll");   // Unlock scroll
}


// ==== History View Grouped by Month and Date ====
function showHistory(keepOpen = false) {
  const grouped = {};
  expenses.forEach((entry) => {
    const dateObj = new Date(entry.date);
    const year = dateObj.getFullYear();
    const month = dateObj.toLocaleString("default", { month: "long" });
    const dateOnly = dateObj.toLocaleDateString('en-CA');  // Format: YYYY-MM-DD
    const monthKey = `${month} ${year}`;
    if (!grouped[monthKey]) grouped[monthKey] = {};
    if (!grouped[monthKey][dateOnly]) grouped[monthKey][dateOnly] = [];
    grouped[monthKey][dateOnly].push(entry);
  });

  const historyView = document.getElementById("history-view");
  historyView.innerHTML = "";

  const monthKeys = Object.keys(grouped).sort((a, b) => {
    const dateA = new Date(`${a} 01`);
    const dateB = new Date(`${b} 01`);
    return sortDescending ? dateB - dateA : dateA - dateB;
  });

  if (monthKeys.length === 0) {
    historyView.innerHTML = `<p class="history-empty-state">No history available.</p>`;
    return;
  }

  monthKeys.forEach((month) => {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = month;
    details.appendChild(summary);
    if (keepOpen && month === lastOpenedMonthKey) details.open = true;

    if (details.open) {
        setTimeout(() => details.scrollIntoView({ behavior: "smooth" }), 0);
    }


    // Sort dropdown
    const sortContainer = document.createElement("div");
    sortContainer.style.margin = "10px 0";

    const sortLabel = document.createElement("label");
    sortLabel.textContent = "Sort by: ";
    sortLabel.style.marginRight = "8px";

    const sortSelect = document.createElement("select");
    sortSelect.className = "date-sort-dropdown";

    const options = [
      { value: "dateAsc", label: "📅 Date Ascending" },
      { value: "dateDesc", label: "📅 Date Descending" }
    ];

    options.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      sortSelect.appendChild(option);
    });

    const monthDatesContainer = document.createElement("div");

    sortSelect.onchange = () => {
      renderMonthDates(grouped[month], monthDatesContainer, sortSelect.value, grouped);
    };

    sortContainer.appendChild(sortLabel);
    sortContainer.appendChild(sortSelect);
    details.appendChild(sortContainer);
    details.appendChild(monthDatesContainer);

    renderMonthDates(grouped[month], monthDatesContainer, "dateDesc", grouped);
    historyView.appendChild(details);
  });
}

function renderMonthDates(datesObj, container, sortMode, grouped) {
  container.innerHTML = "";

  const sortedDates = Object.keys(datesObj).sort((a, b) => {
    const totalA = datesObj[a].reduce((sum, entry) => sum + entry.amount, 0);
    const totalB = datesObj[b].reduce((sum, entry) => sum + entry.amount, 0);

    switch (sortMode) {
      case "dateAsc":
        return new Date(a) - new Date(b);
      case "dateDesc":
        return new Date(b) - new Date(a);
      default:
        return new Date(b) - new Date(a);
    }
  });

  sortedDates.forEach((date) => {
    const dateBtn = document.createElement("button");
    dateBtn.textContent = date;
    dateBtn.className = "date-button";
    dateBtn.onclick = () => showDateDetails(date, datesObj[date], grouped);
    container.appendChild(dateBtn);
  });
}

// ==== Entry Details for Specific Date ====
function showDateDetails(date, entries, grouped) {
  const historyView = document.getElementById("history-view");
  historyView.innerHTML = "";

  const container = document.createElement("div");

const monthKey = getMonthKeyFromDate(date);

  // 🔙 Back Buttons
  const backButtonsWrapper = document.createElement("div");
  backButtonsWrapper.className = "back-buttons-wrapper";

  const backToMonthBtn = document.createElement("button");
  backToMonthBtn.textContent = "← Back to Month View";
  backToMonthBtn.className = "back-btn";
  backToMonthBtn.onclick = () => showHistory(true);

  const backToDatesBtn = document.createElement("button");
  backToDatesBtn.textContent = "← Back to Dates";
  backToDatesBtn.className = "back-btn";
  const monthKeyForBackBtn = getMonthKeyFromDate(date);

backToDatesBtn.onclick = () => {
  const grouped = {};
  expenses.forEach((entry) => {
  const dateObj = new Date(entry.date);
  const dateOnly = dateObj.toLocaleDateString('en-CA');
  const monthKey = getMonthKeyFromDate(entry.date);
  if (!grouped[monthKey]) grouped[monthKey] = {};
  if (!grouped[monthKey][dateOnly]) grouped[monthKey][dateOnly] = [];
  grouped[monthKey][dateOnly].push(entry);
});


  const monthData = grouped[monthKeyForBackBtn];
  if (!monthData) {
    yemToast("⚠️ Could not find entries for this month.");
    return;
  }

  historyView.innerHTML = "";

  const details = document.createElement("details");
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = monthKeyForBackBtn;
  details.appendChild(summary);

  const sortContainer = document.createElement("div");
  sortContainer.style.margin = "10px 0";

  const sortLabel = document.createElement("label");
  sortLabel.textContent = "Sort by: ";
  sortLabel.style.marginRight = "8px";

  const sortSelect = document.createElement("select");
  sortSelect.className = "date-sort-dropdown";

  const options = [
    { value: "dateAsc", label: "📅 Date Ascending" },
    { value: "dateDesc", label: "📅 Date Descending" }
  ];

  options.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    sortSelect.appendChild(option);
  });

  const monthDatesContainer = document.createElement("div");

  sortSelect.onchange = () => {
    renderMonthDates(monthData, monthDatesContainer, sortSelect.value, grouped);
  };

  sortContainer.appendChild(sortLabel);
  sortContainer.appendChild(sortSelect);
  details.appendChild(sortContainer);
  details.appendChild(monthDatesContainer);

  renderMonthDates(monthData, monthDatesContainer, "dateDesc", grouped);
  historyView.appendChild(details);

  // Optional: scroll into view
  historyView.scrollIntoView({ behavior: "smooth" });
};


  backButtonsWrapper.appendChild(backToMonthBtn);
  backButtonsWrapper.appendChild(backToDatesBtn);
  container.appendChild(backButtonsWrapper);

  const heading = document.createElement("h3");
  heading.textContent = `Entries for ${date}`;
  heading.style.marginTop = "15px";
  container.appendChild(heading);

  const sortDiv = document.createElement("div");
  sortDiv.style.margin = "10px 0";

  const sortLabel = document.createElement("label");
  sortLabel.textContent = "Sort by: ";
  sortLabel.style.marginRight = "8px";

  const sortSelect = document.createElement("select");
  sortSelect.className = "date-sort-dropdown";

  const options = [
    { value: "amount-desc", text: "Amount Descending" },
    { value: "amount-asc", text: "Amount Ascending" },
    { value: "time-desc", text: "Time Descending" },
    { value: "time-asc", text: "Time Ascending" },
  ];

  options.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.text;
    sortSelect.appendChild(o);
  });

  sortSelect.onchange = () => {
    renderDateEntries(entries, sortSelect.value, listContainer);
  };

  sortDiv.appendChild(sortLabel);
  sortDiv.appendChild(sortSelect);
  container.appendChild(sortDiv);

  const listContainer = document.createElement("div");
  container.appendChild(listContainer);

  renderDateEntries(entries, "amount-desc", listContainer);
  historyView.appendChild(container);

// Automatically scroll to this section
  historyView.scrollIntoView({ behavior: "smooth" });
}

function renderDateEntries(entries, sortType, container) {
  container.innerHTML = "";

  const sorted = [...entries].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();

    switch (sortType) {
      case "amount-asc":
        return a.amount - b.amount;
      case "amount-desc":
        return b.amount - a.amount;
      case "time-asc":
        return timeA - timeB;
      case "time-desc":
      default:
        return timeB - timeA;
    }
  });

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Time</th>
        <th>Category</th>
        <th>Amount ($)</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  sorted.forEach(entry => {
    const row = document.createElement("tr");

    const timeCell = document.createElement("td");
    timeCell.textContent = new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const catCell = document.createElement("td");
    catCell.textContent = entry.category;

    const amountCell = document.createElement("td");
    amountCell.textContent = `$${entry.amount.toFixed(2)}`;

    const detailsCell = document.createElement("td");
    detailsCell.textContent = entry.details || '-';

    row.appendChild(timeCell);
    row.appendChild(catCell);
    row.appendChild(amountCell);
    row.appendChild(detailsCell);

    tbody.appendChild(row);
  });

  container.appendChild(table);
}


// ==== Export Function ====
function exportData() {
  const now = new Date();

  const day = now.getDate();
  const monthName = now.toLocaleString("en-US", { month: "long" }); // e.g., March
  const year = now.getFullYear();

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12; // convert to 12-hour format

  const formattedDate = `${day} ${monthName} ${year}`;
  const formattedTime = `${String(hours).padStart(2, '0')}-${minutes}-${seconds} ${ampm}`;
  const timestamp = `${formattedDate} at ${formattedTime}`;

  const filename = `YEM - ${String(day).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${year}T${String(now.getHours()).padStart(2, "0")}-${minutes}-${seconds} - Backup.json`;

  const fullData = {
    expenses,
    categoryLimits,
    categoryKinds,
    scheduledPayments: JSON.parse(localStorage.getItem("scheduledPayments") || "[]"),
    scheduledOccurrences: JSON.parse(localStorage.getItem("scheduledOccurrences") || "{}"),
    scheduledNotifications: JSON.parse(localStorage.getItem("scheduledNotifications") || "[]"),
    dismissedScheduledNotifications: JSON.parse(localStorage.getItem("dismissedScheduledNotifications") || "[]")
  };

  const data = new Blob([JSON.stringify(fullData, null, 2)], { type: "application/json" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(data);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}



// ==== Import Function ====
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const imported = JSON.parse(e.target.result);

      if (!imported.expenses || !Array.isArray(imported.expenses)) {
        return yemToast("❌ Invalid file format: missing 'expenses'.");
      }

      let newEntries = 0;
      const existing = new Set(expenses.map(e => `${e.date}|${e.category}|${e.amount}`));

      for (const entry of imported.expenses) {
        const key = `${entry.date}|${entry.category}|${entry.amount}`;
        if (!existing.has(key)) {
          expenses.push(entry);
          existing.add(key);
          newEntries++;
        }
      }

      // ✅ Merge Category Limits if provided
      if (imported.categoryLimits) {
        Object.entries(imported.categoryLimits).forEach(([cat, limit]) => {
          categoryLimits[cat] = limit;
        });
      }

      // ✅ Merge Category Kinds if provided
      if (imported.categoryKinds) {
        Object.entries(imported.categoryKinds).forEach(([cat, kind]) => {
          categoryKinds[cat] = kind;
        });
      }

      ["categoryMeta", "categoryProjections", "categoryBudgetModes", "categoryVisibility", "categoryBudgetSnapshots", "categoryVisibilityReviews", "itemCategoryMappings"].forEach(key => {
        if (!imported[key] || typeof imported[key] !== "object") return;
        const current = JSON.parse(localStorage.getItem(key) || "{}");
        localStorage.setItem(key, JSON.stringify({ ...current, ...imported[key] }));
      });

      ["scheduledPayments", "scheduledNotifications", "dismissedScheduledNotifications"].forEach(key => {
        if (!Array.isArray(imported[key])) return;
        const current = JSON.parse(localStorage.getItem(key) || "[]");
        const merged = [...current];
        imported[key].forEach(item => {
          const identity = typeof item === "string" ? item : item.id;
          if (!merged.some(existingItem => (typeof existingItem === "string" ? existingItem : existingItem.id) === identity)) merged.push(item);
        });
        localStorage.setItem(key, JSON.stringify(merged));
      });
      ["incomeEntries"].forEach(key => {
        if (!Array.isArray(imported[key])) return;
        const current = JSON.parse(localStorage.getItem(key) || "[]");
        const merged = [...current];
        imported[key].forEach(item => {
          if (!merged.some(existingItem => existingItem.id === item.id)) merged.push(item);
        });
        localStorage.setItem(key, JSON.stringify(merged));
      });
      if (imported.scheduledOccurrences && typeof imported.scheduledOccurrences === "object") {
        const current = JSON.parse(localStorage.getItem("scheduledOccurrences") || "{}");
        localStorage.setItem("scheduledOccurrences", JSON.stringify({ ...current, ...imported.scheduledOccurrences }));
      }

      localStorage.setItem("expenses", JSON.stringify(expenses));
      localStorage.setItem("categoryLimits", JSON.stringify(categoryLimits));
      localStorage.setItem("categoryKinds", JSON.stringify(categoryKinds));

      if (newEntries > 0 || imported.categoryLimits) {
        renderCategoryDropdown();
        updateRemainingBudget();
        refreshHistoryView();

        yemToast(`✅ Backup imported successfully. ${newEntries} new expense entries were added.`);
      } else {
        yemToast("⚠️ All entries in the file already exist. No duplicates added.");
      }

    } catch (err) {
      console.error(err);
      yemToast("❌ Error reading or parsing the file.");
    }
  };

  reader.readAsText(file);
}



// ==== Reset Function ====
function resetMonthKey(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(0, 7);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function readResetArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function readResetObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function resetSelectedMonthData(monthKey) {
  expenses = expenses.filter(item => resetMonthKey(item.actualDeductionDate || item.date) !== monthKey);
  deletedEntries = deletedEntries.filter(item => resetMonthKey(item.actualDeductionDate || item.date) !== monthKey);
  localStorage.setItem("expenses", JSON.stringify(expenses));
  localStorage.setItem("deletedEntries", JSON.stringify(deletedEntries));

  const incomeEntries = readResetArray("incomeEntries")
    .filter(item => resetMonthKey(item.date) !== monthKey);
  localStorage.setItem("incomeEntries", JSON.stringify(incomeEntries));

  const occurrences = readResetObject("scheduledOccurrences");
  Object.keys(occurrences).forEach(id => {
    if (resetMonthKey(occurrences[id].dueDate || id.split("|")[1]) === monthKey) delete occurrences[id];
  });
  localStorage.setItem("scheduledOccurrences", JSON.stringify(occurrences));

  const notifications = readResetArray("scheduledNotifications")
    .filter(item => resetMonthKey(item.dueDate) !== monthKey);
  localStorage.setItem("scheduledNotifications", JSON.stringify(notifications));
  const dismissed = readResetArray("dismissedScheduledNotifications")
    .filter(id => !String(id).includes(`|${monthKey}-`));
  localStorage.setItem("dismissedScheduledNotifications", JSON.stringify(dismissed));

  const snapshots = readResetObject("categoryBudgetSnapshots");
  delete snapshots[monthKey];
  localStorage.setItem("categoryBudgetSnapshots", JSON.stringify(snapshots));

  const reviews = readResetObject("categoryVisibilityReviews");
  Object.keys(reviews).forEach(category => {
    if (reviews[category] === monthKey) delete reviews[category];
  });
  localStorage.setItem("categoryVisibilityReviews", JSON.stringify(reviews));

  if (resetMonthKey(localStorage.getItem("selectedHistoryDate")) === monthKey) {
    localStorage.removeItem("selectedHistoryDate");
  }
  undoStack = [];
}

function resetEveryDataRecord() {
  [
    "expenses", "incomeEntries", "categoryLimits", "categoryKinds", "categoryMeta",
    "categoryProjections", "categoryBudgetModes", "categoryVisibility",
    "categoryBudgetSnapshots", "categoryVisibilityReviews", "deletedCategories",
    "deletedEntries", "scheduledPayments", "scheduledOccurrences",
    "scheduledNotifications", "dismissedScheduledNotifications", "itemCategoryMappings",
    "budgetRowOrder", "budgetSortMode", "selectedHistoryDate", "lastSavedMonth",
    "guest_expenses", "users", "currentUser"
  ].forEach(key => localStorage.removeItem(key));
}

async function resetAllData() {
  const month = Number(document.getElementById("month-select").value);
  const year = Number(document.getElementById("year-select").value);
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = new Date(year, month, 1).toLocaleString("en-CA", { month: "long", year: "numeric" });
  const scope = await yemChoose({
    title: "What would you like to reset?",
    message: `The Remaining Budget table is currently showing ${monthLabel}. Choose whether to reset only that month or every YEM record.`,
    choices: [
      { label: `Reset ${monthLabel}`, value: "month" },
      { label: "Reset entire data", value: "all", danger: true }
    ],
    cancelLabel: "Cancel"
  });
  if (!scope) return;

  const wantBackup = await yemConfirm({
    title: "Export a backup first?",
    message: scope === "month"
      ? `You can download a complete backup before removing the records for ${monthLabel}.`
      : "You can download a complete backup before removing every locally stored YEM record.",
    confirmLabel: "Export backup",
    cancelLabel: "Continue without backup"
  });
  if (wantBackup) await exportData();

  const confirmed = await yemConfirm({
    title: scope === "month" ? `Reset ${monthLabel}?` : "Reset all YEM data?",
    message: scope === "month"
      ? `Expenses, income, Recycle Bin entries and scheduled-payment activity belonging to ${monthLabel} will be removed. Categories and schedules will remain available for other months.`
      : "All locally stored expenses, income, categories, projections, schedules and Recycle Bin records will be removed. This cannot be undone without a backup.",
    confirmLabel: scope === "month" ? `Reset ${monthLabel}` : "Reset all data",
    danger: true
  });
  if (!confirmed) return;
  if (scope === "month") resetSelectedMonthData(monthKey);
  else resetEveryDataRecord();
  sessionStorage.setItem("yemResetNotice", scope === "month" ? `${monthLabel} has been reset.` : "All YEM data has been reset.");
  location.reload();
}

// ==== Undo/Redo Functions ====
async function undoLastEntry() {
  if (!expenses.length) return yemToast("No entries to undo.");
  const last = expenses.at(-1);
  const confirmUndo = await yemConfirm({
    title: "Undo the last entry?",
    message: `Date: ${new Date(last.date).toLocaleString()}\nCategory: ${last.category}\nAmount: $${last.amount.toFixed(2)}`,
    confirmLabel: "Undo entry"
  });
  if (confirmUndo) {
    undoStack.push(expenses.pop());
    saveExpenses();
    yemToast("Last entry has been undone.");
  }
}

function redoLastEntry() {
  if (!undoStack.length) return yemToast("No entry to redo.");
  expenses.push(undoStack.pop());
  saveExpenses();
  yemToast("Last undone entry has been restored.");
}

refreshHistoryView();

// 🧩 1. Opens the edit modal for a variable category
async function openCategoryEditModal(category) {
  const kind = categoryKinds[category];

  // ✅ Ask for confirmation instead of blocking
  if (kind === "Fixed") {
    const confirmEdit = await yemConfirm({
      title: "Edit fixed category?",
      message: `"${category}" is a fixed category. Changes may affect its projected budget.`,
      confirmLabel: "Edit category"
    });
    if (!confirmEdit) return;
  }

  categoryBeingEdited = category;
  document.getElementById("edit-type-name").value = category;
  document.getElementById("edit-type-limit").value = categoryLimits[category];
  document.getElementById("edit-category-modal").style.display = "block";
}


// 🧩 2. Applies the changes made to the category (name and/or limit)
function applyCategoryEdit() {
  const newName = document.getElementById("edit-type-name").value.trim();
  const newLimit = parseFloat(document.getElementById("edit-type-limit").value);

  if (!newName || isNaN(newLimit) || newLimit < 0) {
    yemToast("Please enter a valid name and limit.");
    return;
  }

  if (newName !== categoryBeingEdited) {
    if (categoryLimits[newName]) {
      yemToast("This category name already exists.");
      return;
    }

    // 1. Assign new name and limit
    categoryLimits[newName] = newLimit;
    categoryKinds[newName] = categoryKinds[categoryBeingEdited];

    // 2. Update all expenses that had the old category name
    expenses.forEach(e => {
      if (e.category === categoryBeingEdited) {
        e.category = newName;
      }
    });

    // 3. Delete old category
    delete categoryLimits[categoryBeingEdited];
    delete categoryKinds[categoryBeingEdited];
  } else {
    categoryLimits[newName] = newLimit;
  }

  // ✅ Save all changes to localStorage
  localStorage.setItem("categoryLimits", JSON.stringify(categoryLimits));
  localStorage.setItem("categoryKinds", JSON.stringify(categoryKinds));
  localStorage.setItem("expenses", JSON.stringify(expenses));

  updateRemainingBudget();
  renderCategoryDropdown();
  closeCategoryEditModal();
}




// 🧩 3. Closes the category edit modal
function closeCategoryEditModal() {
  document.getElementById("edit-category-modal").style.display = "none";
  categoryBeingEdited = null;
}

// 🧩 3. Deletes the category edit modal
async function deleteCategory() {
  const category = categoryBeingEdited;
  if (!category) return;

  const selectedMonthKey = getMonthKeyFromDate(new Date().toISOString());
  const confirmDelete = await yemConfirm({
    title: "Delete category?",
    message: `Delete "${category}" for the selected month?`,
    confirmLabel: "Delete category",
    danger: true
  });

  if (!confirmDelete) return;

  // 🗑️ Move to recycle bin
  deletedCategories.push({ category, monthKey: selectedMonthKey });
  localStorage.setItem("deletedCategories", JSON.stringify(deletedCategories));

  // 🧼 Remove from UI logic
  delete categoryLimits[category];
  delete categoryKinds[category];

  localStorage.setItem("categoryLimits", JSON.stringify(categoryLimits));
  localStorage.setItem("categoryKinds", JSON.stringify(categoryKinds));

  updateRemainingBudget();
  renderRecycleBin();
  closeCategoryEditModal();

  yemToast(`Category "${category}" deleted successfully for the selected month.`);
}




// ==== Auto-Sync Time ====
function syncTimeToMinute() {
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    
    setTimeout(() => {
        setCurrentDateTime();
        setInterval(setCurrentDateTime, 60000);
    }, msToNextMinute);
}
syncTimeToMinute();

// function checkAndHandleMonthChange() {
//     const now = new Date();
//     const currentMonth = now.getMonth();
//     const currentYear = now.getFullYear();
//     const currentKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    
//     const lastMonthKey = localStorage.getItem("lastSavedMonth");
    
//     if (lastMonthKey && lastMonthKey !== currentKey) {
//         // Save final budget snapshot
//         const finalSnapshot = document.getElementById("budget-body").innerHTML;
//         localStorage.setItem(`finalBudget_${lastMonthKey}`, finalSnapshot);
        
//         // Ask user to download summary
//         if (confirm(`Download budget summary for ${lastMonthKey}?`)) {
//             const wrapper = document.createElement("table");
//             wrapper.innerHTML = `
//             <thead><tr><th>Type</th><th>Spent ($)</th><th>Remaining ($)</th><th>% Used</th><th>Usage vs Allocated</th></tr></thead>
//             <tbody>${finalSnapshot}</tbody>
//             `;
//             const blob = new Blob([wrapper.outerHTML], { type: "text/html" });
//             const a = document.createElement("a");
//             a.href = URL.createObjectURL(blob);
//             a.download = `budget-summary-${lastMonthKey}.html`;
//             a.click();
//             URL.revokeObjectURL(a.href);
//         }
        
//         // Clear all spent category values
//         expenses = [];
//         undoStack = [];
//         saveExpenses();
//     }
    
//     // Update the last saved month key
//     localStorage.setItem("lastSavedMonth", currentKey);
// }

// function showPastBudgetSnapshots() {
//     const view = document.getElementById("snapshot-view");
//     view.innerHTML = "<h3>Saved Budget Summaries</h3>";
    
//     Object.keys(localStorage).forEach(key => {
//         if (key.startsWith("finalBudget_")) {
//             const date = key.replace("finalBudget_", "");
//             const button = document.createElement("button");
//             button.textContent = `📅 ${date}`;
//             button.onclick = () => {
//                 const html = localStorage.getItem(key);
//                 const wrapper = document.createElement("div");
//                 wrapper.innerHTML = `<h4>${date}</h4><table><thead><tr><th>Type</th><th>Spent ($)</th><th>Remaining ($)</th><th>% Used</th><th>Usage vs Allocated</th></tr></thead><tbody>${html}</tbody></table>`;
//                 view.appendChild(wrapper);
//                 wrapper.scrollIntoView({ behavior: "smooth" });
//             };
//             view.appendChild(button);
//         }
//     });
    
//     if (view.innerHTML === "<h3>Saved Budget Summaries</h3>") {
//         view.innerHTML += "<p>No saved snapshots found.</p>";
//     }
// }

// 🔘 [Modal] Handle Done Button to Close Edit Category Modal
// Close on "✅ Done" at top-right
document.addEventListener("DOMContentLoaded", function () {
  // === Sidebar Setup ===
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("nav-overlay");
  const menuToggle = document.getElementById("menu-toggle");

  function openSidebar() {
    sidebar.classList.add("nav-open");
    overlay.style.display = "block";
    menuToggle.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    sidebar.classList.remove("nav-open");
    overlay.style.display = "none";
    menuToggle.setAttribute("aria-expanded", "false");
  }

  menuToggle.addEventListener("click", function (event) {
    event.stopPropagation();
    const isOpen = sidebar.classList.contains("nav-open");
    isOpen ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener("click", closeSidebar);

  // 🆕 Force-close sidebar on page load
  closeSidebar();

  // === Load Saved Categories ===
  const savedLimits = localStorage.getItem("categoryLimits");
  const savedKinds = localStorage.getItem("categoryKinds");
  if (savedLimits) Object.assign(categoryLimits, JSON.parse(savedLimits));
  if (savedKinds) Object.assign(categoryKinds, JSON.parse(savedKinds));

  // === Confirm Edit Modal Logic ===
  function confirmEditFixedCategory(callback) {
    const modal = document.getElementById("confirm-edit-fixed-modal");
    const confirmBtn = document.getElementById("confirm-edit-fixed-btn");

    modal.style.display = "block";
    const handleConfirm = () => {
      modal.style.display = "none";
      confirmBtn.removeEventListener("click", handleConfirm);
      callback();
    };
    confirmBtn.addEventListener("click", handleConfirm);
  }

  function closeFixedEditConfirmModal() {
    document.getElementById("confirm-edit-fixed-modal").style.display = "none";
  }

  // === Restore Selected History View and Date ===
  refreshHistoryView();

  // === Render Initial Data ===
  renderCategoryDropdown();
  updateRemainingBudget();

  // === Render Recycle bin ===
  renderRecycleBin();

});





  // ➕ [Add Category] Show Confirmation Popup
  // const categoryForm = document.getElementById("category-form");
  // categoryForm.addEventListener("submit", function (e) {
  //   e.preventDefault();

  //   const name = document.getElementById("new-type-name").value.trim();
  //   const kind = document.getElementById("new-type-kind").value;
  //   const limit = parseFloat(document.getElementById("new-type-limit").value);

  //   if (!name || isNaN(limit) || limit < 0) {
  //     yemToast("Please enter a valid name and limit.");
  //     return;
  //   }

  //   if (categoryLimits[name]) {
  //     yemToast("This category already exists.");
  //     return;
  //   }

  //   window.tempNewType = { name, kind, limit };

  //   const confirmBox = document.getElementById("confirm-add-type-modal");
  //   const details = document.getElementById("confirm-type-details");
  //   details.innerHTML = `<b>Name:</b> ${name}<br><b>Kind:</b> ${kind}<br><b>Limit:</b> $${limit.toFixed(2)}`;
  //   confirmBox.style.display = "block";
  // });

// UPPER ONE IS CHANGED TO AS BELOW

const categoryForm = document.getElementById("category-form");

if (categoryForm) {
  categoryForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const name = document.getElementById("new-type-name").value.trim();
    const kind = document.getElementById("new-type-kind").value;
    const limit = parseFloat(
      document.getElementById("new-type-limit").value
    );

    if (!name || isNaN(limit) || limit < 0) {
      yemToast("Please enter a valid name and limit.");
      return;
    }

    if (categoryLimits[name]) {
      yemToast("This category already exists.");
      return;
    }

    window.tempNewType = {
      name,
      kind,
      limit
    };

    const confirmBox = document.getElementById(
      "confirm-add-type-modal"
    );

    const details = document.getElementById(
      "confirm-type-details"
    );

    details.innerHTML = `
      <b>Name:</b> ${name}<br>
      <b>Kind:</b> ${kind}<br>
      <b>Limit:</b> $${limit.toFixed(2)}
    `;

    confirmBox.style.display = "block";
  });
}

  // 📅 [Footer Year Auto Update]
  const yearSpan = document.getElementById("current-year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
// });



// Helper Functions to Confirm/Add/Close
// if (confirmAddBtn) {
//   confirmAddBtn.addEventListener("click", function () {
//     if (!window.tempNewType) return;

//   const { name, kind, limit } = window.tempNewType;

//   // ✅ Add to categories
//   categoryLimits[name] = limit;
//   categoryKinds[name] = kind;

//   // ✅ Save everything (including categories)
//   saveExpenses();

//  // ✅ Refresh every relevant page
// renderCategoryDropdown();
// updateRemainingBudget();

// if (typeof renderCategoryManagementList === "function") {
//   renderCategoryManagementList();
// }

//   // ✅ Clear form inputs
//   document.getElementById("new-type-name").value = "";
//   document.getElementById("new-type-limit").value = "";

//   // ✅ Close modal
//   closeConfirmAddTypeModal();

//   // ✅ Clear temp state
//   window.tempNewType = null;

//   // ✅ Feedback (optional)
//   yemToast(`✅ "${name}" (${kind}) added with $${limit.toFixed(2)} limit.`);
// });

const confirmAddBtn = document.getElementById("confirm-add-type-btn");


  
  
// }

// const confirmAddBtn = document.getElementById("confirm-add-type-btn");

if (confirmAddBtn) {
  confirmAddBtn.addEventListener("click", function () {
    if (!window.tempNewType) return;

    const { name, kind, limit } = window.tempNewType;

    // Add category
    categoryLimits[name] = limit;
    categoryKinds[name] = kind;

    // Save categories
    saveExpenses();

    // Refresh Home-page elements
    renderCategoryDropdown();
    updateRemainingBudget();

    // Refresh Categories page
    if (typeof renderCategoryManagementList === "function") {
      renderCategoryManagementList();
    }

    // Clear form inputs
    const nameInput = document.getElementById("new-type-name");
    const limitInput = document.getElementById("new-type-limit");

    if (nameInput) {
      nameInput.value = "";
    }

    if (limitInput) {
      limitInput.value = "";
    }

    // Close modal
    closeConfirmAddTypeModal();

    // Clear temporary category
    window.tempNewType = null;

    yemToast(
      `✅ "${name}" (${kind}) added with $${limit.toFixed(2)} limit.`
    );
  });
}

function closeConfirmAddTypeModal() {
  const modal = document.getElementById("confirm-add-type-modal");
  if (modal) modal.style.display = "none";
}


// Submit form with Enter key or "Apply" button for changing esixting category
const editCategoryForm = document.getElementById("edit-category-form");

if (editCategoryForm) {
  editCategoryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    applyCategoryEdit();
  });
}

// 🚀 Press Enter to Apply + Close Modal
document.addEventListener("keydown", function (event) {
  const modal = document.getElementById("edit-category-modal");
  if (modal && modal.style.display === "block" && event.key === "Enter") {
    event.preventDefault(); // Prevent form submission
    applyCategoryEdit();
  }
});

// MODAL🖱️ Close the popup when user clicks on the background overlay
document.getElementById("modal-overlay").addEventListener("click", closeCategoryExpenseModal);


// 📊 Show Yearly, Half-Yearly, and Quarterly Averages for each category
// 📊 Calculates and populates Yearly, Half-Yearly, and Quarterly Averages
/*function showAverages() {
  const now = new Date();

  // 🗓️ Define time ranges
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(now.getMonth() - 6);

  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(now.getMonth() - 3);

  // 📦 Initialize totals and counts for each category
  const categoryTotals = {};
  const categoryCounts = {
    yearly: {},
    halfYearly: {},
    quarterly: {}
  };

  // 🔄 Loop through all expenses to accumulate totals and counts
  expenses.forEach(exp => {
    if (!categoryTotals[exp.category]) {
      categoryTotals[exp.category] = { yearly: 0, halfYearly: 0, quarterly: 0 };
      categoryCounts.yearly[exp.category] = 0;
      categoryCounts.halfYearly[exp.category] = 0;
      categoryCounts.quarterly[exp.category] = 0;
    }

    const expDate = new Date(exp.date);

    // 📅 Yearly
    if (expDate >= oneYearAgo) {
      categoryTotals[exp.category].yearly += exp.amount;
      categoryCounts.yearly[exp.category]++;
    }

    // 📆 Half-Yearly
    if (expDate >= sixMonthsAgo) {
      categoryTotals[exp.category].halfYearly += exp.amount;
      categoryCounts.halfYearly[exp.category]++;
    }

    // 📌 Quarterly
    if (expDate >= threeMonthsAgo) {
      categoryTotals[exp.category].quarterly += exp.amount;
      categoryCounts.quarterly[exp.category]++;
    }
  });

  // 📝 Populate the averages table
  const tbody = document.querySelector("#averages-table tbody");
  tbody.innerHTML = ""; // Clear previous rows

  Object.keys(categoryTotals).forEach(category => {
    const yearlyAvg = categoryCounts.yearly[category]
      ? (categoryTotals[category].yearly / categoryCounts.yearly[category]).toFixed(2)
      : "0.00";

    const halfYearlyAvg = categoryCounts.halfYearly[category]
      ? (categoryTotals[category].halfYearly / categoryCounts.halfYearly[category]).toFixed(2)
      : "0.00";

    const quarterlyAvg = categoryCounts.quarterly[category]
      ? (categoryTotals[category].quarterly / categoryCounts.quarterly[category]).toFixed(2)
      : "0.00";

    // 📦 Add row to the table
    const row = `
      <tr>
        <td>${category}</td>
        <td>$${yearlyAvg}</td>
        <td>$${halfYearlyAvg}</td>
        <td>$${quarterlyAvg}</td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}*/

// 📊 Show Full View Averages (Q1–Q4, H1–H2, Yearly)
// 📊 Calculates and populates Per Month Averages for Yearly, Half-Yearly, and Quarterly
// 📊 Show Full View Averages (Q1–Q4, H1–H2, Yearly) with zero-check fix
function showAverages() {
  const now = new Date();
  const currentYear = now.getFullYear();

  // 🗓️ Define quarters and halves
  const quarters = {
    Q1: [0, 1, 2],   // Jan, Feb, Mar
    Q2: [3, 4, 5],   // Apr, May, Jun
    Q3: [6, 7, 8],   // Jul, Aug, Sep
    Q4: [9, 10, 11]  // Oct, Nov, Dec
  };

  const halves = {
    H1: [0, 1, 2, 3, 4, 5],  // Jan–Jun
    H2: [6, 7, 8, 9, 10, 11] // Jul–Dec
  };

  // 📦 Initialize monthly totals per category
  const monthlyTotals = {}; // { category: [month0, month1, ..., month11] }

  Object.keys(categoryLimits).forEach(category => {
    monthlyTotals[category] = Array(12).fill(0);
  });

  // 🔄 Loop through all expenses and sum totals per category per month
  expenses.forEach(exp => {
    const expDate = new Date(exp.date);
    if (expDate.getFullYear() === currentYear) {
      const monthIndex = expDate.getMonth(); // 0 = Jan, 11 = Dec
      const category = exp.category;
      if (!monthlyTotals[category]) {
        monthlyTotals[category] = Array(12).fill(0);
      }
      monthlyTotals[category][monthIndex] += exp.amount;
    }
  });

  // 📝 Populate the averages table
  const tbody = document.querySelector("#averages-table tbody");
  tbody.innerHTML = ""; // Clear previous rows

  Object.keys(monthlyTotals).forEach(category => {
    const totals = monthlyTotals[category];

    // 📊 Compute Quarter Averages (Q1–Q4)
    const qAverages = Object.values(quarters).map(q => {
      const quarterTotal = q.reduce((sum, m) => sum + totals[m], 0);
      const hasExpenses = q.some(m => totals[m] > 0);
      return hasExpenses ? (quarterTotal / 3).toFixed(2) : "0.00";
    });

    // 📊 Compute Half-Year Averages (H1 & H2)
    const hAverages = Object.values(halves).map(h => {
      const halfTotal = h.reduce((sum, m) => sum + totals[m], 0);
      const hasExpenses = h.some(m => totals[m] > 0);
      return hasExpenses ? (halfTotal / 6).toFixed(2) : "0.00";
    });

    // 📊 Compute Yearly Average
    const yearlyTotal = totals.reduce((sum, val) => sum + val, 0);
    const hasYearlyExpenses = yearlyTotal > 0;
    const yearlyAvg = hasYearlyExpenses ? (yearlyTotal / 12).toFixed(2) : "0.00";

    // 📦 Add row to the table
    const row = `
      <tr>
        <td>${category}</td>
        <td>$${qAverages[0]}</td>
        <td>$${qAverages[1]}</td>
        <td>$${qAverages[2]}</td>
        <td>$${qAverages[3]}</td>
        <td>$${hAverages[0]}</td>
        <td>$${hAverages[1]}</td>
        <td>$${yearlyAvg}</td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}


// 📊 Toggle the Averages Section with Smooth Animation
function toggleAverages() {
  const section = document.getElementById("averages-section");
  const btn = document.getElementById("view-averages-btn");

  if (section.style.display === "none" || section.style.display === "") {
    // ▶️ Show section
    showAverages(); // Populate data
    section.style.display = "block"; // Make visible
    setTimeout(() => {
      section.classList.add("show"); // Fade in
    }, 10);
    btn.textContent = "🔽 Hide Category Averages";
    section.scrollIntoView({ behavior: "smooth" });
  } else {
    // ⏹ Hide section
    section.classList.remove("show"); // Start fade out
    setTimeout(() => {
      section.style.display = "none"; // Fully hide after fade out
    }, 300); // Match CSS transition time
    btn.textContent = "📊 View Category Averages";
  }
}



// ==== Initial Load ====
// 🔧 Initial setup: save current data and show current month/year view
saveExpenses();   // Already present
populateYearDropdown(); // Make sure it's called here
document.getElementById("month-select").value = new Date().getMonth(); // ✅ Set current month
updateRemainingBudget();
refreshHistoryView();
