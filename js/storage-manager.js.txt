// js/storage-manager.js
import { CONFIG } from './config.js';

export const StorageManager = {
    saveSettings(settings) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    },
    
    loadSettings() {
        const defaultSettings = { ...CONFIG.DEFAULTS };
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch (e) {
            return defaultSettings;
        }
    },
    
    saveHistory(record) {
        try {
            let history = this.loadHistory();
            history.unshift(record); // הוספה לתחילת הרשימה
            if (history.length > 50) history.pop(); // שמירה על 50 האחרונים בלבד למניעת עומס
            localStorage.setItem(CONFIG.STORAGE_KEYS.HISTORY, JSON.stringify(history));
        } catch (e) {
            console.error("Failed to save history", e);
        }
    },
    
    loadHistory() {
        try {
            const history = localStorage.getItem(CONFIG.STORAGE_KEYS.HISTORY);
            return history ? JSON.parse(history) : [];
        } catch (e) {
            return [];
        }
    }
};