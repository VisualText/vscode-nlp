import * as vscode from 'vscode';
import { TreeFile, generateType } from './treeFile';
import { NLPFile } from './nlp';
import { TextFile } from './textFile';

export let nlpCommands: NLPCommands;
export class NLPCommands {
    _ctx: vscode.ExtensionContext;

    private constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyze', this.analyze));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyzeDir', this.analyzeDir));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.reformatRule', this.reformatRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.searchWord', this.searchWord));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.goToFunction', this.goToFunction));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.ruleFired', this.ruleFired));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openSelTree', this.openSelTree));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.generateRule', this.generateRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.generateExactRule', this.generateExactRule));

        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openPassFile', this.openPassFile));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.duplicateLine', this.duplicateLine));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.commentLines', this.commentLines));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.selectSequence', this.selectSequence));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.passTree', this.passTree));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.displayMatchedRules', this.displayMatchedRulesNLP));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.sortText', this.sortText));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.lowerCase', this.lowerCase));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.foldAll', this.foldAll));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.unfoldAll', this.unfoldAll));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.foldRecursively', this.foldRecursively));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.unfoldRecursively', this.unfoldRecursively));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.highlightText', this.highlightText));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.ruleFired', this.ruleFiredLog));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.generatePath', this.generatePath));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.openPassFile', this.openPassFile));
        ctx.subscriptions.push(vscode.commands.registerCommand('log.displayMatchedRules', this.displayMatchedRulesNLP));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.video', this.video));
    }

    static attach(ctx: vscode.ExtensionContext): NLPCommands {
        if (!nlpCommands) {
            nlpCommands = new NLPCommands(ctx);
        }
        return nlpCommands;
    }

    video() {
		var url = 'http://vscode2.visualtext.org';
		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
	}
    
    sortText() {
        if (vscode.window.activeTextEditor) {
            let editor = vscode.window.activeTextEditor;
            if (editor) {
                let textFile = new TextFile(editor.document.uri.fsPath,true,editor.document.getText());
                let selFlag = editor.selection.isEmpty ? false : true;
                if (selFlag)
                    textFile.getSelectedLines(editor);
                textFile.sortLines(selFlag);
                textFile.rollupLines(selFlag);
                textFile.linesToText(editor,selFlag);

                var firstLine = editor.document.lineAt(0);
                var lastLine = editor.document.lineAt(editor.document.lineCount - 1);
                var textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
                editor.edit(function (editBuilder) {
                    editBuilder.replace(textRange, textFile.getText());
                });
            }
        }
    }

    lowerCase() {
        if (vscode.window.activeTextEditor) {
            let editor = vscode.window.activeTextEditor;
            if (editor) {
                var range = new vscode.Range(editor.selection.start, editor.selection.end);
				let str = editor.document.getText(range);
				var snippet = new vscode.SnippetString(str.toLowerCase());
				editor.insertSnippet(snippet,range);
            }
        }
    }

    passTree() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.passTree(vscode.window.activeTextEditor);
        }
    }

    displayMatchedRulesNLP() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.openRuleMatchesText(vscode.window.activeTextEditor);
        }
    }

    selectSequence() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.selectSequence(vscode.window.activeTextEditor);
        }
    }

    commentLines() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.commentLines(vscode.window.activeTextEditor);
        }
    }

    duplicateLine() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.duplicateLine(vscode.window.activeTextEditor);
        }
    }

    searchWord() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.searchWord(vscode.window.activeTextEditor);
        }
    }

    goToFunction() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.searchWord(vscode.window.activeTextEditor,true);
        }
    }

    reformatRule() {
        if (vscode.window.activeTextEditor) {
            var nlpFile = new NLPFile();
            nlpFile.reformatRule(vscode.window.activeTextEditor);
        }
    }

    ruleFired() {
        if (vscode.window.activeTextEditor) {
            var logFile = new TreeFile();
            logFile.findRule(vscode.window.activeTextEditor);
        }
    }

    openSelTree() {
        if (vscode.window.activeTextEditor) {
            var logFile = new TreeFile();
            logFile.findSelectedTree(vscode.window.activeTextEditor);
        }
    }
        
    generateRule() {
        if (vscode.window.activeTextEditor) {
            var logFile = new TreeFile();
            logFile.generateRule(vscode.window.activeTextEditor,generateType.GENERAL);
        }
    }

    generateExactRule() {
        if (vscode.window.activeTextEditor) {
            var logFile = new TreeFile();
            logFile.generateRule(vscode.window.activeTextEditor,generateType.EXACT);
        }
    }

    analyze() {
        if (vscode.window.activeTextEditor) {
            var nlp = new NLPFile();
            var uri = vscode.window.activeTextEditor.document.uri;
            nlp.analyze(uri);
        }
    }

    analyzeDir() {
        if (vscode.window.activeTextEditor) {
            var nlp = new NLPFile();
            var uri = vscode.window.activeTextEditor.document.uri;
            nlp.analyze(uri);
        }
    }

    foldAll() {
        if (vscode.window.activeTextEditor) {
            vscode.commands.executeCommand('editor.foldAll');
        }
    }
    
    unfoldAll() {
        if (vscode.window.activeTextEditor) {
            vscode.commands.executeCommand('editor.unfoldAll');
        }
    }

    foldRecursively() {
        if (vscode.window.activeTextEditor) {
            vscode.commands.executeCommand('editor.foldRecursively');
        }
    }
    
    unfoldRecursively() {
        if (vscode.window.activeTextEditor) {
            vscode.commands.executeCommand('editor.unfoldRecursively');
        }
    }
    
    
    highlightText() {
        if (vscode.window.activeTextEditor) {
            var logFile = new TreeFile();
            logFile.highlightText(vscode.window.activeTextEditor);
        }
    }
    
    ruleFiredLog() {
        if (vscode.window.activeTextEditor) {
            var logFile = new TreeFile();
            logFile.ruleFired(vscode.window.activeTextEditor);
        }
    }

    generatePath() {
        if (vscode.window.activeTextEditor) {
            var logFile = new TreeFile();
            logFile.generatePath(vscode.window.activeTextEditor);
        }
    }

    openPassFile() {
        if (vscode.window.activeTextEditor) {
            var nlp = new NLPFile();
            nlp.openPassFile(vscode.window.activeTextEditor);
        }
    }
}
