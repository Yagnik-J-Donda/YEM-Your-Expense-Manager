// ==============================
// ✅ User Authentication Logic
// ==============================

// 🔥 Open the authentication modal
function openAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.style.display = "block";
}

// ❌ Close the authentication modal
function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.style.display = "none";
}

// 🆕 Sign Up New User
function signUp() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    alert("⚠ Please enter both username and password.");
    return;
  }

  let users = JSON.parse(localStorage.getItem("users") || "{}");

  if (users[username]) {
    alert("⚠ Username already exists. Please sign in.");
    return;
  }

  // Save new user with empty expenses
  users[username] = { password, expenses: [] };
  localStorage.setItem("users", JSON.stringify(users));

  // ✅ Transfer guest expenses
  assignGuestExpensesToUser(username);

  // 👇 Update UI instantly
  localStorage.setItem("currentUser", username);
  loadUserExpenses(username);
  updateAuthUI();
  renderExpenses();
  applyUIFixes(); // 👈 Fix spacing/margins after render

  closeAuthModal();
  clearAuthFields();
  alert("✅ Sign Up successful!");
}


// 🔓 Sign In Existing User
function signIn() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  let users = JSON.parse(localStorage.getItem("users") || "{}");

  if (!users[username] || users[username].password !== password) {
    alert("❌ Invalid username or password.");
    return;
  }

  // ✅ Transfer guest expenses
  assignGuestExpensesToUser(username);

  // 👇 Update UI instantly
  localStorage.setItem("currentUser", username);
  loadUserExpenses(username);
  updateAuthUI();
  renderExpenses();
  applyUIFixes(); // 👈 Fix spacing/margins after render

  closeAuthModal();
  clearAuthFields();
  alert("✅ Welcome back, " + username + "!");
}


// 🚪 Logout Current User
function logout() {
  localStorage.removeItem("currentUser");
  expenses = [];
  saveExpenses();

  updateAuthUI();
  renderExpenses();
  applyUIFixes(); // 👈 Fix spacing/margins after render
  alert("👋 Logged out successfully.");
}


// 🔄 Update UI based on authentication state
function updateAuthUI() {
  const currentUser = localStorage.getItem("currentUser");
  const authButton = document.getElementById("auth-button");
  const currentUserSpan = document.getElementById("current-user");
  const logoutButton = document.getElementById("logout-button");

  if (currentUser) {
    authButton.style.display = "none";
    currentUserSpan.textContent = `Welcome, ${currentUser}`;
    currentUserSpan.style.display = "inline-block";
    logoutButton.style.display = "inline-block";
  } else {
    authButton.style.display = "inline-block";
    currentUserSpan.style.display = "none";
    logoutButton.style.display = "none";
  }
}

// 📦 Load expenses for the logged-in user
function loadUserExpenses(username) {
  let users = JSON.parse(localStorage.getItem("users") || "{}");

  if (users[username]) {
    expenses = users[username].expenses || [];
  } else {
    expenses = [];
  }

  saveExpenses();     // Save to localStorage
  renderExpenses();   // 📝 Update UI
}

// 💾 Save current user's expenses (or guest)
function saveExpenses() {
  let users = JSON.parse(localStorage.getItem("users") || "{}");
  const currentUser = localStorage.getItem("currentUser");

  if (currentUser && users[currentUser]) {
    users[currentUser].expenses = expenses;
    localStorage.setItem("users", JSON.stringify(users));
  } else {
    localStorage.setItem("guest_expenses", JSON.stringify(expenses)); // Guest mode
  }
}

// 🧹 Clear input fields in the modal
function clearAuthFields() {
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
}

// 🏃 Transfer guest expenses to user account
function assignGuestExpensesToUser(username) {
  let users = JSON.parse(localStorage.getItem("users") || "{}");
  let guestExpenses = JSON.parse(localStorage.getItem("guest_expenses") || "[]");

  if (guestExpenses.length > 0) {
    if (!users[username].expenses) {
      users[username].expenses = [];
    }
    users[username].expenses = users[username].expenses.concat(guestExpenses);
    localStorage.setItem("users", JSON.stringify(users));
    localStorage.removeItem("guest_expenses"); // Clear guest data
  }
}

// 🚀 Initialize UI on page load
document.addEventListener("DOMContentLoaded", () => {
  updateAuthUI();

  const currentUser = localStorage.getItem("currentUser");
  if (currentUser) {
    loadUserExpenses(currentUser);
  } else {
    expenses = JSON.parse(localStorage.getItem("guest_expenses") || "[]");
    renderExpenses();
  }
});

  // ✅ Trigger Sign In when Enter key pressed in modal
  document.getElementById("auth-modal").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      signIn();
    }
  });