// background.js — Cody Auto-Bridge switchboard
// Routes chunks from the app tab → the active AI tab (Claude or Gemini).
// Supports chrome.storage.local for large payloads in BOTH directions.

let siteTabId = null;
const STORAGE_THRESHOLD = 2048; // bytes

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // ── Diagnostic: check if a Claude.ai tab exists ────────────────────────
  if (request.type === "CHECK_CLAUDE_TAB") {
    chrome.tabs.query({ url: "https://claude.ai/*" }, (tabs) => {
      sendResponse({ open: tabs.length > 0 });
    });
    return true;
  }

  // ── Route chunk: app → AI tab (Claude preferred, Gemini fallback) ──────
  if (request.type === "TO_AI") {
    siteTabId = sender.tab?.id ?? siteTabId;

    const dispatchPayload = (payload) => {
      chrome.tabs.query({ url: "https://claude.ai/*" }, (claudeTabs) => {
        if (claudeTabs.length > 0) {
          chrome.tabs.sendMessage(claudeTabs[0].id, { type: "PROCESS_CHUNK", payload });
          return;
        }
        chrome.tabs.query({ url: "https://gemini.google.com/*" }, (geminiTabs) => {
          if (geminiTabs.length > 0) {
            chrome.tabs.sendMessage(geminiTabs[0].id, { type: "PROCESS_CHUNK", payload });
          } else if (siteTabId) {
            chrome.tabs.sendMessage(siteTabId, {
              type: "AI_ERROR",
              payload: "נא לפתוח את Claude.ai או Gemini בטאב נפרד"
            });
          }
        });
      });
    };

    if (request.payloadKey) {
      // Large payload stored by content_bridge.js
      chrome.storage.local.get([request.payloadKey], (result) => {
        const payload = result[request.payloadKey] || "";
        chrome.storage.local.remove(request.payloadKey);
        dispatchPayload(payload);
      });
    } else {
      dispatchPayload(request.payload || "");
    }
  }

  // ── Route response: AI tab → app tab (large responses via storage) ─────
  if (request.type === "FROM_AI") {
    if (!siteTabId) return;
    const payload = request.payload || "";

    if (payload.length > STORAGE_THRESHOLD) {
      const key = "bridge_result_" + Date.now();
      chrome.storage.local.set({ [key]: payload }, () => {
        chrome.tabs.sendMessage(siteTabId, { type: "AI_RESULT", resultKey: key });
      });
    } else {
      chrome.tabs.sendMessage(siteTabId, { type: "AI_RESULT", payload });
    }
  }

  // ── Route error: AI tab → app tab ─────────────────────────────────────
  if (request.type === "AI_ERROR") {
    if (siteTabId) {
      chrome.tabs.sendMessage(siteTabId, { type: "AI_ERROR", payload: request.payload });
    }
  }
});
