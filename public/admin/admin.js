(function () {
  "use strict";
  var list = document.getElementById("admin-orders"), message = document.getElementById("admin-message");
  var reload = document.getElementById("reload-orders");
  var apiBase = window.location.pathname.indexOf("/shop/") === 0 ? "/shop/api" : "/api";
  var statuses = [["new","New request"],["quoted","GBP quotation sent"],["awaiting_payment","Awaiting payment"],["paid","Paid — manually confirmed"],["fulfilled","Fulfilled"],["cancelled","Cancelled"]];
  function node(tag, cls, value) { var el=document.createElement(tag); if(cls) el.className=cls; if(value!==undefined&&value!==null) el.textContent=value; return el; }
  async function load() {
    message.textContent="Loading…"; list.replaceChildren(node("p","admin-empty","Loading order requests…"));
    try {
      var response=await fetch(apiBase+"/admin/orders",{credentials:"same-origin",cache:"no-store"}), result=await response.json();
      if(!response.ok) throw new Error(result.error||"Could not load order requests.");
      list.replaceChildren(); if(!result.orders.length) list.append(node("p","admin-empty","No order requests yet."));
      result.orders.forEach(renderOrder); message.textContent=result.orders.length+" request(s) loaded.";
    } catch(error) { list.replaceChildren(node("p","admin-empty",error.message||"Could not load order requests.")); message.textContent=""; }
  }
  function renderOrder(order) {
    var card=node("article","admin-order");
    card.append(node("h2","",order.order_ref+" · "+order.customer_name));
    card.append(node("p","admin-meta",new Date(order.created_at).toLocaleString("en-GB")+" · "+order.customer_email+" · "+order.delivery_postcode+", "+order.delivery_country+" · "+order.status.replaceAll("_"," ")));
    var items=node("ul","admin-items");
    order.items.forEach(function(item){items.append(node("li","",item.product_title+" × "+item.quantity));}); card.append(items);
    if(order.customer_note) card.append(node("p","admin-meta","Customer note: "+order.customer_note));
    if(order.paid_at) card.append(node("p","admin-meta","Payment manually marked received: "+new Date(order.paid_at).toLocaleString("en-GB")));
    if(order.fulfilled_at) card.append(node("p","admin-meta","Fulfilled: "+new Date(order.fulfilled_at).toLocaleString("en-GB")));
    var controls=node("div","admin-controls"), statusLabel=node("label","","Status"), status=document.createElement("select");
    statuses.forEach(function(pair){var opt=document.createElement("option");opt.value=pair[0];opt.textContent=pair[1];opt.selected=pair[0]===order.status;status.append(opt);}); statusLabel.append(status);
    var quoteLabel=node("label","","Quoted total (GBP)"), quote=document.createElement("input");
    quote.type="number";quote.min="0.01";quote.max="100000";quote.step="0.01";quote.placeholder="Not quoted";
    quote.value=order.quoted_total_pence===null?"":(order.quoted_total_pence/100).toFixed(2);quoteLabel.append(quote);controls.append(statusLabel,quoteLabel);
    var noteLabel=node("label","admin-note","Internal note"), note=document.createElement("textarea");note.rows=2;note.maxLength=1000;note.value=order.admin_note||"";noteLabel.append(note);
    var actions=node("div","admin-actions"), save=node("button","","Save changes");save.type="button";
    save.addEventListener("click",async function(){
      if(status.value==="paid"&&order.status!=="paid"&&!window.confirm("Only continue if cleared funds have been confirmed outside this system. Mark this request as paid?"))return;
      var pounds=quote.value.trim(),pence=pounds?Math.round(Number(pounds)*100):null;
      if(pounds&&(!Number.isFinite(Number(pounds))||pence<1)){message.textContent="Enter a valid GBP quotation.";return;}
      save.disabled=true;
      try{
        var response=await fetch(apiBase+"/admin/orders",{method:"PATCH",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({id:order.id,status:status.value,quotedTotalPence:pence,adminNote:note.value})});
        var result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"Could not save changes.");
        message.textContent="Saved "+order.order_ref+".";await load();
      }catch(error){message.textContent=error.message||"Could not save changes.";}finally{save.disabled=false;}
    });
    actions.append(save);card.append(controls,noteLabel,actions);
    if(order.events&&order.events.length){var latest=order.events[0];card.append(node("p","admin-meta","Last recorded action: "+latest.event_type.replaceAll("_"," ")+" · "+new Date(latest.created_at).toLocaleString("en-GB")));}
    list.append(card);
  }
  reload.addEventListener("click",load);load();
})();
