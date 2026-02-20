// content_claude.js — runs on claude.ai
// Injects text via DataTransfer paste (most reliable for ProseMirror),
// clicks Send, polls for streaming to finish, then returns the response.

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "PROCESS_CHUNK") {
    injectAndSend(request.payload);
  }
});

async function injectAndSend(text) {
  const textBox = findInputBox();
  if (!textBox) {
    chrome.runtime.sendMessage({ type: "AI_ERROR", payload: "לא נמצאה תיבת הטקסט של Claude — וודא שאתה בדף שיחה" });
    return;
  }

  textBox.focus();
  await sleep(200);

  // Clear any existing content first
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  await sleep(100);

  // Insert via DataTransfer paste event — works reliably with ProseMirror/React
  const ok = pasteInto(textBox, text);
  if (!ok) {
    chrome.runtime.sendMessage({ type: "AI_ERROR", payload: "הכנסת הטקסט נכשלה" });
    return;
  }

  await sleep(800); // let React re-render and enable the Send button

  const sendBtn = findSendButton();
  if (!sendBtn) {
    chrome.runtime.sendMessage({ type: "AI_ERROR", payload: "כפתור השליחה לא נמצא — ייתכן שהטקסט לא נקלט" });
    return;
  }
  sendBtn.click();

  monitorResponse();
}

function findInputBox() {
  // Claude.ai uses ProseMirror; try most-specific first
  return (
    document.querySelector('div[contenteditable="true"].ProseMirror') ||
    document.querySelector('[data-testid="composer-input"]') ||
    document.querySelector('div[contenteditable="true"]')
  );
}

function pasteInto(el, text) {
  // Build a DataTransfer and dispatch a paste event.
  // ProseMirror listens to this natively and inserts the text correctly.
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    }));
    return true;
  } catch {
    // Fallback: execCommand (works in most Chromium builds)
    try {
      document.execCommand('insertText', false, text);
      return true;
    } catch {
      return false;
    }
  }
}

function findSendButton() {
  const selectors = [
    'button[aria-label="Send message"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="שליחה"]',
    'button[data-testid="send-button"]',
    'button[type="submit"]',
  ];
  for (const s of selectors) {
    const btn = document.querySelector(s);
    if (btn && !btn.disabled) return btn;
  }
  return null;
}

function monitorResponse() {
  // Claude.ai shows a stop button while streaming; it disappears when done.
  // Also check for the presence of at least one assistant turn after ours.
  let stable = 0;

  const checkInterval = setInterval(() => {
    // Streaming is active if a stop/cancel button is visible
    const stopBtn =
      document.querySelector('button[aria-label*="Stop"]') ||
      document.querySelector('button[aria-label*="עצור"]') ||
      document.querySelector('[data-testid="stop-button"]');

    if (stopBtn) { stable = 0; return; }

    stable++;
    if (stable < 2) return; // 2 × 2 s = 4 s of silence = done

    clearInterval(checkInterval);

    const lastMsg = getLastAssistantMessage();
    if (!lastMsg) {
      chrome.runtime.sendMessage({ type: "AI_ERROR", payload: "לא נמצאה תגובה של Claude" });
      return;
    }
    chrome.runtime.sendMessage({ type: "FROM_AI", payload: lastMsg });
  }, 2000);

  // Safety: abort after 3 minutes
  setTimeout(() => clearInterval(checkInterval), 180_000);
}

function getLastAssistantMessage() {
  // Try several selector strategies in order of specificity
  const strategies = [
    () => document.querySelectorAll('[data-testid="message-content"]'),
    () => document.querySelectorAll('.font-claude-message'),
    () => {
      // Generic: all message blocks that are NOT human turns
      const all = document.querySelectorAll('[class*="message"]');
      return Array.from(all).filter(el =>
        !el.querySelector('[data-testid="human-turn"]') &&
        el.innerText.trim().length > 10
      );
    },
  ];

  for (const fn of strategies) {
    const nodes = fn();
    if (nodes.length > 0) {
      return nodes[nodes.length - 1].innerText.trim();
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
