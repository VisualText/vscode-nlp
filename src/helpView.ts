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
        vscode.commands.registerCommand('helpView.windowCHMHelp', this.windowCHMHelp);
        vscode.commands.registerCommand('helpView.openOnlineFunctionHelp', this.openOnlineFunctionHelp);
        vscode.commands.registerCommand('helpView.openOnlineVariableHelp', this.openOnlineVariableHelp);
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
                let text = this.getTerm(editor, wordRange);
                let helpPath = visualText.getVisualTextDirectory('Help');
                var filePath = path.join(helpPath, 'helps', text + '.htm');
                if (!fs.existsSync(filePath)) {
                    vscode.window.showErrorMessage(`File does not exist: ${filePath}`);
                    return;
                }
                vscode.env.openExternal(vscode.Uri.file(filePath));
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

    windowCHMHelp() {
        if (os.platform() == 'win32') {
            const cmd = path.join(visualText.getVisualTextDirectory('Help'), 'Help.chm');
            const cp = require('child_process');
            cp.exec(cmd, (err, stdout, stderr) => {
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
            });
        } else {
            vscode.window.showInformationMessage('Couldn\'t open Windows help file');
        }
    }

    openOnlineFunctionHelp() {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('http://visualtext.org/help/NLP_PP_Stuff/Functions.htm'));
    }

    openOnlineVariableHelp() {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('http://visualtext.org/help/NLP_PP_Stuff/Variable_types.htm'));
    }
}
