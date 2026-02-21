// js/main.js - המוח המרכזי שמנצח על התזמורת
import { CONFIG } from './config.js';
import { StorageManager } from './storage-manager.js';
import { BridgeClient } from './bridge-client.js';
import { TextProcessor } from './text-processor.js';
import { UIManager } from './ui-manager.js';
import { SystemWatcher } from './system-watcher.js';

// אתחול צופה המערכת (הסוכן שיודע להפיק דוחות שגיאה לקלוד)
window.watcherInstance = new SystemWatcher();

document.addEventListener('DOMContentLoaded', () => {
    console.log("System initialization started...");
    
    // 1. טעינת הגדרות אישיות
    const settings = StorageManager.loadSettings();
    
    // 2. בדיקת הגשר לדפדפן (נורית ירוקה/אדומה)
    BridgeClient.checkStatus((isActive) => {
        const dot = document.querySelector('.status-dot');
        const text = document.querySelector('.status-text');
        if (!dot || !text) return;
        
        if (isActive) {
            dot.style.backgroundColor = 'var(--success)';
            text.innerText = CONFIG.SYSTEM_MESSAGES.BRIDGE_OK;
        } else {
            dot.style.backgroundColor = 'var(--danger)';
            text.innerText = CONFIG.SYSTEM_MESSAGES.BRIDGE_ERROR;
        }
    });

    // 3. חיבור הכפתורים לאירועים
    function setupEventListeners(settings) {
    // כפתור שליחה לעיבוד
    const processBtn = document.getElementById('processBtn');
    if (processBtn) {
        processBtn.addEventListener('click', () => handleProcessing(settings));
    }

    // כפתור מצב לילה
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            // אם תרצה, אפשר גם לשמור את המצב ב-StorageManager בהמשך
        });
    }

    // כפתור פתיחת הגדרות
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            UIManager.openModal('settingsModal');
        });
    }

    // כפתור סגירת הגדרות (בתוך המודאל)
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            UIManager.closeModal('settingsModal');
        });
    }

    // כפתור ניקוי
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('לנקות את התמליל?')) {
                UIManager.setInputValue('');
                UIManager.setOutputHTML('<div class="empty-state">התוצאות יופיעו כאן...</div>');
            }
        });
    }
};
});

function setupEventListeners(settings) {
    const processBtn = document.getElementById('processBtn');
    if (processBtn) {
        processBtn.addEventListener('click', () => handleProcessing(settings));
    }

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
        });
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('לנקות את התמליל?')) {
                UIManager.setInputValue('');
                UIManager.setOutputHTML('<div class="empty-state">התוצאות יופיעו כאן...</div>');
            }
        });
    }
}

// התהליך המרכזי שקורה כשלוחצים "שלח לעיבוד"
async function handleProcessing(settings) {
    const rawText = UIManager.getInputValue();
    if (!rawText.trim()) {
        UIManager.notify('אנא הזן טקסט לעיבוד.', true);
        return;
    }

    try {
        UIManager.setLoading(true);
        UIManager.setOutputHTML('<div class="empty-state">מבצע ניקוי טקסט מקדים...</div>');
        
        // שלב 1: ניקוי טקסט (Preprocess) וחיתוך
        const cleanText = TextProcessor.preprocessHebrew(rawText, settings.PREPROCESS_ENABLED);
        const chunks = TextProcessor.chunkText(cleanText);
        
        UIManager.setOutputHTML('<div class="empty-state">⏳ טקסט מוכן. ממתין לתשובה מהתוסף/AI...</div>');
        
        // שלב 2: שליחה לתוסף (Bridge)
        // שולחים את המנה הראשונה כדוגמה
        const response = await BridgeClient.sendPayload(chunks[0], settings.MODEL);
        
        // שלב 3: טיפול בתשובה
        if (response && response.success) {
            UIManager.setOutputHTML(`<div class="result-text" style="white-space: pre-wrap; padding: 15px;">${response.data || 'העיבוד עבר בהצלחה!'}</div>`);
            StorageManager.saveHistory({ date: new Date().toISOString(), text: chunks[0] });
            UIManager.notify('העיבוד הושלם בהצלחה!');
        } else {
            throw new Error((response && response.error) || 'שגיאה בתקשורת מול התוסף או ה-AI');
        }

    } catch (error) {
        window.watcherInstance.logError('Processing Error', error.message);
        UIManager.notify(error.message, true);
        UIManager.setOutputHTML(`<div class="empty-state" style="color: var(--danger)">❌ שגיאה: ${error.message}</div>`);
    } finally {
        UIManager.setLoading(false);
    }
}