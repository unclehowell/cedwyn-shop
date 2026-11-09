(function () {
  "use strict";
  var KEY = "cedwyn-shop-size";
  var SIZES = ["s", "m", "l"];
  var grid = document.getElementById("shop-grid");
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".sh-view-b"));
  if (!grid || !buttons.length) return;

  function savedSize() {
    try {
      var value = localStorage.getItem(KEY);
      return SIZES.indexOf(value) >= 0 ? value : "m";
    } catch (error) {
      return "m";
    }
  }

  function setSize(size, remember) {
    if (SIZES.indexOf(size) < 0) return;
    SIZES.forEach(function (value) {
      grid.classList.toggle("sh-size-" + value, value === size);
    });
    buttons.forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-size") === size ? "true" : "false");
    });
    if (remember) {
      try { localStorage.setItem(KEY, size); } catch (error) { /* Storage may be disabled. */ }
    }
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      setSize(button.getAttribute("data-size"), true);
    });
  });

  setSize(savedSize(), false);
})();