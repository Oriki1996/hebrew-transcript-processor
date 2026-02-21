// js/ui-manager.js

export const UIManager = {
    getInputValue() {
        return document.getElementById('mainInput').value;
    },
    
    setInputValue(text) {
        document.getElementById('mainInput').value = text;
    },
    
    setOutputHTML(html) {
        const area = document.getElementById('outputArea');
        if (area) area.innerHTML = html;
    },
    
    setLoading(isLoading) {
        const btn = document.getElementById('processBtn');
        if (!btn) return;
        
        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = '⏳ מעבד... (אנא המתן)';
            btn.classList.add('loading');
        } else {
            btn.disabled = false;
            btn.innerHTML = '🚀 שלח לעיבוד';
            btn.classList.remove('loading');
        }
    },
    
    notify(message, isError = false) {
        if (isError) {
            console.error(message);
            alert(`❌ שגיאה: ${message}`);
        } else {
            alert(`✅ ${message}`);
        }
    },

    // פונקציות חדשות לניהול המודאלים (חלונות קופצים)
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
        } else {
            console.error(`Modal with ID ${modalId} not found in HTML!`);
        }
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
    }
};