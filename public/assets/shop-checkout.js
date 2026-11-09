(function () {
  "use strict";
  var grid = document.getElementById("shop-grid");
  var basketLines = document.getElementById("shop-basket-lines");
  var empty = document.getElementById("shop-basket-empty");
  var form = document.getElementById("shop-order-form");
  var feedback = document.getElementById("shop-order-feedback");
  if (!grid || !basketLines || !form || !feedback) return;
  var basket = new Map();
  var apiBase = window.location.pathname.indexOf("/shop/") === 0 ? "/shop/api" : "/api";
  function make(tag, className, value) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  }
  function render() {
    basketLines.replaceChildren();
    var entries = Array.from(basket.values());
    empty.hidden = entries.length > 0;
    form.hidden = entries.length === 0;
    entries.forEach(function (item) {
      var line = make("div", "sh-basket-line");
      line.append(make("strong", "", item.title));
      var quantity = document.createElement("input");
      quantity.type = "number"; quantity.min = "1"; quantity.max = "5"; quantity.step = "1";
      quantity.value = String(item.quantity);
      quantity.setAttribute("aria-label", "Quantity for " + item.title);
      quantity.addEventListener("change", function () { item.quantity = Math.max(1, Math.min(5, Number(quantity.value) || 1)); render(); });
      var remove = make("button", "sh-remove", "Remove"); remove.type = "button";
      remove.addEventListener("click", function () { basket.delete(item.id); render(); });
      line.append(quantity, remove); basketLines.append(line);
    });
  }
  grid.addEventListener("click", function (event) {
    var button = event.target.closest("[data-add-to-basket]");
    if (!button) return;
    var id = button.getAttribute("data-product-id");
    var card = button.closest(".sh-card");
    var titleNode = card && card.querySelector("h3");
    if (!id || !titleNode) return;
    var item = basket.get(id);
    if (item) item.quantity = Math.min(5, item.quantity + 1);
    else basket.set(id, { id: id, title: titleNode.textContent.trim(), quantity: 1 });
    feedback.textContent = ""; render();
    document.getElementById("basket").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!basket.size || !form.reportValidity()) return;
    var submit = form.querySelector("[type=submit]");
    var data = new FormData(form);
    var payload = {
      customerName: data.get("customerName"), customerEmail: data.get("customerEmail"),
      deliveryCountry: data.get("deliveryCountry"), deliveryPostcode: data.get("deliveryPostcode"),
      customerNote: data.get("customerNote"), acceptRequest: data.get("acceptRequest") === "on",
      website: data.get("website"),
      items: Array.from(basket.values()).map(function (item) { return { productId: item.id, quantity: item.quantity }; })
    };
    submit.disabled = true; feedback.textContent = "Sending your request…";
    try {
      var response = await fetch(apiBase + "/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin"
      });
      var result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "The request could not be sent.");
      feedback.textContent = result.message + " Reference: " + result.orderRef;
      basket.clear(); form.reset(); render();
      feedback.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      feedback.textContent = error.message || "The request could not be sent. Please try again.";
    } finally { submit.disabled = false; }
  });
  render();
})();
