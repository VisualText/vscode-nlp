"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HelpView = exports.helpView = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const visualText_1 = require("./visualText");
class HelpView {
    constructor(context) {
        this.context = context;
        vscode.commands.registerCommand('helpView.lookup', (resource) => this.lookup(resource));
        this.exists = false;
        this.ctx = context;
        this.panel = undefined;
    }
    static attach(ctx) {
        if (!exports.helpView) {
            exports.helpView = new HelpView(ctx);
        }
        return exports.helpView;
    }
    createPanel() {
        return vscode.window.createWebviewPanel('helpView', 'NLP++ Help', {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: false
        });
    }
    lookup(resource) {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            var selection = editor.selection;
            var text = editor.document.getText(selection);
            if (!this.exists) {
                this.panel = this.createPanel();
                this.panel.onDidDispose(() => {
                    this.exists = false;
                }, null, this.context.subscriptions);
                this.exists = true;
            }
            if (this.panel) {
                this.panel.webview.html = this.getWebviewContent(text);
            }
        }
    }
    getWebviewContent(term) {
        let dir = path.join(visualText_1.visualText.getVisualTextDirectory('Help'), 'helps');
        let htmlFile = path.join(dir, term + '.htm');
        if (fs.existsSync(htmlFile)) {
            var html = fs.readFileSync(htmlFile, 'utf8');
            return html + '<br><br><br>';
        }
        return 'Not found: ' + term;
    }
}
exports.HelpView = HelpView;
//# sourceMappingURL=helpView.js.map