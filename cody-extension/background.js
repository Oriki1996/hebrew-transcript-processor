// background.js — Cody Auto-Bridge switchboard
let siteTabId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // Diagnostic: check if a Claude.ai tab exists
  if (request.type === "CHECK_CLAUDE_TAB") {
    chrome.tabs.query({ url: "https://claude.ai/*" }, (tabs) => {
      sendResponse({ open: tabs.length > 0 });
    });
    return true; // keep channel open for async sendResponse
  }

  // Normal: route chunk from app → Claude tab
  if (request.type === "TO_AI") {
    siteTabId = sender.tab.id;
    chrome.tabs.query({ url: "https://claude.ai/*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "PROCESS_CHUNK",
          payload: request.payload
        });
      } else {
        chrome.tabs.sendMessage(siteTabId, {
          type: "AI_ERROR",
          payload: "נא לפתוח את Claude.ai בטאב נפרד"
        });
      }
    });
  }

  // Normal: route response from Claude tab → app tab
  if (request.type === "FROM_AI") {
    if (siteTabId) {
      chrome.tabs.sendMessage(siteTabId, {
        type: "AI_RESULT",
        payload: request.payload
      });
    }
  }
});
