"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HelpView = exports.helpView = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const fs = tslib_1.__importStar(require("fs"));
const path = tslib_1.__importStar(require("path"));
const os = tslib_1.__importStar(require("os"));
const visualText_1 = require("./visualText");
class HelpView {
    constructor(context) {
        this.context = context;
        vscode.commands.registerCommand('helpView.lookup', (resource) => this.lookup(resource));
        vscode.commands.registerCommand('helpView.lookupBrowser', (resource) => this.lookupBrowser(resource));
        vscode.commands.registerCommand('helpView.windowCHMHelp', (resource) => this.windowCHMHelp(resource));
        vscode.commands.registerCommand('helpView.openBrowserFunctionHelp', this.openBrowserFunctionHelp);
        vscode.commands.registerCommand('helpView.openBrowserVariableHelp', this.openBrowserVariableHelp);
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
    lookupBrowser(resource) {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let cursorPosition = editor.selection.start;
            let wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
            if (wordRange) {
                const text = this.getTerm(editor, wordRange);
                var helpPath = visualText_1.visualText.getVisualTextDirectory('Help');
                helpPath = path.join(helpPath, 'helps', text + '.htm');
                if (!fs.existsSync(helpPath)) {
                    vscode.window.showErrorMessage(`File does not exist: ${helpPath}`);
                    return;
                }
                vscode.env.openExternal(vscode.Uri.file(helpPath));
            }
        }
    }
    lookup(resource) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const cursorPosition = editor.selection.start;
            const wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
            if (wordRange) {
                const word = this.getTerm(editor, wordRange);
                visualText_1.visualText.displayHelpFile(word, word);
            }
        }
    }
    getTerm(editor, wordRange) {
        let term = editor.document.getText(wordRange);
        if (wordRange.start.character > 0) {
            const startPos = new vscode.Position(wordRange.start.line, wordRange.start.character - 1);
            const endPos = new vscode.Position(wordRange.end.line, wordRange.end.character);
            const dollarRange = new vscode.Range(startPos, endPos);
            const dollarWord = editor.document.getText(dollarRange);
            if (dollarWord[0] == '$')
                term = dollarWord;
        }
        return term;
    }
    getWebviewContent(term) {
        const dir = path.join(visualText_1.visualText.getVisualTextDirectory('Help'), 'helps');
        const htmlFile = path.join(dir, term + '.htm');
        if (fs.existsSync(htmlFile)) {
            const html = fs.readFileSync(htmlFile, 'utf8');
            return html + '<br><br><br>';
        }
        return 'Not found: ' + term;
    }
    windowCHMHelp(resource) {
        if (os.platform() == 'win32') {
            const helpPath = path.join(visualText_1.visualText.getVisualTextDirectory('Help'), 'Help.chm');
            if (fs.existsSync(helpPath)) {
                const cp = require('child_process');
                cp.exec(`"${helpPath}"`, (err, stdout, stderr) => {
                    if (err) {
                        console.error('Error opening help file:', err);
                        vscode.window.showErrorMessage(`Failed to open help file: ${err.message}`);
                        return;
                    }
                    console.log('stdout: ' + stdout);
                    console.log('stderr: ' + stderr);
                });
            }
            else {
                vscode.window.showErrorMessage(`File does not exist: ${helpPath}`);
            }
        }
        else {
            vscode.window.showInformationMessage('Couldn\'t open Windows help file');
        }
    }
    openBrowserFunctionHelp() {
        var helpPath = visualText_1.visualText.getVisualTextDirectory('Help');
        helpPath = path.join(helpPath, 'helps', 'NLP_PP_Stuff', 'Functions' + '.htm');
        vscode.env.openExternal(vscode.Uri.file(helpPath));
    }
    openBrowserVariableHelp() {
        var helpPath = visualText_1.visualText.getVisualTextDirectory('Help');
        helpPath = path.join(helpPath, 'helps', 'NLP_PP_Stuff', 'Variable_types' + '.htm');
        vscode.env.openExternal(vscode.Uri.file(helpPath));
    }
}
exports.HelpView = HelpView;
//# sourceMappingURL=helpView.js.map