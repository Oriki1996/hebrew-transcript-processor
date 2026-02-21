// content_claude.js — runs on claude.ai
// Injects text via DataTransfer paste (most reliable for ProseMirror),
// clicks Send, polls for streaming to finish, then returns the response.

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "PROCESS_CHUNK") {
    injectAndSend(preprocessHebrew(request.payload));
  }
});

// ── Hebrew text pre-processor ──────────────────────────────────────────────
function preprocessHebrew(text) {
  if (!text || typeof text !== 'string') return text;
  text = text.replace(/^[ \t]*(אממ+|אהה+|אוו+|יעני|כאילו|אוקיי|אוקי|נו+)[ \t]*$/gim, '');
  const INLINE = ['אממ', 'אהה', 'אוו'];
  for (const f of INLINE) {
    text = text.replace(new RegExp(' ' + f + '+ ', 'g'), ' ');
    text = text.replace(new RegExp('^' + f + '+ ', 'gm'), '');
  }
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+$/gm, '');
  return text.trim();
}

// ── UI validation ──────────────────────────────────────────────────────────
function validateUI() {
  const box = findInputBox();
  if (!box) {
    return {
      ok: false,
      error:
        'שגיאת ממשק: תיבת הטקסט של Claude לא נמצאה.\n' +
        'ייתכן שממשק Claude.ai עודכן ושינה את מבנה ה-DOM.\n' +
        'פתרון מומלץ: עבור למצב API ישיר (Anthropic / Gemini) בהגדרות הספק.'
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

  const sel = window.getSelection();
  if (sel) { sel.selectAllChildren(textBox); sel.deleteFromDocument(); }
  await sleep(100);

  const ok = pasteInto(textBox, text);
  if (!ok) {
    chrome.runtime.sendMessage({
      type: 'AI_ERROR',
      payload:
        'שגיאת ממשק: הכנסת הטקסט נכשלה (DataTransfer + fallback שניהם כשלו).\n' +
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
        'שגיאת ממשק: כפתור השליחה לא נמצא או מושבת.\n' +
        'ייתכן שהטקסט לא נקלט כראוי, או שממשק Claude.ai שונה.\n' +
        'פתרון מומלץ: עבור למצב API ישיר בהגדרות הספק.'
    });
    return;
  }
  sendBtn.click();
  monitorResponse();
}

// ── DOM helpers — updated selectors (2026) ────────────────────────────────
function findInputBox() {
  return (
    // ProseMirror (Claude's composer)
    document.querySelector('div[contenteditable="true"].ProseMirror') ||
    // aria-label variants (changes between releases)
    document.querySelector('div[contenteditable="true"][aria-label*="Message Claude"]') ||
    document.querySelector('div[contenteditable="true"][aria-label*="Send a message"]') ||
    document.querySelector('div[contenteditable="true"][aria-label*="Message"]') ||
    // data-testid fallbacks
    document.querySelector('[data-testid="composer-input"]') ||
    document.querySelector('[data-testid="chat-input"]') ||
    // class-based
    document.querySelector('div[contenteditable="true"][class*="composer"]') ||
    // role + generic
    document.querySelector('div[contenteditable="true"][role="textbox"]') ||
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
    try {
      const s = window.getSelection();
      if (s && s.rangeCount) {
        const r = s.getRangeAt(0);
        r.deleteContents();
        r.insertNode(document.createTextNode(text));
        s.collapseToEnd();
      }
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
    'button[data-testid="send-button"]',
    'button[aria-label*="Message Claude"]',
    'button[type="submit"]',
  ];
  for (const s of selectors) {
    const btn = document.querySelector(s);
    if (btn && !btn.disabled) return btn;
  }
  return null;
}

// ── Smart streaming monitor ───────────────────────────────────────────────────
function monitorResponse() {
  const INTERVAL              = 2000;
  const STOP_QUIET_CYCLES     = 3;
  const CONTENT_STABLE_CYCLES = 2;

  let stopQuiet    = 0;
  let contentStable = 0;
  let lastLength   = 0;

  const checkInterval = setInterval(() => {
    const stopBtn =
      document.querySelector('button[aria-label*="Stop"]') ||
      document.querySelector('button[aria-label*="עצור"]') ||
      document.querySelector('[data-testid="stop-button"]');

    if (stopBtn) {
      stopQuiet = 0; contentStable = 0; lastLength = 0;
      return;
    }
    stopQuiet++;

    const lastMsg       = getLastAssistantMessage();
    const currentLength = lastMsg ? lastMsg.length : 0;

    if (currentLength > lastLength) {
      lastLength = currentLength; contentStable = 0;
    } else {
      contentStable++;
    }

    if (stopQuiet < STOP_QUIET_CYCLES || contentStable < CONTENT_STABLE_CYCLES) return;

    clearInterval(checkInterval);

    if (!lastMsg || lastMsg.length < 20) {
      chrome.runtime.sendMessage({
        type: 'AI_ERROR',
        payload:
          'לא נמצאה תגובה של Claude (או שהתגובה קצרה מדי).\n' +
          'ודא שאתה מחובר ל-claude.ai ושהשיחה אינה נחסמת.'
      });
      return;
    }
    chrome.runtime.sendMessage({ type: 'FROM_AI', payload: lastMsg });
  }, INTERVAL);

  setTimeout(() => clearInterval(checkInterval), 300_000);
}

function getLastAssistantMessage() {
  const strategies = [
    () => document.querySelectorAll('[data-testid="message-content"]'),
    () => document.querySelectorAll('.font-claude-message'),
    () => {
      const all = document.querySelectorAll('[class*="message"]');
      return Array.from(all).filter(el =>
        !el.querySelector('[data-testid="human-turn"]') &&
        el.innerText.trim().length > 10
      );
    },
  ];
  for (const fn of strategies) {
    const nodes = fn();
    if (nodes.length > 0) return nodes[nodes.length - 1].innerText.trim();
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
