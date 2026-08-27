(function () {
  var scriptEl = document.currentScript;
  var businessId = scriptEl.getAttribute("data-business-id");
  var origin = new URL(scriptEl.src).origin;

  if (!businessId) {
    console.error("[chat widget] missing data-business-id on the embed script tag");
    return;
  }

  // Deliberately NOT persisted (no localStorage/sessionStorage) -- a
  // fresh conversation every page load/tab refresh, owner's explicit
  // call. Trade-off: a customer who accidentally reloads mid-chat loses
  // that conversation's history and starts over with the bot, even if a
  // human had already picked it up.
  var sessionId = crypto.randomUUID();

  // Every visual/copy option lives server-side (WidgetConfig, edited from
  // the client dashboard's Integrations tab) — nothing here is hardcoded
  // per business, so this one script tag never needs to change when a
  // client tweaks their widget's look.
  fetch(origin + "/api/widget-config?businessId=" + encodeURIComponent(businessId))
    .then(function (res) { return res.json(); })
    .then(function (config) { build(config || {}); })
    .catch(function () { build({}); });

  function build(config) {
    var accent = config.accentColor || "#8b7cf6";
    var position = config.position === "bottom-left" ? "left" : "right";
    var dark = config.theme === "dark";
    var panelBg = dark ? "#161b22" : "#ffffff";
    var panelText = dark ? "#e6edf3" : "#111111";
    var headerText = config.headerText || "Chat with us";
    var launcherText = config.launcherText || "Chat";
    var greeting = config.greeting || "Hi! How can I help you today?";
    var avatarUrl = config.avatarUrl || "";
    var showBranding = config.showBranding !== false;

    var launcher = document.createElement("button");
    launcher.setAttribute("aria-label", "Open chat");
    launcher.innerHTML =
      (avatarUrl ? '<img src="' + escapeAttr(avatarUrl) + '" style="width:22px;height:22px;border-radius:50%;object-fit:cover;margin-right:8px;vertical-align:-6px" />' : "") +
      escapeHtml(launcherText);
    launcher.setAttribute("style", [
      "position:fixed", "bottom:20px", position + ":20px", "z-index:999999",
      "padding:12px 20px", "border-radius:999px", "border:none",
      "background:" + accent, "color:#fff", "font-size:14px", "font-family:system-ui,sans-serif",
      "cursor:pointer", "box-shadow:0 4px 16px rgba(0,0,0,.25)",
      "transition:transform .15s ease",
    ].join(";"));
    launcher.addEventListener("mouseenter", function () { launcher.style.transform = "scale(1.04)"; });
    launcher.addEventListener("mouseleave", function () { launcher.style.transform = "scale(1)"; });

    var panel = document.createElement("div");
    panel.setAttribute("style", [
      "position:fixed", "bottom:80px", position + ":20px", "z-index:999999",
      "width:340px", "max-width:92vw", "height:460px", "max-height:75vh",
      "background:" + panelBg, "color:" + panelText,
      "border-radius:14px", "box-shadow:0 10px 40px rgba(0,0,0,.35)",
      "display:none", "flex-direction:column", "overflow:hidden",
      "font-family:system-ui,sans-serif", "font-size:13px",
      "border:1px solid " + (dark ? "#30363d" : "#e5e7eb"),
    ].join(";"));

    var header = document.createElement("div");
    header.setAttribute("style", [
      "padding:14px 16px", "background:" + accent, "color:#fff",
      "font-weight:600", "font-size:14px", "display:flex", "align-items:center", "gap:8px",
    ].join(";"));
    if (avatarUrl) {
      var headerAvatar = document.createElement("img");
      headerAvatar.src = avatarUrl;
      headerAvatar.setAttribute("style", "width:24px;height:24px;border-radius:50%;object-fit:cover;");
      header.appendChild(headerAvatar);
    }
    var headerLabel = document.createElement("span");
    headerLabel.textContent = headerText;
    header.appendChild(headerLabel);
    panel.appendChild(header);

    var log = document.createElement("div");
    log.setAttribute("style", "flex:1;overflow-y:auto;padding:12px;");
    panel.appendChild(log);

    // Attached-photo preview strip — shown above the input row only while
    // a photo is staged (uploaded, not yet sent). "product query, send a
    // picture and ask price" needs the customer to see what they picked
    // before it goes out, same as any messaging app's attach flow.
    var attachedImageUrl = null;
    var attachPreview = document.createElement("div");
    attachPreview.setAttribute("style", "display:none;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid " + (dark ? "#30363d" : "#eee") + ";");
    var attachThumb = document.createElement("img");
    attachThumb.setAttribute("style", "width:36px;height:36px;border-radius:6px;object-fit:cover;");
    var attachLabel = document.createElement("span");
    attachLabel.textContent = "Photo attached";
    attachLabel.setAttribute("style", "font-size:12px;color:" + panelText + ";flex:1;");
    var attachRemove = document.createElement("button");
    attachRemove.textContent = "✕";
    attachRemove.setAttribute("style", "border:none;background:none;cursor:pointer;font-size:13px;color:" + panelText + ";opacity:.6;");
    attachRemove.addEventListener("click", function () { clearAttachment(); });
    attachPreview.appendChild(attachThumb);
    attachPreview.appendChild(attachLabel);
    attachPreview.appendChild(attachRemove);
    panel.appendChild(attachPreview);

    function clearAttachment() {
      attachedImageUrl = null;
      attachPreview.style.display = "none";
      fileInput.value = "";
    }

    var inputRow = document.createElement("div");
    inputRow.setAttribute("style", "display:flex;border-top:1px solid " + (dark ? "#30363d" : "#eee") + ";");

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp,image/gif";
    fileInput.setAttribute("style", "display:none;");
    var attachBtn = document.createElement("button");
    attachBtn.setAttribute("aria-label", "Attach a photo");
    attachBtn.textContent = "📷";
    attachBtn.setAttribute("style", "border:none;background:none;cursor:pointer;font-size:16px;padding:0 8px;color:" + panelText + ";");
    attachBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      attachLabel.textContent = "Uploading…";
      attachThumb.src = URL.createObjectURL(file);
      attachPreview.style.display = "flex";
      fetch(origin + "/api/chat/upload-image", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data.url) throw new Error(data.error || "Upload failed");
          attachedImageUrl = data.url;
          attachLabel.textContent = "Photo attached";
        })
        .catch(function () {
          attachLabel.textContent = "Couldn't attach photo — try again";
        });
    });

    var input = document.createElement("input");
    input.placeholder = "Ask something…";
    input.setAttribute("style", [
      "flex:1", "border:none", "padding:10px", "font-size:13px", "outline:none",
      "background:" + panelBg, "color:" + panelText,
    ].join(";"));
    var send = document.createElement("button");
    send.textContent = "Send";
    send.setAttribute("style", "border:none;background:" + accent + ";color:#fff;padding:0 16px;cursor:pointer;font-size:13px;");
    inputRow.appendChild(attachBtn);
    inputRow.appendChild(input);
    inputRow.appendChild(send);
    panel.appendChild(inputRow);

    if (showBranding) {
      var branding = document.createElement("div");
      branding.textContent = "Powered by AI Chat Platform";
      branding.setAttribute("style", "text-align:center;padding:4px;font-size:10px;opacity:.5;");
      panel.appendChild(branding);
    }

    if (!document.getElementById("cw-typing-style")) {
      var styleEl = document.createElement("style");
      styleEl.id = "cw-typing-style";
      styleEl.textContent =
        ".cw-typing-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;" +
        "background:currentColor;opacity:.4;animation:cw-typing-bounce 1.2s infinite ease-in-out}" +
        ".cw-typing-dots span:nth-child(2){animation-delay:.2s}" +
        ".cw-typing-dots span:nth-child(3){animation-delay:.4s}" +
        "@keyframes cw-typing-bounce{0%,60%,100%{opacity:.4;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}";
      document.head.appendChild(styleEl);
    }

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    // Not persisted (matches the fresh-session-per-load policy above) --
    // a plain in-memory var for the life of this page load. Soft default
    // only: the backend still switches to match whatever language the
    // customer's own message is actually written in, the moment it
    // differs (see chat-service.ts's languageHintInstruction).
    var preferredLanguage = null;

    var opened = false;
    launcher.addEventListener("click", function () {
      opened = !opened;
      panel.style.display = opened ? "flex" : "none";
      if (opened && log.children.length === 0) {
        if (greeting) addMessage("assistant", greeting);
        addLanguagePicker();
      }
    });

    function addLanguagePicker() {
      var row = document.createElement("div");
      row.setAttribute("style", "margin:4px 0 10px;display:flex;gap:8px;");

      function makeButton(label, code) {
        var btn = document.createElement("button");
        btn.textContent = label;
        btn.setAttribute("style", [
          "padding:6px 14px", "border-radius:999px", "font-size:12px", "cursor:pointer",
          "border:1px solid " + (dark ? "#30363d" : "#d0d7de"),
          "background:" + (dark ? "#21262d" : "#f1f3f5"), "color:" + panelText,
        ].join(";"));
        btn.addEventListener("click", function () {
          preferredLanguage = code;
          row.remove();
        });
        return btn;
      }

      row.appendChild(makeButton("English", "english"));
      row.appendChild(makeButton("বাংলা", "bangla"));
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }

    function addMessage(role, text, isHtml) {
      var row = document.createElement("div");
      row.setAttribute("style", "margin-bottom:8px;");
      var bubble = document.createElement("div");
      if (role === "user") {
        // isHtml is only ever set by sendMessage's own attached-photo
        // bubble, built from escapeAttr(imageUrl) — never from raw
        // customer-typed text, which always goes through textContent
        // below untouched.
        if (isHtml) {
          bubble.innerHTML = text;
        } else {
          bubble.textContent = text;
        }
      } else {
        bubble.innerHTML = formatMessage(text);
      }
      bubble.setAttribute("style", [
        "display:inline-block", "padding:8px 12px", "border-radius:12px", "max-width:85%",
        role === "user"
          ? "background:" + accent + ";color:#fff;float:right;"
          : "background:" + (dark ? "#21262d" : "#f1f3f5") + ";color:" + panelText + ";float:left;",
      ].join(";"));
      row.appendChild(bubble);
      var clear = document.createElement("div");
      clear.setAttribute("style", "clear:both;");
      row.appendChild(clear);
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }

    // A dropped mobile connection or a proxy hiccup fails the fetch itself
    // (no response at all) — that's different from the server's own
    // timeout/rotation handling in /api/chat, which already retries across
    // AI providers internally and always returns a friendly canned reply
    // with a normal 200 within its own 55s budget. This client-side retry
    // is the one path that server-side rotation can never cover, since the
    // request never arrived at all. Owner's call: taking up to a minute is
    // fine, a raw error in front of a real customer is not — so this keeps
    // retrying (with the typing indicator on) for a full minute before
    // ever falling back to the same friendly line the server itself uses.
    var CONNECTION_TROUBLE_MESSAGE = "We're having trouble connecting right now — a team member will follow up with you shortly.";
    var RETRY_BUDGET_MS = 75000;
    var RETRY_DELAY_MS = 2500;

    function postChat(text, imageUrl) {
      return fetch(origin + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId, message: text, businessId: businessId, languageHint: preferredLanguage, imageUrl: imageUrl }),
      }).then(function (res) { return res.json(); });
    }

    function postChatWithRetries(text, imageUrl, deadline) {
      return postChat(text, imageUrl).catch(function (err) {
        if (Date.now() >= deadline) throw err;
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(postChatWithRetries(text, imageUrl, deadline)); }, RETRY_DELAY_MS);
        });
      });
    }

    var typingRow = null;
    function showTyping() {
      typingRow = document.createElement("div");
      typingRow.setAttribute("style", "margin-bottom:8px;");
      var bubble = document.createElement("div");
      bubble.className = "cw-typing-dots";
      bubble.innerHTML = "<span></span><span></span><span></span>";
      bubble.setAttribute("style", [
        "display:inline-block", "padding:10px 14px", "border-radius:12px",
        "background:" + (dark ? "#21262d" : "#f1f3f5"), "color:" + panelText, "float:left",
      ].join(";"));
      typingRow.appendChild(bubble);
      var clear = document.createElement("div");
      clear.setAttribute("style", "clear:both;");
      typingRow.appendChild(clear);
      log.appendChild(typingRow);
      log.scrollTop = log.scrollHeight;
    }
    function hideTyping() {
      if (typingRow && typingRow.parentNode) typingRow.parentNode.removeChild(typingRow);
      typingRow = null;
    }

    function sendMessage() {
      var text = input.value.trim();
      var imageUrl = attachedImageUrl;
      if (!text && !imageUrl) return;
      input.value = "";
      clearAttachment();

      if (imageUrl) {
        addMessage("user", (text ? text + "\n" : "") + '<img src="' + escapeAttr(imageUrl) + '" style="max-width:160px;border-radius:8px;margin-top:4px;display:block;" />', true);
      } else {
        addMessage("user", text);
      }
      showTyping();
      send.disabled = true;

      postChatWithRetries(text, imageUrl, Date.now() + RETRY_BUDGET_MS)
        .then(function (data) {
          hideTyping();
          addMessage("assistant", data.answer || CONNECTION_TROUBLE_MESSAGE);
        })
        .catch(function () {
          hideTyping();
          addMessage("assistant", CONNECTION_TROUBLE_MESSAGE);
        })
        .then(function () {
          send.disabled = false;
        });
    }

    send.addEventListener("click", sendMessage);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") sendMessage();
    });
  }

  // Small markdown-lite renderer for assistant replies — no bundler here
  // (this file is served as-is, not compiled), so a full markdown library
  // isn't an option. Covers exactly what the system prompt is instructed
  // to produce: bold, bullet/numbered lists, and pipe tables. Escapes
  // HTML FIRST, then only ever introduces tags itself, so this stays safe
  // against a customer typing markdown-looking text back (that path never
  // reaches this function — only assistant text does, via bubble.innerHTML
  // above) and against the AI echoing untrusted text inside its answer.
  function formatMessage(text) {
    var escaped = escapeHtml(text);
    var lines = escaped.split("\n");
    var html = "";
    var i = 0;

    function inline(s) {
      return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    }

    while (i < lines.length) {
      var line = lines[i];

      // Pipe table: a header row, a "---|---" separator row, then 1+ data rows.
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        var headerCells = line.split("|").map(function (c) { return c.trim(); }).filter(function (c) { return c !== ""; });
        i += 2;
        var bodyRows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          bodyRows.push(lines[i].split("|").map(function (c) { return c.trim(); }).filter(function (c) { return c !== ""; }));
          i++;
        }
        html += '<table style="border-collapse:collapse;margin:4px 0;font-size:12px">';
        html += "<tr>" + headerCells.map(function (c) { return '<th style="text-align:left;padding:3px 8px;border-bottom:1px solid currentColor;opacity:.85">' + inline(c) + "</th>"; }).join("") + "</tr>";
        bodyRows.forEach(function (row) {
          html += "<tr>" + row.map(function (c) { return '<td style="padding:3px 8px;border-bottom:1px solid rgba(128,128,128,.25)">' + inline(c) + "</td>"; }).join("") + "</tr>";
        });
        html += "</table>";
        continue;
      }

      // Bullet list: consecutive "- " / "* " lines.
      if (/^\s*[-*]\s+/.test(line)) {
        html += '<ul style="margin:4px 0;padding-left:18px">';
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          html += "<li>" + inline(lines[i].replace(/^\s*[-*]\s+/, "")) + "</li>";
          i++;
        }
        html += "</ul>";
        continue;
      }

      // Numbered list: consecutive "1. " lines.
      if (/^\s*\d+\.\s+/.test(line)) {
        html += '<ol style="margin:4px 0;padding-left:18px">';
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          html += "<li>" + inline(lines[i].replace(/^\s*\d+\.\s+/, "")) + "</li>";
          i++;
        }
        html += "</ol>";
        continue;
      }

      html += (line.trim() === "" ? "<br>" : inline(line)) + "<br>";
      i++;
    }

    return html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }
})();
