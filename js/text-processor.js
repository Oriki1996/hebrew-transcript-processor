// js/text-processor.js
import { CONFIG } from './config.js';

export const TextProcessor = {
    preprocessHebrew(text, isEnabled) {
        if (!isEnabled || !text) return text;
        
        let cleanedText = text;
        
        // 1. ניקוי רווחים ושורות ריקות
        cleanedText = cleanedText.replace(CONFIG.REGEX.MULTIPLE_SPACES, ' ');
        cleanedText = cleanedText.replace(CONFIG.REGEX.EMPTY_LINES, '\n\n');
        
        // 2. הסרת מילות מילוי (אהה, כאילו וכו')
        cleanedText = cleanedText.replace(CONFIG.REGEX.FILLER_WORDS, '');
        
        // 3. תיקון רווחים מיותרים שנוצרו לפני פסיקים ונקודות
        cleanedText = cleanedText.replace(/ \./g, '.').replace(/ ,/g, ',');
        cleanedText = cleanedText.replace(CONFIG.REGEX.MULTIPLE_SPACES, ' ').trim();
        
        return cleanedText;
    },

    // חלוקה למנות (Chunking) לטקסטים ארוכים
    chunkText(text, maxSize = CONFIG.DEFAULTS.CHUNK_SIZE, overlap = CONFIG.DEFAULTS.OVERLAP) {
        if (text.length <= maxSize) return [text];
        
        const chunks = [];
        let startIndex = 0;
        
        while (startIndex < text.length) {
            let endIndex = startIndex + maxSize;
            if (endIndex < text.length) {
                // חיפוש נקודה אחרונה כדי לא לחתוך משפט באמצע
                const safeCut = text.lastIndexOf('.', endIndex);
                if (safeCut > startIndex + (maxSize / 2)) {
                    endIndex = safeCut + 1;
                }
            }
            chunks.push(text.slice(startIndex, endIndex));
            startIndex = endIndex - overlap; // יצירת חפיפה בין המנות
        }
        
        return chunks;
    }
};