(function () {
  "use strict";

  const storage = window.localStorage;
  const prototype = Storage.prototype;
  const originalGetItem = prototype.getItem;
  const originalSetItem = prototype.setItem;
  const originalRemoveItem = prototype.removeItem;
  const guestModeKey = "yemGuestMode";
  const guestPrefix = "yemGuest:";
  const guestActive = originalGetItem.call(storage, guestModeKey) === "true";

  if (!guestActive) return;

  function scopedKey(key) {
    const normalized = String(key);
    if (normalized === guestModeKey || normalized.startsWith("sb-") || normalized.startsWith(guestPrefix)) return normalized;
    return `${guestPrefix}${normalized}`;
  }

  prototype.getItem = function (key) {
    return originalGetItem.call(this, this === storage ? scopedKey(key) : key);
  };

  prototype.setItem = function (key, value) {
    return originalSetItem.call(this, this === storage ? scopedKey(key) : key, value);
  };

  prototype.removeItem = function (key) {
    return originalRemoveItem.call(this, this === storage ? scopedKey(key) : key);
  };

  window.YEM_GUEST_STORAGE_ACTIVE = true;
})();
