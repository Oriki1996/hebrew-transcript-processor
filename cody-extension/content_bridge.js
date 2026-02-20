// content_bridge.js — runs on localhost/* and file:///*
// Bridges postMessage from the web page ↔ chrome.runtime messages to background.js

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

  // Normal operation: send chunk to Claude via extension
  if (event.data?.type === "REQUEST_EXTENSION_AI") {
    chrome.runtime.sendMessage({ type: "TO_AI", payload: event.data.payload });
  }
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "AI_RESULT") {
    window.postMessage({ type: "RESPONSE_FROM_EXTENSION", payload: request.payload }, "*");
  }
  if (request.type === "AI_ERROR") {
    window.postMessage({ type: "EXTENSION_ERROR", payload: request.payload }, "*");
  }
});
