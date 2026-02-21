// js/bridge-client.js

export const BridgeClient = {
    // בדיקה האם התוסף מחובר
    checkStatus(callback) {
        try {
            // אם אנחנו לא בסביבת כרום עם תוסף, נחזיר שגיאה
            if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
                callback(false);
                return;
            }
            
            chrome.runtime.sendMessage({ action: "ping" }, (response) => {
                if (chrome.runtime.lastError) {
                    callback(false);
                } else if (response && response.status === "ok") {
                    callback(true);
                } else {
                    callback(false);
                }
            });
        } catch (e) {
            callback(false);
        }
    },
    
    // שליחת הטקסט לעיבוד בתוסף
    async sendPayload(text, model) {
        return new Promise((resolve, reject) => {
            try {
                if (!window.chrome || !chrome.runtime) {
                    throw new Error("תוסף הכרום אינו זמין.");
                }

                chrome.runtime.sendMessage({
                    action: "process_transcript",
                    text: text,
                    model: model
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }
};