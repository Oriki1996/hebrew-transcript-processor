// content_claude.js — runs on claude.ai
// Injects text, sends it, waits for the response, returns it.

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "PROCESS_CHUNK") {
    injectAndSend(request.payload);
  }
});

async function injectAndSend(text) {
  // Claude's input is a ProseMirror contenteditable div.
  // Try both known selectors in case the UI changes.
  const textBox =
    document.querySelector('div[contenteditable="true"].ProseMirror') ||
    document.querySelector('div[contenteditable="true"]');

  if (!textBox) {
    chrome.runtime.sendMessage({ type: "AI_ERROR", payload: "לא נמצאה תיבת הטקסט של Claude" });
    return;
  }

  // Focus + insert via InputEvent (execCommand is deprecated but kept as fallback)
  textBox.focus();
  const inserted = insertText(textBox, text);
  if (!inserted) {
    chrome.runtime.sendMessage({ type: "AI_ERROR", payload: "הכנסת הטקסט נכשלה" });
    return;
  }

  // Wait a tick for React to register the change, then click Send
  await sleep(700);
  const sendBtn = findSendButton();
  if (!sendBtn) {
    chrome.runtime.sendMessage({ type: "AI_ERROR", payload: "כפתור השליחה לא נמצא" });
    return;
  }
  sendBtn.click();

  monitorResponse();
}

function insertText(el, text) {
  // Preferred: native InputEvent so React/ProseMirror picks it up
  el.textContent = '';
  const ev = new InputEvent('input', { bubbles: true, cancelable: true, data: text, inputType: 'insertText' });
  try {
    document.execCommand('insertText', false, text); // still works in most Chromium builds
    return true;
  } catch {
    el.textContent = text;
    el.dispatchEvent(ev);
    return true;
  }
}

function findSendButton() {
  // Claude.ai aria-labels vary by locale; check multiple
  const selectors = [
    'button[aria-label*="Send"]',
    'button[aria-label*="שליחה"]',
    'button[aria-label*="send" i]',
    'button[data-testid="send-button"]',
  ];
  for (const s of selectors) {
    const btn = document.querySelector(s);
    if (btn && !btn.disabled) return btn;
  }
  return null;
}

function monitorResponse() {
  // Poll every 2 s; resolve when the streaming indicator disappears
  // and at least one assistant message is present.
  let stable = 0;

  const checkInterval = setInterval(() => {
    const streaming =
      document.querySelector('[data-testid="streaming-indicator"]') ||
      document.querySelector('.streaming') ||
      document.querySelector('.animate-pulse');  // fallback

    if (streaming) { stable = 0; return; }

    stable++;
    if (stable < 2) return; // require 2 consecutive clean polls (4 s)

    clearInterval(checkInterval);

    // Grab the last assistant message
    const messages =
      document.querySelectorAll('[data-testid="message-container"]').length > 0
        ? document.querySelectorAll('[data-testid="message-container"]')
        : document.querySelectorAll('.font-claude-message');

    if (messages.length === 0) {
      chrome.runtime.sendMessage({ type: "AI_ERROR", payload: "לא נמצאה תגובה של Claude" });
      return;
    }

    const lastMsg = messages[messages.length - 1].innerText.trim();
    chrome.runtime.sendMessage({ type: "FROM_AI", payload: lastMsg });
  }, 2000);

  // Safety timeout: 3 minutes
  setTimeout(() => clearInterval(checkInterval), 180_000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
