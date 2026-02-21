// content_bridge.js — runs on localhost/* and file:///*
// Bridges postMessage from the HTML app ↔ chrome.runtime ↔ background.js.
// Large payloads AND large responses (> 2 KB) are stored in chrome.storage.local.

const STORAGE_THRESHOLD = 2048; // bytes

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  // Diagnostic: ping from test_bridge.html
  if (event.data?.type === "BRIDGE_PING") {
    window.postMessage({ type: "BRIDGE_PONG" }, "*");
    return;
  }

  // Diagnostic: check if Claude.ai tab is open
  if (event.data?.type === "CHECK_CLAUDE_TAB") {
    chrome.runtime.sendMessage({ type: "CHECK_CLAUDE_TAB" }, (response) => {
      window.postMessage({
        type: "CLAUDE_TAB_STATUS",
        payload: response?.open ? "open" : "closed"
      }, "*");
    });
    return;
  }

  // Normal operation: send chunk to AI via extension
  if (event.data?.type === "REQUEST_EXTENSION_AI") {
    const payload = event.data.payload || "";

    if (payload.length > STORAGE_THRESHOLD) {
      const key = "bridge_payload_" + Date.now();
      chrome.storage.local.set({ [key]: payload }, () => {
        chrome.runtime.sendMessage({ type: "TO_AI", payloadKey: key });
      });
    } else {
      chrome.runtime.sendMessage({ type: "TO_AI", payload });
    }
  }
});

// Messages from background.js → HTML app
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "AI_RESULT") {
    if (request.resultKey) {
      // Large response stored in chrome.storage.local by background.js
      chrome.storage.local.get([request.resultKey], (result) => {
        const payload = result[request.resultKey] || "";
        chrome.storage.local.remove(request.resultKey);
        window.postMessage({ type: "RESPONSE_FROM_EXTENSION", payload }, "*");
      });
    } else {
      window.postMessage({ type: "RESPONSE_FROM_EXTENSION", payload: request.payload }, "*");
    }
  }
  if (request.type === "AI_ERROR") {
    window.postMessage({ type: "EXTENSION_ERROR", payload: request.payload }, "*");
  }
});
