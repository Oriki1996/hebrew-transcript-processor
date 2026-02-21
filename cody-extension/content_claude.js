// content_claude.js — runs on claude.ai
// Injects text via DataTransfer paste (most reliable for ProseMirror),
// clicks Send, polls for streaming to finish, then returns the response.

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "PROCESS_CHUNK") {
    injectAndSend(preprocessHebrew(request.payload));
  }
});

// ── Hebrew text pre-processor ──────────────────────────────────────────────
// Strips filler words and normalises whitespace to reduce token consumption.
// Conservative: only removes clearly non-semantic particles.
function preprocessHebrew(text) {
  if (!text || typeof text !== 'string') return text;

  // 1. Remove standalone filler-only lines (common in raw speech transcripts)
  text = text.replace(/^[ \t]*(אממ+|אהה+|אוו+|יעני|כאילו|אוקיי|אוקי|נו+)[ \t]*$/gim, '');

  // 2. Remove inline fillers between spaces (Hebrew has no \b, use space anchors)
  const INLINE = ['אממ', 'אהה', 'אוו'];
  for (const f of INLINE) {
    // mid-sentence: " filler " → " "
    text = text.replace(new RegExp(' ' + f + '+ ', 'g'), ' ');
    // sentence-start: "filler " → ""
    text = text.replace(new RegExp('^' + f + '+ ', 'gm'), '');
  }

  // 3. Collapse 3+ consecutive blank lines → 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // 4. Trim trailing whitespace on each line
  text = text.replace(/[ \t]+$/gm, '');

  return text.trim();
}

// ── UI validation ─────────────────────────────────────────────────────────────
// Checks that the required DOM elements exist before attempting any interaction.
// Returns { ok: true } or { ok: false, error: string } with a suggestion to
// switch to API mode when the Claude.ai interface has changed unexpectedly.
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
  // ── 1. Pre-flight: validate DOM ──────────────────────────────────────────
  const validation = validateUI();
  if (!validation.ok) {
    chrome.runtime.sendMessage({ type: 'AI_ERROR', payload: validation.error });
    return;
  }
  const textBox = validation.box;

  textBox.focus();
  await sleep(200);

  // Clear any existing content via Selection API (execCommand is deprecated)
  const sel = window.getSelection();
  if (sel) { sel.selectAllChildren(textBox); sel.deleteFromDocument(); }
  await sleep(100);

  // ── 2. Inject via DataTransfer paste ─────────────────────────────────────
  const ok = pasteInto(textBox, text);
  if (!ok) {
    chrome.runtime.sendMessage({
      type: 'AI_ERROR',
      payload:
        'שגיאת ממשק: הכנסת הטקסט נכשלה (DataTransfer + execCommand שניהם כשלו).\n' +
        'פתרון מומלץ: עבור למצב API ישיר בהגדרות הספק.'
    });
    return;
  }

  await sleep(800); // let React re-render and enable the Send button

  // ── 3. Find and click Send ────────────────────────────────────────────────
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

function findInputBox() {
  // Claude.ai uses ProseMirror; try most-specific first
  return (
    document.querySelector('div[contenteditable="true"].ProseMirror') ||
    document.querySelector('[data-testid="composer-input"]') ||
    document.querySelector('div[contenteditable="true"][class*="composer"]') ||
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
    // Fallback: Selection-range insert (avoids deprecated execCommand)
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
    'button[type="submit"]',
  ];
  for (const s of selectors) {
    const btn = document.querySelector(s);
    if (btn && !btn.disabled) return btn;
  }
  return null;
}

// ── Smart streaming monitor ───────────────────────────────────────────────────
// Declares the response "done" only when BOTH conditions hold:
//   (a) the stop/cancel button has been absent for STOP_QUIET_CYCLES × INTERVAL ms
//   (b) the visible response text has not grown for CONTENT_STABLE_CYCLES × INTERVAL ms
// This prevents cutting off long responses that have internal pauses.
function monitorResponse() {
  const INTERVAL             = 2000; // ms between checks
  const STOP_QUIET_CYCLES    = 3;    // 6 s of no stop-button → streaming likely done
  const CONTENT_STABLE_CYCLES = 2;   // 4 s of unchanging length → content settled

  let stopQuiet    = 0; // consecutive cycles without stop button
  let contentStable = 0; // consecutive cycles with same response length
  let lastLength   = 0;

  const checkInterval = setInterval(() => {
    // ── Check for active streaming indicator ──────────────────────────────
    const stopBtn =
      document.querySelector('button[aria-label*="Stop"]') ||
      document.querySelector('button[aria-label*="עצור"]') ||
      document.querySelector('[data-testid="stop-button"]');

    if (stopBtn) {
      // Streaming in progress — reset both counters
      stopQuiet    = 0;
      contentStable = 0;
      lastLength   = 0;
      return;
    }

    stopQuiet++;

    // ── Track response length growth ─────────────────────────────────────
    const lastMsg       = getLastAssistantMessage();
    const currentLength = lastMsg ? lastMsg.length : 0;

    if (currentLength > lastLength) {
      lastLength    = currentLength;
      contentStable = 0; // still growing
    } else {
      contentStable++;
    }

    // ── Both conditions must be met ───────────────────────────────────────
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

  // Safety: abort after 5 minutes (300 s)
  setTimeout(() => clearInterval(checkInterval), 300_000);
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
