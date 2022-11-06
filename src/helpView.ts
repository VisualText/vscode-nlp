import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { visualText } from './visualText';

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

    createPanel(): vscode.WebviewPanel {
        return vscode.window.createWebviewPanel(
            'helpView',
            'NLP++ Help',
            {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false
            }
        );
    }

    lookupBrowser(resource: vscode.Uri) {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let cursorPosition = editor.selection.start;
			let wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
			let text = editor.document.getText(wordRange);

            var url = 'http://visualtext.org/help/' + text + '.htm';
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
        }
    }
    
    lookup(resource: vscode.Uri) {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let cursorPosition = editor.selection.start;
			let wordRange = editor.document.getWordRangeAtPosition(cursorPosition);

            if (wordRange) {
                if (!this.exists) {
                    this.panel = this.createPanel();
                    this.panel.onDidDispose(
                        () => {
                            this.exists = false;
                        },
                        null,
                        this.context.subscriptions
                    );
                    this.exists = true;
                }
                if (this.panel) {
                    let word = editor.document.getText(wordRange);
                    var startPos = new vscode.Position(wordRange.start.line,wordRange.start.character-1);
                    var endPos = new vscode.Position(wordRange.end.line,wordRange.end.character);
                    var dollarRange = new vscode.Range(startPos, endPos);
                    let dollarWord = editor.document.getText(dollarRange);
                    if (dollarWord[0] == '$')
                        this.panel.webview.html = this.getWebviewContent(dollarWord);
                    else
                        this.panel.webview.html = this.getWebviewContent(word);
                }
            }                
         }
    }

    getWebviewContent(term: string): string {
        let dir = path.join(visualText.getVisualTextDirectory('Help'),'helps');
        let htmlFile = path.join(dir,term+'.htm');
        if (fs.existsSync(htmlFile)) {
            var html = fs.readFileSync(htmlFile, 'utf8');
            return html + '<br><br><br>';
        }
        return 'Not found: ' + term;
    }

    windowCHMHelp() {
        if (os.platform() == 'win32') {
            let cmd = path.join(visualText.getVisualTextDirectory('Help'),'Help.chm');
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