(function () {
  var scriptEl = document.currentScript;
  var businessId = scriptEl.getAttribute("data-business-id");
  var origin = new URL(scriptEl.src).origin;

  if (!businessId) {
    console.error("[chat widget] missing data-business-id on the embed script tag");
    return;
  }

  var sessionKey = "chatSessionId:" + businessId;
  var sessionId = window.localStorage.getItem(sessionKey);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.localStorage.setItem(sessionKey, sessionId);
  }

  var button = document.createElement("button");
  button.textContent = "Chat";
  button.setAttribute("style", [
    "position:fixed", "bottom:20px", "right:20px", "z-index:999999",
    "padding:12px 20px", "border-radius:24px", "border:none",
    "background:#222", "color:#fff", "font-size:14px", "cursor:pointer",
    "box-shadow:0 2px 8px rgba(0,0,0,.3)",
  ].join(";"));

  var panel = document.createElement("div");
  panel.setAttribute("style", [
    "position:fixed", "bottom:76px", "right:20px", "z-index:999999",
    "width:320px", "height:420px", "background:#fff", "color:#111",
    "border-radius:12px", "box-shadow:0 4px 20px rgba(0,0,0,.3)",
    "display:none", "flex-direction:column", "overflow:hidden",
    "font-family:system-ui,sans-serif", "font-size:13px",
  ].join(";"));

  var log = document.createElement("div");
  log.setAttribute("style", "flex:1;overflow-y:auto;padding:12px;");
  panel.appendChild(log);

  var inputRow = document.createElement("div");
  inputRow.setAttribute("style", "display:flex;border-top:1px solid #eee;");
  var input = document.createElement("input");
  input.placeholder = "Ask something…";
  input.setAttribute("style", "flex:1;border:none;padding:10px;font-size:13px;outline:none;");
  var send = document.createElement("button");
  send.textContent = "Send";
  send.setAttribute("style", "border:none;background:#222;color:#fff;padding:0 14px;cursor:pointer;");
  inputRow.appendChild(input);
  inputRow.appendChild(send);
  panel.appendChild(inputRow);

  document.body.appendChild(panel);
  document.body.appendChild(button);

  button.addEventListener("click", function () {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
  });

  function addMessage(role, text) {
    var row = document.createElement("div");
    row.setAttribute("style", "margin-bottom:8px;");
    row.innerHTML = "<strong>" + (role === "user" ? "You" : "Assistant") + ":</strong> " + text;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function sendMessage() {
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    addMessage("user", text);

    fetch(origin + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId, message: text, businessId: businessId }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        addMessage("assistant", data.answer || ("Error: " + (data.detail || data.error)));
      })
      .catch(function (err) {
        addMessage("assistant", "Error: " + err);
      });
  }

  send.addEventListener("click", sendMessage);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendMessage();
  });
})();
