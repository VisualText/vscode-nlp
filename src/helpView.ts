import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { visualText } from './visualText';

export let helpView: HelpView;
export class HelpView {

    panel: vscode.WebviewPanel | undefined;
    exists: boolean;
    ctx: vscode.ExtensionContext;

    constructor(private context: vscode.ExtensionContext) {
        vscode.commands.registerCommand('helpView.lookup', (resource) => this.lookup(resource));
        vscode.commands.registerCommand('helpView.lookupBrowser', (resource) => this.lookupBrowser(resource));
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
			let text = editor.document.getText(wordRange);

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
                this.panel.webview.html = this.getWebviewContent(text);
            }
        }
    }

    getWebviewContent(term: string) {
        let dir = path.join(visualText.getVisualTextDirectory('Help'),'helps');
        let htmlFile = path.join(dir,term+'.htm');
        if (fs.existsSync(htmlFile)) {
            var html = fs.readFileSync(htmlFile, 'utf8');
            return html + '<br><br><br>';
        }
        return 'Not found: ' + term;
    }
}