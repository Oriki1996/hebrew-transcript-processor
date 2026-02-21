// js/system-watcher.js - מנגנון אבחון, ניטור שגיאות והפקת דוחות

export class SystemWatcher {
    constructor() {
        this.errors = [];
        this.initErrorListeners();
    }

    initErrorListeners() {
        window.addEventListener('error', (event) => {
            this.logError('JS Error', event.message, event.filename, event.lineno);
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.logError('Promise Rejection', event.reason);
        });
    }

    logError(type, message, file = '', line = '') {
        const errorData = {
            timestamp: new Date().toISOString(),
            type,
            message: String(message),
            file,
            line
        };
        
        this.errors.push(errorData);
        // שמירה של 10 השגיאות האחרונות בלבד בזיכרון
        if (this.errors.length > 10) this.errors.shift();
        
        console.error(`[SystemWatcher] ${type}: ${message}`);
        this.showEmergencyButton();
    }

    showEmergencyButton() {
        const btn = document.getElementById('systemDiagnosticBtn');
        if (btn) btn.style.display = 'inline-block';
    }

    generateBugReport() {
        let report = `### System Diagnostic Report\n\n`;
        report += `**Time:** ${new Date().toISOString()}\n`;
        report += `**User Agent:** ${navigator.userAgent}\n\n`;
        
        report += `#### Recent Errors:\n`;
        if (this.errors.length === 0) {
            report += `No standard JS errors caught.\n`;
        } else {
            this.errors.forEach(e => {
                report += `- [${e.type}] ${e.message} (Line: ${e.line})\n`;
            });
        }

        report += `\n#### DOM Health Check:\n`;
        const criticalIds = ['mainInput', 'processBtn', 'settingsBtn'];
        criticalIds.forEach(id => {
            const el = document.getElementById(id);
            report += `- Element #${id}: ${el ? '✅ Found' : '❌ MISSING'}\n`;
        });

        // העתקה ללוח (Clipboard)
        navigator.clipboard.writeText(report).then(() => {
            alert('דו"ח האבחון הועתק ללוח. הדבק אותו לקלוד קוד או כאן בצ\'אט.');
        }).catch(err => {
            console.error('Failed to copy report: ', err);
            alert('לא ניתן להעתיק אוטומטית. חפש את הדו"ח בקונסול (F12).');
        });

        return report;
    }
}

// חשיפה לקונסול כדי שתוכל להפעיל ידנית (F12)
window.generateBugReport = () => {
    if (!window.watcherInstance) {
        window.watcherInstance = new SystemWatcher();
    }
    window.watcherInstance.generateBugReport();
};