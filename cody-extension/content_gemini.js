// content_gemini.js — runs on gemini.google.com
// Mirrors content_claude.js architecture with Gemini-specific DOM selectors.

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "PROCESS_CHUNK") {
    injectAndSend(request.payload);
  }
});

// ── UI validation ──────────────────────────────────────────────────────────
function validateUI() {
  const box = findInputBox();
  if (!box) {
    return {
      ok: false,
      error:
        'שגיאת ממשק: תיבת הטקסט של Gemini לא נמצאה.\n' +
        'ייתכן שממשק gemini.google.com עודכן.\n' +
        'פתרון מומלץ: עבור למצב API ישיר (Gemini) בהגדרות הספק.'
    };
  }
  return { ok: true, box };
}

async function injectAndSend(text) {
  const validation = validateUI();
  if (!validation.ok) {
    chrome.runtime.sendMessage({ type: 'AI_ERROR', payload: validation.error });
    return;
  }
  const textBox = validation.box;

  textBox.focus();
  await sleep(200);

  // Clear existing content
  const sel = window.getSelection();
  if (sel) { sel.selectAllChildren(textBox); sel.deleteFromDocument(); }
  await sleep(100);

  const ok = pasteInto(textBox, text);
  if (!ok) {
    chrome.runtime.sendMessage({
      type: 'AI_ERROR',
      payload:
        'שגיאת ממשק: הכנסת הטקסט ל-Gemini נכשלה (DataTransfer + fallback שניהם כשלו).\n' +
        'פתרון מומלץ: עבור למצב API ישיר בהגדרות הספק.'
    });
    return;
  }

  await sleep(800);

  const sendBtn = findSendButton();
  if (!sendBtn) {
    chrome.runtime.sendMessage({
      type: 'AI_ERROR',
      payload:
        'שגיאת ממשק: כפתור השליחה של Gemini לא נמצא או מושבת.\n' +
        'ייתכן שהטקסט לא נקלט כראוי, או שממשק Gemini שונה.'
    });
    return;
  }
  sendBtn.click();

  monitorResponse();
}

// ── DOM helpers ────────────────────────────────────────────────────────────
function findInputBox() {
  // Gemini uses a custom rich-textarea web component with a contenteditable inside
  return (
    document.querySelector('rich-textarea div[contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]') ||
    document.querySelector('.ql-editor[contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"][class*="input"]') ||
    document.querySelector('div[contenteditable="true"]')
  );
}

function pasteInto(el, text) {
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData: dt
    }));
    return true;
  } catch {
    // Fallback: set textContent and fire input event
    try {
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.deleteContents();
      r.insertNode(document.createTextNode(text));
      el.dispatchEvent(new Event('input', { bubbles: true }));
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
    // Gemini-specific: the send button inside the input toolbar
    'button.send-button',
    'button[data-mat-icon-name="send"]',
    'button[type="submit"]',
  ];
  for (const s of selectors) {
    const btn = document.querySelector(s);
    if (btn && !btn.disabled) return btn;
  }
  return null;
}

// ── Smart streaming monitor ────────────────────────────────────────────────
// Same dual-condition logic as content_claude.js.
function monitorResponse() {
  const INTERVAL              = 2000;
  const STOP_QUIET_CYCLES     = 3;   // 6 s of no stop-button → streaming done
  const CONTENT_STABLE_CYCLES = 2;   // 4 s of unchanging length → settled

  let stopQuiet    = 0;
  let contentStable = 0;
  let lastLength   = 0;

  const checkInterval = setInterval(() => {
    // Gemini stop-generating button selectors
    const stopBtn =
      document.querySelector('button[aria-label*="Stop"]') ||
      document.querySelector('button[aria-label*="עצור"]') ||
      document.querySelector('[data-testid="stop-button"]') ||
      document.querySelector('button.stop-button');

    if (stopBtn) {
      stopQuiet = 0; contentStable = 0; lastLength = 0;
      return;
    }

    stopQuiet++;

    const lastMsg       = getLastAssistantMessage();
    const currentLength = lastMsg ? lastMsg.length : 0;

    if (currentLength > lastLength) {
      lastLength    = currentLength;
      contentStable = 0;
    } else {
      contentStable++;
    }

    if (stopQuiet < STOP_QUIET_CYCLES || contentStable < CONTENT_STABLE_CYCLES) return;

    clearInterval(checkInterval);

    if (!lastMsg || lastMsg.length < 20) {
      chrome.runtime.sendMessage({
        type: 'AI_ERROR',
        payload:
          'לא נמצאה תגובה של Gemini (או שהתגובה קצרה מדי).\n' +
          'ודא שאתה מחובר ל-gemini.google.com ושהשיחה פעילה.'
      });
      return;
    }
    chrome.runtime.sendMessage({ type: 'FROM_AI', payload: lastMsg });
  }, INTERVAL);

  // Safety abort after 5 minutes
  setTimeout(() => clearInterval(checkInterval), 300_000);
}

function getLastAssistantMessage() {
  // Try Gemini-specific selectors, then generic fallback
  const strategies = [
    // Gemini's model-response custom element
    () => document.querySelectorAll('model-response .markdown'),
    () => document.querySelectorAll('model-response'),
    // message-content blocks that are not from the user
    () => {
      const all = document.querySelectorAll('message-content');
      return Array.from(all).filter(el =>
        !el.closest('[data-is-human="true"]') &&
        !el.closest('.human-turn') &&
        el.innerText.trim().length > 10
      );
    },
    // Generic fallback
    () => {
      const all = document.querySelectorAll('[class*="response"], [class*="model"]');
      return Array.from(all).filter(el => el.innerText.trim().length > 10);
    },
  ];

  for (const fn of strategies) {
    try {
      const nodes = fn();
      if (nodes.length > 0) return nodes[nodes.length - 1].innerText.trim();
    } catch {}
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
