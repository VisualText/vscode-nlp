import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { visualText } from './visualText';
import { ETIME } from 'constants';

export let helpView: HelpView;
export class HelpView {

    panel: vscode.WebviewPanel | undefined;
    exists: boolean;
    ctx: vscode.ExtensionContext;

    constructor(private context: vscode.ExtensionContext) {
        vscode.commands.registerCommand('helpView.lookup', (resource) => this.lookup(resource));
        vscode.commands.registerCommand('helpView.lookupBrowser', (resource) => this.lookupBrowser(resource));
        vscode.commands.registerCommand('helpView.windowCHMHelp', (resource) => this.windowCHMHelp(resource));
        vscode.commands.registerCommand('helpView.openBrowserFunctionHelp', this.openBrowserFunctionHelp);
        vscode.commands.registerCommand('helpView.openBrowserVariableHelp', this.openBrowserVariableHelp);
        this.exists = false;
        this.ctx = context;
        this.panel = undefined;
    }

    static attach(ctx: vscode.ExtensionContext) {
        if (!helpView) {
            helpView = new HelpView(ctx);
        }
        return helpView;
    }

    lookupBrowser(resource: vscode.Uri) {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let cursorPosition = editor.selection.start;
            let wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
            if (wordRange) {
                const text = this.getTerm(editor, wordRange);
                var helpPath = visualText.getVisualTextDirectory('Help');
                helpPath = path.join(helpPath, 'helps', text + '.htm');
                if (!fs.existsSync(helpPath)) {
                    vscode.window.showErrorMessage(`File does not exist: ${helpPath}`);
                    return;
                }
                vscode.env.openExternal(vscode.Uri.file(helpPath));
            }
        }
    }

    lookup(resource: vscode.Uri) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const cursorPosition = editor.selection.start;
            const wordRange = editor.document.getWordRangeAtPosition(cursorPosition);

            if (wordRange) {
                const word = this.getTerm(editor, wordRange);
                visualText.displayHelpFile(word, word);
            }
        }
    }

    getTerm(editor: vscode.TextEditor, wordRange: vscode.Range): string {
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

    getWebviewContent(term: string): string {
        const dir = path.join(visualText.getVisualTextDirectory('Help'), 'helps');
        const htmlFile = path.join(dir, term + '.htm');
        if (fs.existsSync(htmlFile)) {
            const html = fs.readFileSync(htmlFile, 'utf8');
            return html + '<br><br><br>';
        }
        return 'Not found: ' + term;
    }

    windowCHMHelp(resource: vscode.Uri) {
        if (os.platform() == 'win32') {
            const helpPath = path.join(visualText.getVisualTextDirectory('Help'), 'Help.chm');
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
            } else {
                vscode.window.showErrorMessage(`File does not exist: ${helpPath}`);
            }

        } else {
            vscode.window.showInformationMessage('Couldn\'t open Windows help file');
        }
    }

    openBrowserFunctionHelp() {
        var helpPath = visualText.getVisualTextDirectory('Help');
        helpPath = path.join(helpPath, 'helps', 'NLP_PP_Stuff', 'Functions' + '.htm');
        vscode.env.openExternal(vscode.Uri.file(helpPath));

    }

    openBrowserVariableHelp() {
        var helpPath = visualText.getVisualTextDirectory('Help');
        helpPath = path.join(helpPath, 'helps', 'NLP_PP_Stuff', 'Variable_types' + '.htm');
        vscode.env.openExternal(vscode.Uri.file(helpPath));
    }
}
