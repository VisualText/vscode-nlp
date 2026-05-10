"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLPCommands = exports.nlpCommands = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const treeFile_1 = require("./treeFile");
const nlp_1 = require("./nlp");
const textFile_1 = require("./textFile");
class NLPCommands {
    constructor(ctx) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyze', this.analyze));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.analyzeDir', this.analyzeDir));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.reformatRule', this.reformatRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.reformatOneLine', this.reformatOneLine));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.reformatParens', this.reformatParens));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.searchWord', this.searchWord));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.goToFunction', this.goToFunction));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.ruleFired', this.ruleFired));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openSelTree', this.openSelTree));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.generateRule', this.generateRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.generateExactRule', this.generateExactRule));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.copyContext', this.copyContext));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.openPassFile', this.openPassFile));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.duplicateLine', this.duplicateLine));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.commentLines', this.commentLines));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.selectSequence', this.selectSequence));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.passTree', this.passTree));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.displayMatchedRules', this.displayMatchedRulesNLP));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.sortText', this.sortText));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.lowerCase', this.lowerCase));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.removeAccents', this.removeAccents));
        ctx.subscriptions.push(vscode.commands.registerCommand('nlp.runPython', this.runPython));
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
    static attach(ctx) {
        if (!exports.nlpCommands) {
            exports.nlpCommands = new NLPCommands(ctx);
        }
        return exports.nlpCommands;
    }
    video() {
        const url = 'http://vscode2.visualtext.org';
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
    }
    sortText() {
        if (vscode.window.activeTextEditor) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const textFile = new textFile_1.TextFile(editor.document.uri.fsPath, true, editor.document.getText());
                const selFlag = editor.selection.isEmpty ? false : true;
                if (selFlag)
                    textFile.getSelectedLines(editor);
                textFile.sortLines(selFlag);
                textFile.rollupLines(selFlag);
                textFile.linesToText(editor, selFlag);
                const firstLine = editor.document.lineAt(0);
                const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
                const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
                editor.edit(function (editBuilder) {
                    editBuilder.replace(textRange, textFile.getText());
                });
            }
        }
    }
    lowerCase() {
        if (vscode.window.activeTextEditor) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const range = new vscode.Range(editor.selection.start, editor.selection.end);
                const str = editor.document.getText(range);
                const snippet = new vscode.SnippetString(str.toLowerCase());
                editor.insertSnippet(snippet, range);
            }
        }
    }
    removeAccents() {
        if (vscode.window.activeTextEditor) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const text = editor.document.getText();
                const textNoAccents = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const range = new vscode.Range(editor.document.lineAt(0).range.start, editor.document.lineAt(editor.document.lineCount - 1).range.end);
                const snippet = new vscode.SnippetString(textNoAccents);
                editor.insertSnippet(snippet, range);
            }
        }
    }
    runPython() {
        if (vscode.window.activeTextEditor) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const textFile = new textFile_1.TextFile(editor.document.uri.fsPath);
                textFile.runPython(editor);
            }
        }
    }
    passTree() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.passTree(vscode.window.activeTextEditor);
        }
    }
    displayMatchedRulesNLP() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.openRuleMatchesText(vscode.window.activeTextEditor);
        }
    }
    selectSequence() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.selectSequence(vscode.window.activeTextEditor);
        }
    }
    commentLines() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.commentLines(vscode.window.activeTextEditor);
        }
    }
    duplicateLine() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.duplicateLine(vscode.window.activeTextEditor);
        }
    }
    searchWord() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.searchWord(vscode.window.activeTextEditor);
        }
    }
    goToFunction() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.searchWord(vscode.window.activeTextEditor, true);
        }
    }
    reformatRule() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.reformatRule(vscode.window.activeTextEditor, nlp_1.reformatType.NORMAL);
        }
    }
    reformatOneLine() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.reformatRule(vscode.window.activeTextEditor, nlp_1.reformatType.ONELINE);
        }
    }
    reformatParens() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.reformatRule(vscode.window.activeTextEditor, nlp_1.reformatType.PARENS);
        }
    }
    ruleFired() {
        if (vscode.window.activeTextEditor) {
            const treeFile = new treeFile_1.TreeFile();
            treeFile.findRule(vscode.window.activeTextEditor);
        }
    }
    openSelTree() {
        if (vscode.window.activeTextEditor) {
            const treeFile = new treeFile_1.TreeFile();
            treeFile.findSelectedTree(vscode.window.activeTextEditor);
        }
    }
    copyContext() {
        if (vscode.window.activeTextEditor) {
            const nlpFile = new nlp_1.NLPFile();
            nlpFile.copyContext(vscode.window.activeTextEditor);
        }
    }
    generateRule() {
        if (vscode.window.activeTextEditor) {
            const treeFile = new treeFile_1.TreeFile();
            treeFile.generateRule(vscode.window.activeTextEditor, treeFile_1.generateType.GENERAL);
        }
    }
    generateExactRule() {
        if (vscode.window.activeTextEditor) {
            const treeFile = new treeFile_1.TreeFile();
            treeFile.generateRule(vscode.window.activeTextEditor, treeFile_1.generateType.EXACT);
        }
    }
    analyze() {
        if (vscode.window.activeTextEditor) {
            const nlp = new nlp_1.NLPFile();
            const uri = vscode.window.activeTextEditor.document.uri;
            nlp.analyze(uri);
        }
    }
    analyzeDir() {
        if (vscode.window.activeTextEditor) {
            const nlp = new nlp_1.NLPFile();
            const uri = vscode.window.activeTextEditor.document.uri;
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
            const treeFile = new treeFile_1.TreeFile();
            treeFile.highlightText(vscode.window.activeTextEditor);
        }
    }
    ruleFiredLog() {
        if (vscode.window.activeTextEditor) {
            const treeFile = new treeFile_1.TreeFile();
            treeFile.ruleFired(vscode.window.activeTextEditor);
        }
    }
    generatePath() {
        if (vscode.window.activeTextEditor) {
            const treeFile = new treeFile_1.TreeFile();
            treeFile.generatePath(vscode.window.activeTextEditor);
        }
    }
    openPassFile() {
        if (vscode.window.activeTextEditor) {
            const nlp = new nlp_1.NLPFile();
            nlp.openPassFile(vscode.window.activeTextEditor);
        }
    }
}
exports.NLPCommands = NLPCommands;
//# sourceMappingURL=command.js.map