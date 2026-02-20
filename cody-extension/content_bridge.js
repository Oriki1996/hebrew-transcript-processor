// content_bridge.js — runs on localhost/* and file:///*
// Bridges postMessage from the web page ↔ chrome.runtime messages to background.js

window.addEventListener("message", (event) => {
  // Only accept messages from the same frame (the transcript processor page)
  if (event.source !== window) return;
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
