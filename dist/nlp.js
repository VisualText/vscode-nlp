"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLPFile = exports.nlpFile = void 0;
const vscode = require("vscode");
const path = require("path");
const dirfuncs_1 = require("./dirfuncs");
const textFile_1 = require("./textFile");
const visualText_1 = require("./visualText");
const logView_1 = require("./logView");
const sequenceView_1 = require("./sequenceView");
const status_1 = require("./status");
const outputView_1 = require("./outputView");
class NLPFile extends textFile_1.TextFile {
    constructor() {
        super();
    }
    analyze(filepath) {
        visualText_1.visualText.readState();
        vscode.commands.executeCommand('workbench.action.files.saveAll');
        // Delete files in output directory
        dirfuncs_1.dirfuncs.emptyDir(visualText_1.visualText.analyzer.getOutputDirectory().path);
        dirfuncs_1.dirfuncs.emptyDir(visualText_1.visualText.analyzer.getLogDirectory().path);
        const filestr = filepath.path;
        logView_1.logView.clearLogs();
        logView_1.logView.addMessage('Analyzing...', vscode.Uri.file(filestr));
        vscode.commands.executeCommand('logView.refreshAll');
        outputView_1.outputView.setType(outputView_1.outputFileType.TXT);
        var pos = filestr.search('/input/');
        var anapath = filestr.substr(0, pos);
        var engineDir = visualText_1.visualText.getEngineDirectory().path;
        var exe = path.join(engineDir, 'nlp.exe');
        var devFlagStr = status_1.nlpStatusBar.getDevMode() == status_1.DevMode.DEV ? '-DEV' : '';
        var cmd = `${exe} -ANA ${anapath} -WORK ${engineDir} ${filestr} ${devFlagStr}`;
        const cp = require('child_process');
        cp.exec(cmd, (err, stdout, stderr) => {
            console.log('stdout: ' + stdout);
            console.log('stderr: ' + stderr);
            if (err) {
                logView_1.logView.loadMakeAna();
                vscode.commands.executeCommand('outputView.refreshAll');
                vscode.commands.executeCommand('logView.refreshAll');
                return false;
            }
            else {
                logView_1.logView.addMessage('Done', vscode.Uri.file(filestr));
                logView_1.logView.loadMakeAna();
                visualText_1.visualText.analyzer.saveCurrentFile(filepath);
                vscode.commands.executeCommand('textView.refreshAll');
                vscode.commands.executeCommand('outputView.refreshAll');
                vscode.commands.executeCommand('logView.refreshAll');
                vscode.commands.executeCommand('sequenceView.refreshAll');
            }
        });
        return true;
    }
    insertRule(ruleStr) {
        vscode.window.showTextDocument(this.getUri()).then(editor => {
            let len = this.getText().length;
            let pos = editor.document.positionAt(len);
            editor.edit(edit => {
                edit.insert(pos, ruleStr);
            });
        });
    }
    searchWord(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP) {
            var selection = editor.selection;
            var text = editor.document.getText(selection);
            sequenceView_1.sequenceView.search(text);
        }
    }
    reformatRule(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP) {
            var rulevars = this.findRuleText(editor);
            if (rulevars[0].length) {
                var formattedRule = this.formatRule(rulevars[0]);
                var rang = new vscode.Selection(rulevars[1].start, rulevars[1].end);
                if (rulevars[1].start.line == rulevars[1].end.line) {
                    formattedRule = this.getSeparator() + formattedRule + this.getSeparator() + '\t';
                }
                var snippet = new vscode.SnippetString(formattedRule);
                editor.insertSnippet(snippet, rang);
            }
        }
    }
    findRuleText(editor) {
        var rulestr = '';
        var position = editor.selection.active;
        var lineStart = position.line;
        var charStart = position.character;
        var lineEnd = position.line;
        var charEnd = position.character;
        var lines = this.getLines(true);
        var line = lines[lineStart];
        var lastline = line;
        var multilined = false;
        var pos = 0;
        while ((pos = line.search('<-')) < 0) {
            rulestr = line + rulestr;
            lastline = line;
            line = lines[--lineStart];
            multilined = true;
        }
        if (lineStart < position.line)
            charStart = 0;
        else
            charStart = pos + 3;
        if (multilined)
            lineStart++;
        multilined = false;
        line = lines[lineEnd];
        var firsttime = true;
        while ((pos = line.search('@@')) < 0) {
            if (!firsttime)
                rulestr = rulestr + line;
            lastline = line;
            line = lines[++lineEnd];
            firsttime = false;
        }
        if (!firsttime) {
            lineEnd--;
            charEnd = lastline.length - 1;
        }
        else {
            charEnd = pos;
        }
        var posStart = new vscode.Position(lineStart, charStart);
        var posEnd = new vscode.Position(lineEnd, charEnd);
        var range = new vscode.Range(posStart, posEnd);
        if (rulestr.length == 0) {
            rulestr = lastline.substr(charStart, charEnd - charStart);
        }
        return [rulestr, range];
    }
    formatRule(ruleStr) {
        let state;
        (function (state) {
            state[state["UNKNOWN"] = 0] = "UNKNOWN";
            state[state["NODE"] = 1] = "NODE";
            state[state["ATTR_START"] = 2] = "ATTR_START";
            state[state["ATTR"] = 3] = "ATTR";
            state[state["ATTR_END"] = 4] = "ATTR_END";
            state[state["COMMENT"] = 5] = "COMMENT";
        })(state || (state = {}));
        ;
        var formattedRule = ruleStr.replace(this.getSeparatorNormalized(), ' ');
        var tokens = ruleStr.split(/\s+/);
        var currentState = state.UNKNOWN;
        var lastState = state.UNKNOWN;
        var lastToken = '';
        var rulelines = new Array();
        var rulelinesFinal = new Array();
        var ruleline = '';
        var maxline = 0;
        const nodeNumRegex = /\([\d]+\)/g;
        for (let token of tokens) {
            if (!token.length)
                continue;
            if (token.localeCompare('###') == 0 || token.match(nodeNumRegex)) {
                currentState = state.COMMENT;
            }
            else if (currentState == state.NODE && token.startsWith('[')) {
                currentState = state.ATTR_START;
                if (token.endsWith(']'))
                    currentState = state.ATTR_END;
            }
            else if (currentState == state.ATTR_START || currentState == state.ATTR) {
                if (token.endsWith(']'))
                    currentState = state.ATTR_END;
                else
                    currentState = state.ATTR;
            }
            else {
                currentState = state.NODE;
            }
            if (currentState != state.COMMENT) {
                if (currentState == state.NODE && (lastState == state.NODE || lastState == state.ATTR_END || lastState == state.COMMENT)) {
                    if (ruleline.length > maxline)
                        maxline = ruleline.length;
                    rulelines.push(ruleline);
                    ruleline = '';
                }
                if (ruleline.length > 1) {
                    ruleline = ruleline + ' ';
                }
                ruleline = ruleline + token;
            }
            lastToken = token;
            lastState = currentState;
        }
        if (ruleline.length > maxline)
            maxline = ruleline.length;
        rulelines.push(ruleline);
        var passnum = 1;
        var tabsize = 4;
        var tabsmax = Math.floor(maxline / tabsize);
        for (var line of rulelines) {
            var tabsline = Math.floor(line.length) / tabsize;
            var tabs = tabsmax - tabsline + 1;
            var tabstr = '\t';
            for (let i = 1; i < tabs; i++) {
                tabstr = tabstr + '\t';
            }
            rulelinesFinal.push('\t' + line + tabstr + '### (' + passnum.toString() + ')');
            passnum++;
        }
        formattedRule = rulelinesFinal.join(this.getSeparator());
        return formattedRule;
    }
}
exports.NLPFile = NLPFile;
//# sourceMappingURL=nlp.js.map