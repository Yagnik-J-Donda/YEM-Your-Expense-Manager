// viewToggle.js
// Fullscreen toggle + layout expansion hook via `app-fullscreen` class on <html>

(function () {
  const btn = document.getElementById("toggle-view-btn");
  if (!btn) return;

  // Helper: are we currently in fullscreen?
  function inFullscreen() {
    return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
  }

  // Enter fullscreen for the whole page
  function enterFullscreen() {
    const el = document.documentElement; // <html>
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(); // Safari
    else if (el.msRequestFullscreen) el.msRequestFullscreen(); // IE/old Edge
  }

  // Exit fullscreen
  function exitFullscreen() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); // Safari
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }

  // Update UI when fullscreen changes (button label + layout class)
  function onFsChange() {
    const isFS = inFullscreen();

    // Toggle a class on <html> so CSS can expand container/table
    document.documentElement.classList.toggle("app-fullscreen", isFS);

    // Button label
    btn.textContent = isFS ? "🗕 Minimize" : "⛶ Maximize";
  }

  // Click handler
  btn.addEventListener("click", () => {
    if (inFullscreen()) exitFullscreen();
    else enterFullscreen();
  });

  // Listen for FS change across browsers
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  document.addEventListener("msfullscreenchange", onFsChange);

  // Initialize correct state on load (edge cases)
  onFsChange();
})();
