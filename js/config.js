// js/config.js - מרכז ההגדרות והקבועים של המערכת

export const CONFIG = {
    STORAGE_KEYS: {
        HISTORY: 'transcript_history',
        SETTINGS: 'transcript_settings',
        API_KEY_ANTHROPIC: 'anthropic_api_key',
        API_KEY_GEMINI: 'gemini_api_key',
        WEBHOOK_URL: 'n8n_webhook_url'
    },
    
    DEFAULTS: {
        MODEL: 'claude', // claude, gemini, bridge
        PREPROCESS_ENABLED: true,
        CHUNK_SIZE: 150000, // תווים מקסימליים למנה
        OVERLAP: 200
    },

    REGEX: {
        // ניקוי רווחים כפולים ושורות ריקות
        MULTIPLE_SPACES: /[ \t]{2,}/g,
        EMPTY_LINES: /\n\s*\n/g,
        
        // מילות מילוי נפוצות (אפשר להוסיף עוד ללא הגבלה)
        FILLER_WORDS: /\b(אהה|אממ|כאילו|אוקיי|תראה|תראי|סבבה|טוב אז)\b/g
    },

    SYSTEM_MESSAGES: {
        BRIDGE_OK: 'גשר פעיל',
        BRIDGE_ERROR: 'תוסף לא מחובר',
        UI_MISSING: 'CRITICAL_UI_MISSING'
    }
};