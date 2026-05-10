"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLPFile = exports.nlpFile = exports.reformatType = exports.analyzerType = exports.analyzerOperation = exports.analyzerStatus = exports.anaQueueStatus = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const dirfuncs_1 = require("./dirfuncs");
const textFile_1 = require("./textFile");
const visualText_1 = require("./visualText");
const logView_1 = require("./logView");
const sequence_1 = require("./sequence");
const sequenceView_1 = require("./sequenceView");
const status_1 = require("./status");
const outputView_1 = require("./outputView");
var anaQueueStatus;
(function (anaQueueStatus) {
    anaQueueStatus[anaQueueStatus["UNKNOWN"] = 0] = "UNKNOWN";
    anaQueueStatus[anaQueueStatus["RUNNING"] = 1] = "RUNNING";
    anaQueueStatus[anaQueueStatus["DONE"] = 2] = "DONE";
    anaQueueStatus[anaQueueStatus["FAILED"] = 3] = "FAILED";
})(anaQueueStatus || (exports.anaQueueStatus = anaQueueStatus = {}));
var analyzerStatus;
(function (analyzerStatus) {
    analyzerStatus[analyzerStatus["UNKNOWN"] = 0] = "UNKNOWN";
    analyzerStatus[analyzerStatus["ANALYZING"] = 1] = "ANALYZING";
    analyzerStatus[analyzerStatus["DONE"] = 2] = "DONE";
    analyzerStatus[analyzerStatus["FAILED"] = 3] = "FAILED";
})(analyzerStatus || (exports.analyzerStatus = analyzerStatus = {}));
var analyzerOperation;
(function (analyzerOperation) {
    analyzerOperation[analyzerOperation["UNKNOWN"] = 0] = "UNKNOWN";
    analyzerOperation[analyzerOperation["RUN"] = 1] = "RUN";
    analyzerOperation[analyzerOperation["STOP"] = 2] = "STOP";
})(analyzerOperation || (exports.analyzerOperation = analyzerOperation = {}));
var analyzerType;
(function (analyzerType) {
    analyzerType[analyzerType["UNKNOWN"] = 0] = "UNKNOWN";
    analyzerType[analyzerType["FILE"] = 1] = "FILE";
    analyzerType[analyzerType["DIRECTORY"] = 2] = "DIRECTORY";
})(analyzerType || (exports.analyzerType = analyzerType = {}));
var reformatType;
(function (reformatType) {
    reformatType[reformatType["NORMAL"] = 0] = "NORMAL";
    reformatType[reformatType["ONELINE"] = 1] = "ONELINE";
    reformatType[reformatType["PARENS"] = 2] = "PARENS";
})(reformatType || (exports.reformatType = reformatType = {}));
class NLPFile extends textFile_1.TextFile {
    constructor(filepath = '', separateLines = true, text = '') {
        super();
        this.anaQueue = new Array();
        this.timerStatus = anaQueueStatus.UNKNOWN;
        this.timerID = 0;
        this.stopAllFlag = false;
        if (text.length)
            this.setText(text, separateLines);
        else if (filepath.length)
            this.setFile(vscode.Uri.file(filepath), separateLines);
    }
    analyze(filepath) {
        if (visualText_1.visualText.processID) {
            vscode.window.showWarningMessage("Analyzer already running");
            return;
        }
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzer",
            cancellable: true
        }, (progress, token) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            token.onCancellationRequested(() => {
                status_1.nlpStatusBar.analyzerButton();
                visualText_1.visualText.nlp.stopAll();
                console.log("User canceled analyzer");
                return;
            });
            // Check to see if the engine executable is there
            const exe = visualText_1.visualText.exePath().fsPath;
            if (!exe.length || !fs.existsSync(exe)) {
                vscode.window.showErrorMessage("NLP Engine missing", "Download Now").then(response => {
                    visualText_1.visualText.startUpdater();
                });
            }
            const engineDir = path.dirname(exe);
            visualText_1.visualText.readState();
            vscode.commands.executeCommand('workbench.action.files.saveAll');
            // Delete files in output directory
            progress.report({ increment: 10, message: "Running..." });
            dirfuncs_1.dirfuncs.emptyDir(visualText_1.visualText.analyzer.getOutputDirectory().fsPath);
            dirfuncs_1.dirfuncs.emptyDir(visualText_1.visualText.analyzer.getLogDirectory().fsPath);
            const filestr = filepath.fsPath;
            visualText_1.visualText.analyzer.setCurrentTextFile(filepath);
            visualText_1.visualText.analyzer.saveAnalyzerState();
            const filename = path.basename(filepath.fsPath);
            const typeStr = dirfuncs_1.dirfuncs.isDir(filepath.fsPath) ? 'directory' : 'file';
            logView_1.logView.addMessage('Analyzing ' + typeStr + ': ' + filename, logView_1.logLineType.ANALYER_OUTPUT, filepath);
            vscode.commands.executeCommand('logView.refreshAll');
            outputView_1.outputView.setType(outputView_1.outputFileType.ALL);
            const pos = filestr.search('input');
            const anapath = filestr.substring(0, pos);
            const mode = status_1.nlpStatusBar.getDevMode();
            const devFlagStr = mode == status_1.DevMode.DEV ? '-DEV' : mode == status_1.DevMode.SILENT ? '-SILENT' : '';
            const args = ['-ANA', '"' + anapath + '"', '-WORK', '"' + engineDir + '"', '"' + filestr + '"', devFlagStr];
            visualText_1.visualText.nlp.setAnalyzerStatus(filepath, analyzerStatus.ANALYZING);
            const cp = require('child_process');
            return new Promise(resolve => {
                status_1.nlpStatusBar.analyzerButton(false);
                visualText_1.visualText.processID = cp.execFile(exe, args, (err, stdout, stderr) => {
                    const outputDir = path.join(visualText_1.visualText.getCurrentAnalyzer().fsPath, "output");
                    const outFile = vscode.Uri.file(path.join(outputDir, 'stdout.log'));
                    const errFile = vscode.Uri.file(path.join(outputDir, 'stderr.log'));
                    dirfuncs_1.dirfuncs.writeFile(outFile.fsPath, stdout);
                    dirfuncs_1.dirfuncs.writeFile(errFile.fsPath, stderr);
                    console.log('stdout: ' + stdout);
                    console.log('stderr: ' + stderr);
                    let syntaxError = logView_1.logView.syntaxErrorsOutput('err.log');
                    if (!syntaxError)
                        syntaxError = logView_1.logView.syntaxErrorsLog('make_ana');
                    if (err || syntaxError) {
                        if (err)
                            logView_1.logView.addMessage(err.message, logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(filestr));
                        visualText_1.visualText.nlp.setAnalyzerStatus(filepath, analyzerStatus.FAILED);
                        status_1.nlpStatusBar.resetAnalyzerButton();
                        if (syntaxError)
                            logView_1.logView.loadMakeAna();
                        else if (!logView_1.logView.makeAna())
                            logView_1.logView.loadAnalyzerOuts();
                        vscode.commands.executeCommand('outputView.refreshAll');
                        vscode.commands.executeCommand('logView.refreshAll');
                        resolve('Failed');
                    }
                    else {
                        logView_1.logView.loadAnalyzerOuts();
                        const typeStr = dirfuncs_1.dirfuncs.isDir(filestr) ? 'directory' : 'file';
                        logView_1.logView.addMessage('Done analyzing ' + typeStr + ': ' + filename, logView_1.logLineType.ANALYER_OUTPUT, vscode.Uri.file(filestr));
                        visualText_1.visualText.analyzer.saveCurrentFile(filepath);
                        vscode.commands.executeCommand('textView.refreshAll');
                        vscode.commands.executeCommand('outputView.refreshAll');
                        vscode.commands.executeCommand('sequenceView.refreshAll');
                        vscode.commands.executeCommand('analyzerView.refreshAll');
                        vscode.commands.executeCommand('kbView.refreshAll');
                        visualText_1.visualText.nlp.setAnalyzerStatus(filepath, analyzerStatus.DONE);
                        status_1.nlpStatusBar.resetAnalyzerButton();
                        resolve('Processed');
                    }
                }).pid;
            });
        }));
    }
    stopAll() {
        visualText_1.visualText.nlp.stopAllFlag = true;
    }
    setAnalyzerStatus(uri, status) {
        for (const o of visualText_1.visualText.nlp.anaQueue) {
            if (o.uri.fsPath == uri.fsPath) {
                o.status = status;
                break;
            }
        }
    }
    addAnalyzer(uri, type) {
        if (type == analyzerType.FILE) {
            this.anaQueue.push({ uri: uri, operation: analyzerOperation.RUN, status: analyzerStatus.UNKNOWN, type: type });
        }
        else {
            this.addDirsRecursive(uri, type);
        }
    }
    addDirsRecursive(dir, type) {
        const files = dirfuncs_1.dirfuncs.getFiles(dir);
        if (files.length > 0 && !dirfuncs_1.dirfuncs.directoryIsLog(dir.fsPath)) {
            this.anaQueue.push({ uri: dir, operation: analyzerOperation.RUN, status: analyzerStatus.UNKNOWN, type: type });
        }
        const dirs = dirfuncs_1.dirfuncs.getDirectories(dir);
        for (const subdir of dirs) {
            this.addDirsRecursive(subdir, type);
        }
    }
    startAnalyzer(mils = 100) {
        if (visualText_1.visualText.nlp.timerID == 0) {
            logView_1.logView.clearLogs(false);
            vscode.commands.executeCommand('logView.clear');
            visualText_1.visualText.debugMessage('Analyzing...', logView_1.logLineType.ANALYER_OUTPUT);
            visualText_1.visualText.nlp.timerID = +setInterval(this.analyzerTimer, mils);
        }
    }
    analyzerTimer() {
        let op = visualText_1.visualText.nlp.anaQueue[0];
        const len = visualText_1.visualText.nlp.anaQueue.length;
        let alldone = true;
        let opNum = 0;
        if (visualText_1.visualText.nlp.stopAllFlag) {
            visualText_1.visualText.nlp.shutDown();
            return;
        }
        for (const o of visualText_1.visualText.nlp.anaQueue) {
            opNum++;
            if (o.status == analyzerStatus.UNKNOWN || o.status == analyzerStatus.ANALYZING) {
                op = o;
                alldone = false;
                break;
            }
            else if (o.status != analyzerStatus.FAILED && o.status != analyzerStatus.DONE) {
                alldone = false;
            }
        }
        if (alldone) {
            vscode.commands.executeCommand('setContext', 'anaOps.running', false);
            visualText_1.visualText.nlp.stopAllFlag = false;
            visualText_1.visualText.nlp.timerStatus = anaQueueStatus.DONE;
        }
        else {
            vscode.commands.executeCommand('setContext', 'anaOps.running', true);
            visualText_1.visualText.nlp.timerStatus = anaQueueStatus.RUNNING;
        }
        //SIMPLE STATE MACHINE
        switch (visualText_1.visualText.nlp.timerStatus) {
            case anaQueueStatus.RUNNING: {
                if (op.status == analyzerStatus.UNKNOWN) {
                    switch (op.operation) {
                        case analyzerOperation.RUN: {
                            op.status = analyzerStatus.ANALYZING;
                            visualText_1.visualText.nlp.analyze(op.uri);
                            break;
                        }
                    }
                }
                break;
            }
            case anaQueueStatus.DONE: {
                visualText_1.visualText.nlp.shutDown();
                break;
            }
        }
    }
    shutDown() {
        clearInterval(visualText_1.visualText.nlp.timerID);
        visualText_1.visualText.debugMessage('Analyzing done', logView_1.logLineType.ANALYER_OUTPUT);
        visualText_1.visualText.nlp.stopAllFlag = false;
        visualText_1.visualText.nlp.timerID = 0;
        visualText_1.visualText.nlp.anaQueue = [];
    }
    insertRule(ruleStr) {
        visualText_1.visualText.colorizeAnalyzer();
        vscode.window.showTextDocument(this.getUri(), { viewColumn: vscode.ViewColumn.Beside }).then(editor => {
            const len = this.getText().length;
            const pos = editor.document.positionAt(len);
            editor.edit(edit => {
                edit.insert(pos, ruleStr);
            });
        });
    }
    replaceContext(newContextStr, beside = true) {
        visualText_1.visualText.colorizeAnalyzer();
        if (beside) {
            vscode.window.showTextDocument(this.getUri(), { viewColumn: vscode.ViewColumn.Beside }).then(editor => {
                this.replaceContextLine(newContextStr, editor);
            });
        }
        else {
            vscode.window.showTextDocument(this.getUri()).then(editor => {
                this.replaceContextLine(newContextStr, editor);
            });
        }
    }
    replaceContextLine(newContextStr, editor) {
        const contextSel = this.findLineSelection(newContextStr);
        if (!contextSel.isEmpty) {
            const snippet = new vscode.SnippetString(newContextStr);
            editor.insertSnippet(snippet, contextSel);
        }
    }
    findLineSelection(line) {
        let contextSel = this.findLineStartsWith('@NODES');
        if (contextSel.isEmpty)
            contextSel = this.findLineStartsWith('@PATH');
        if (contextSel.isEmpty)
            contextSel = this.findLineStartsWith('@MULTI');
        return contextSel;
    }
    replaceContextLineInFile(newContextStr) {
        const contextSel = this.findLineSelection(newContextStr);
        const line = contextSel.start.line;
        this.replaceLineNumber(line, newContextStr);
        this.saveFileLines();
    }
    searchWord(editor, functionFlag = false) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP) {
            const cursorPosition = editor.selection.start;
            const wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
            const highlight = editor.document.getText(wordRange);
            sequenceView_1.sequenceView.search(highlight, functionFlag);
        }
    }
    selectSequence(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP) {
            sequenceView_1.sequenceView.reveal(editor.document.fileName);
        }
    }
    passTree(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP) {
            sequenceView_1.sequenceView.passTree(editor.document.fileName);
        }
        else if (this.getFileType() == textFile_1.nlpFileType.TXXT) {
            const passNum = this.passNumberFromAna(editor.document.uri.fsPath);
            sequenceView_1.sequenceView.openTreeFile(passNum);
        }
    }
    openRuleMatchesText(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP) {
            sequenceView_1.sequenceView.openTreeFileFromPath(editor.document.fileName);
        }
        else if (this.getFileType() == textFile_1.nlpFileType.TREE) {
            const passNum = this.passNumberFromAna(editor.document.uri.fsPath);
            sequenceView_1.sequenceView.openRuleMatchFile(passNum);
        }
    }
    passNumberFromAna(filePath) {
        return parseInt(filePath.substring(filePath.length - 8, filePath.length - 5));
    }
    openPassFile(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.TREE || this.getFileType() == textFile_1.nlpFileType.TXXT) {
            const passNum = this.passNumberFromAna(editor.document.uri.fsPath);
            const seqFile = new sequence_1.SequenceFile();
            seqFile.init();
            const passFileUri = seqFile.getUriByPassNumber(passNum);
            if (fs.existsSync(passFileUri.fsPath)) {
                visualText_1.visualText.colorizeAnalyzer();
                vscode.window.showTextDocument(passFileUri);
            }
            else
                vscode.window.showWarningMessage('No pass file ' + path.basename(passFileUri.fsPath));
        }
    }
    commentLines(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP) {
            const start = editor.selection.start;
            const end = editor.selection.end;
            let startLine = start.line;
            let newLineStr = '';
            let lastLineLength = 0;
            const lines = this.getSelectedLines(editor);
            if (lines.length) {
                let addingFlag = false;
                for (let line of lines) {
                    // Use first line to determine adding or removing
                    if (startLine == start.line) {
                        addingFlag = line.charAt(0) == '#' ? false : true;
                    }
                    const commented = line.charAt(0) == '#' ? true : false;
                    if (addingFlag && !commented && line.length) {
                        line = '#' + line;
                    }
                    if (!addingFlag && commented) {
                        line = line.substring(1);
                    }
                    if (newLineStr) {
                        newLineStr = newLineStr + this.getSeparator();
                    }
                    newLineStr = newLineStr + line;
                    lastLineLength = line.length;
                    startLine++;
                }
                if (newLineStr.length) {
                    const posStart = new vscode.Position(start.line, 0);
                    const posEnd = new vscode.Position(end.line, lastLineLength + 1);
                    const range = new vscode.Range(posStart, posEnd);
                    newLineStr = newLineStr.replace(/\$/g, '\\$');
                    const snippet = new vscode.SnippetString(newLineStr);
                    editor.insertSnippet(snippet, range);
                }
            }
        }
    }
    reformatRule(editor, type) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP) {
            const rulevars = this.findRuleText(editor);
            if (rulevars[0].length) {
                const formattedRule = this.formatRule(rulevars[0], type);
                const rang = new vscode.Selection(rulevars[1].start, rulevars[1].end);
                const snippet = new vscode.SnippetString(formattedRule);
                editor.insertSnippet(snippet, rang);
            }
        }
    }
    duplicateLine(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP || this.getFileType() == textFile_1.nlpFileType.DICT || this.getFileType() == textFile_1.nlpFileType.KBB) {
            const rulestr = '';
            const position = editor.selection.active;
            const lines = this.getLines(true);
            let line = lines[position.line];
            const posEnd = new vscode.Position(position.line + 1, 0);
            const rang = new vscode.Selection(posEnd, posEnd);
            line = line.replace(/\$/g, '\\$');
            const snippet = new vscode.SnippetString(line);
            editor.insertSnippet(snippet, rang);
            editor.selection = rang;
        }
    }
    findRuleText(editor) {
        let rulestr = '';
        const position = editor.selection.active;
        let lineStart = position.line;
        let charStart = position.character;
        let lineEnd = position.line;
        let charEnd = position.character;
        const lines = this.getLines(true);
        let line = lines[lineStart];
        let lastline = line;
        let multilined = false;
        let arrowFlag = false;
        let atSignFlag = false;
        let pos = 0;
        while ((pos = line.search('<-')) < 0) {
            rulestr = line + rulestr;
            lastline = line;
            line = lines[--lineStart];
            multilined = true;
            arrowFlag = true;
        }
        rulestr = line + rulestr;
        if (lineStart < position.line)
            charStart = 0;
        else
            charStart = pos + 3;
        multilined = false;
        line = lines[lineEnd];
        let firsttime = true;
        while ((pos = line.search('@@')) < 0) {
            if (!firsttime)
                rulestr = rulestr + line;
            lastline = line;
            line = lines[++lineEnd];
            firsttime = false;
            atSignFlag = true;
        }
        rulestr += line;
        charEnd = pos + 2;
        charStart = 0;
        const posStart = new vscode.Position(lineStart, charStart);
        const posEnd = new vscode.Position(lineEnd, charEnd);
        const range = new vscode.Range(posStart, posEnd);
        if (rulestr.length == 0) {
            rulestr = lastline.substring(charStart, charEnd - charStart);
        }
        return [rulestr, range, arrowFlag, atSignFlag];
    }
    formatRule(ruleStr, type = reformatType.NORMAL) {
        let state;
        (function (state) {
            state[state["UNKNOWN"] = 0] = "UNKNOWN";
            state[state["SUGGESTED"] = 1] = "SUGGESTED";
            state[state["ARROW"] = 2] = "ARROW";
            state[state["NODE"] = 3] = "NODE";
            state[state["NODE_DONE"] = 4] = "NODE_DONE";
            state[state["ATTR"] = 5] = "ATTR";
            state[state["ATTR_END"] = 6] = "ATTR_END";
            state[state["COMMENT"] = 7] = "COMMENT";
            state[state["ATAT"] = 8] = "ATAT";
        })(state || (state = {}));
        ;
        let formattedRule = ruleStr.replace(this.getSeparatorNormalized(), ' ');
        const rules = [];
        const rulelinesFinal = new Array();
        let words = new Array();
        let currentState = state.UNKNOWN;
        let word = '';
        let isSpace = false;
        let lastSpace = false;
        let backSlash = false;
        let suggested = false;
        let c = '';
        let cNext = '';
        // Parse rule string
        for (let i = 0; i < ruleStr.length; i++) {
            c = ruleStr[i];
            cNext = i < ruleStr.length - 1 ? ruleStr[i + 1] : '';
            isSpace = !/\S/.test(c);
            if (backSlash) {
                word += c;
                backSlash = false;
                continue;
            }
            backSlash = c == '\\' ? true : false;
            // Skip more than one space
            if (isSpace && lastSpace && c != '\n')
                continue;
            // Waiting for next or first node
            if (currentState == state.UNKNOWN && !isSpace) {
                currentState = suggested ? state.NODE : state.SUGGESTED;
                suggested = true;
                // @@
            }
            else if (c == '@' && cNext == '@') {
                if (word.length)
                    words.push(word);
                break;
                // <-
            }
            else if (currentState == state.SUGGESTED && c == '<' && cNext == '-') {
                if (word.length)
                    words.push(word);
                words.push('<-');
                rules.push({ suggested: words[0], rule: '', comment: '' });
                words = [];
                word = '';
                currentState = state.ARROW;
                i++;
                continue;
                // First node after arrow
            }
            else if (currentState == state.ARROW && !isSpace) {
                currentState = state.NODE;
                // Finished picking up the first node in a rule line
            }
            else if (currentState == state.NODE && (isSpace || c == '[')) {
                currentState = state.NODE_DONE;
                words.push(word);
                word = '';
                if (c == '[') {
                    words.push(c);
                    currentState = state.ATTR;
                    word = '';
                    continue;
                }
                // Found starting attribute bracket
            }
            else if (currentState == state.NODE_DONE && c == '[') {
                words.push(c);
                currentState = state.ATTR;
                word = '';
                continue;
                // If you have one node followed immediately by another or a new line
            }
            else if (currentState == state.NODE_DONE && (c == '\n' || (!isSpace && c != '[' && c != '#'))) {
                if (word.length) {
                    words.push(word);
                }
                this.constructLine(rules, words, type);
                words = [];
                word = '';
                currentState = state.NODE;
                // Ending a bracketed attribute area
            }
            else if (currentState == state.ATTR && c == ']') {
                if (word.length)
                    words.push(word);
                words.push(c);
                word = '';
                currentState = state.ATTR_END;
                continue;
                // Ending a bracketed attribute area
            }
            else if (currentState == state.ATTR && (c == ')' || c == '(')) {
                if (word.length)
                    words.push(word);
                words.push(c);
                word = '';
                continue;
                // Is a comment
            }
            else if (currentState == state.ATTR_END && c == '#') {
                currentState = state.COMMENT;
                // New line
            }
            else if ((currentState == state.NODE || currentState == state.COMMENT || currentState == state.ATTR_END) && c == '\n') {
                if (word.length)
                    words.push(word);
                this.constructLine(rules, words, type);
                words = [];
                word = '';
                currentState = state.NODE;
                // Is a new node on the same line?
            }
            else if (currentState == state.ATTR_END && !isSpace) {
                this.constructLine(rules, words, type);
                words = [];
                word = '';
                currentState = state.UNKNOWN;
            }
            if (!isSpace) {
                word += c;
            }
            else if (word.length && isSpace && !lastSpace) {
                if (word.startsWith('#'))
                    currentState = state.COMMENT;
                words.push(word);
                word = '';
            }
            lastSpace = isSpace;
        }
        if (words.length)
            this.constructLine(rules, words, type);
        // Find longest line
        let maxLine = 0;
        let maxComment = 0;
        for (const rule of rules) {
            let total = rule.rule.length;
            if (total > maxLine)
                maxLine = total;
            total = rule.comment.length;
            if (total > maxComment)
                maxComment = total;
        }
        if (maxComment)
            maxComment += 1; // For space after user comment
        // Construct reformated string
        const tabsize = 4;
        const tabsMax = Math.floor(maxLine / tabsize);
        const tabsCommentMax = Math.floor(maxComment / tabsize);
        let nodeNumber = 1;
        let ruleLine = '';
        let hasAtAt = false;
        for (const rule of rules) {
            if (rule.rule == '@@') {
                ruleLine = type == reformatType.ONELINE ? '@@' : '\t@@';
                hasAtAt = true;
            }
            else if (rule.suggested.length) {
                ruleLine = rule.suggested + ' <-';
            }
            else {
                const tabstr = this.tabString(rule.rule.length, tabsize, tabsMax);
                const tabCommentStr = this.tabString(rule.comment.length, tabsize, tabsCommentMax);
                const commentStr = rule.comment.length ? rule.comment + ' \t' : tabsCommentMax > 0 ? tabCommentStr : '';
                if (type == reformatType.ONELINE)
                    ruleLine = rule.rule;
                else
                    ruleLine = '\t' + rule.rule + tabstr + '### ' + commentStr + '(' + nodeNumber.toString() + ')';
                nodeNumber++;
            }
            rulelinesFinal.push(ruleLine);
        }
        if (!hasAtAt)
            rulelinesFinal.push('\t@@');
        const sep = type == reformatType.ONELINE ? '' : this.getSeparator();
        formattedRule = rulelinesFinal.join(sep);
        return formattedRule;
    }
    tabString(length, tabsize, tabsmax) {
        const tabsline = Math.floor(length) / tabsize;
        const tabs = tabsmax - tabsline + 1;
        let tabstr = '\t';
        for (let i = 1; i < tabs; i++) {
            tabstr = tabstr + '\t';
        }
        return tabstr;
    }
    constructLine(rules, words, type) {
        // Check for user  or auto-generated comment
        const lastOne = words[words.length - 1];
        const second = lastOne.substring(1, lastOne.length - 1);
        const parsed = parseInt(second);
        const isNumeric = isNaN(parsed) ? false : true;
        const lastIsNodeNumber = lastOne.startsWith('(') && lastOne.endsWith(')') && isNumeric ? true : false;
        let commentStart = 0;
        let userComment = '';
        let found = false;
        commentStart = words.length - 1;
        for (const word of words.reverse()) {
            if (word.startsWith('#')) {
                found = true;
                break;
            }
            commentStart--;
        }
        words.reverse();
        let word = ''; // Declare word here
        if (found) {
            const end = lastIsNodeNumber ? words.length - 1 : words.length;
            for (let i = commentStart + 1; i < end; i++) {
                word = words[i];
                if (userComment.length)
                    userComment += ' ';
                userComment += word;
            }
        }
        // Construct Line
        if (!words.length)
            return '';
        let line = '';
        let nextWord = '';
        let lastWord = '';
        let parenFlag = false;
        for (let i = 0; i < words.length; i++) {
            if (commentStart && i == commentStart)
                break;
            word = words[i];
            nextWord = i < words.length - 1 ? words[i + 1] : '';
            if (type == reformatType.PARENS && (word == '(' || word == ')')) {
                parenFlag = word == '(' ? true : false;
                if (word == ')')
                    line += '\n\t\t';
            }
            else if (parenFlag) {
                line += '\n\t\t\t';
            }
            line += word;
            if (i < words.length - 1 && word != '[' && word != '(' && !word.endsWith('=')
                && nextWord != ')' && nextWord != ']' && nextWord != '='
                && lastWord != '=')
                line += ' ';
            lastWord = word;
        }
        const ruleLine = type == reformatType.ONELINE ? line : line.trimEnd();
        rules.push({ suggested: '', rule: ruleLine, comment: userComment });
    }
    copyContext(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.NLP) {
            sequenceView_1.sequenceView.replaceContext(editor.document.fileName);
        }
    }
    getContextLine(uri) {
        this.setFile(uri);
        let contextLine = '';
        for (const line of this.getLines()) {
            if (line.startsWith('@NODES') || line.startsWith('@PATH') || line.startsWith('@MULTI')) {
                contextLine = line;
                break;
            }
        }
        return contextLine;
    }
}
exports.NLPFile = NLPFile;
//# sourceMappingURL=nlp.js.map