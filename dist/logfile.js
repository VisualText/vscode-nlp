"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogFile = exports.logFile = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const visualText_1 = require("./visualText");
const textFile_1 = require("./textFile");
const nlp_1 = require("./nlp");
const status_1 = require("./status");
const sequence_1 = require("./sequence");
const dirfuncs_1 = require("./dirfuncs");
class LogFile extends textFile_1.TextFile {
    constructor() {
        super();
        this.fireds = new Array();
        this.highlights = new Array();
        this.selectedTreeStr = '';
        this.selStart = -1;
        this.selEnd = -1;
        this.logFile = '';
        this.highlightFile = '';
        this.inputFile = '';
        this.selectedLines = [];
    }
    ruleFired(editor) {
        if (visualText_1.visualText.analyzer.hasText()) {
            this.setFile(editor.document.uri);
            this.parseLogLines(editor);
            if (this.selStart >= 0) {
                var seqFile = new sequence_1.SequenceFile();
                seqFile.init();
                var passNum = this.selectedLines[0].passNum;
                if (passNum) {
                    var passFile = seqFile.getUriByPassNumber(passNum);
                    vscode.window.showTextDocument(passFile).then(edit => {
                        var pos = new vscode.Position(this.selectedLines[0].ruleLine - 1, 0);
                        var range = new vscode.Range(pos, pos);
                        edit.selections = [new vscode.Selection(pos, pos)];
                        edit.revealRange(range);
                    });
                }
            }
        }
    }
    hightlightText(editor) {
        if (visualText_1.visualText.analyzer.hasText()) {
            this.setFile(editor.document.uri);
            this.parseLogLines(editor);
            if (this.selStart >= 0) {
                vscode.window.showTextDocument(visualText_1.visualText.analyzer.getTextPath()).then(edit => {
                    var txt = new textFile_1.TextFile(visualText_1.visualText.analyzer.getTextPath().path);
                    var posStart = txt.positionAt(this.selStart - 1);
                    var posEnd = txt.positionAt(this.selEnd);
                    var range = new vscode.Range(posStart, posEnd);
                    edit.selections = [new vscode.Selection(posStart, posEnd)];
                    edit.revealRange(range);
                });
            }
        }
    }
    parseLogLines(editor) {
        let lines = this.getSelectedLines(editor);
        this.selectedLines = [];
        this.selStart = -1;
        this.selEnd = -1;
        for (let line of lines) {
            let logLine = this.parseLogLine(line);
            if (this.selStart < 0 || logLine.start < this.selStart)
                this.selStart = logLine.start;
            if (this.selEnd < 0 || logLine.end > this.selEnd)
                this.selEnd = logLine.end;
            this.selectedLines.push(logLine);
        }
    }
    findRule(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.TXXT) {
            this.setFilesNames(this.getUri().path);
            if (this.parseBrackets()) {
                this.parseFireds(this.logFile);
                var absolute = this.lineCharacterToAbsolute(editor.selection.active);
                if (absolute >= 0) {
                    var firedNumber = this.findMatchByAbsolute(absolute);
                    if (firedNumber >= 0) {
                        var chosen = this.fireds[firedNumber];
                        var ruleFileUri = visualText_1.visualText.analyzer.seqFile.getUriByPassNumber(chosen.rule);
                        vscode.window.showTextDocument(ruleFileUri).then(editor => {
                            var pos = new vscode.Position(chosen.ruleline - 1, 0);
                            editor.selections = [new vscode.Selection(pos, pos)];
                            var range = new vscode.Range(pos, pos);
                            editor.revealRange(range);
                        });
                    }
                }
            }
        }
    }
    setFile(file, separateLines = true) {
        if (file.path.length) {
            super.setFile(file, separateLines);
            this.setFilesNames(file.path);
            return true;
        }
        return false;
    }
    setFilesNames(filepath) {
        if (filepath.length) {
            this.basename = path.basename(filepath, '.log');
            this.basename = path.basename(this.basename, '.txxt');
            this.basename = path.basename(this.basename, '.txt');
            this.basename = path.basename(this.basename, '.pat');
            this.basename = path.basename(this.basename, '.nlp');
            this.logFile = path.join(visualText_1.visualText.analyzer.getOutputDirectory().path, this.basename + '.log');
            this.highlightFile = path.join(visualText_1.visualText.analyzer.getOutputDirectory().path, this.basename + '.txxt');
            this.inputFile = visualText_1.visualText.analyzer.getTextPath().path;
        }
    }
    hasLogFileType(uri, pass, type = textFile_1.nlpFileType.TREE) {
        var anaFile = this.anaFile(pass, type);
        if (type == textFile_1.nlpFileType.TREE) {
            this.setFile(anaFile, true);
            if (this.numberOfLines() > 6)
                return true;
            return false;
        }
        return fs.existsSync(anaFile.path);
    }
    anaFile(pass, type = textFile_1.nlpFileType.TREE) {
        var filename = 'ana';
        if (pass < 10)
            filename = filename + '00';
        else if (pass < 100)
            filename = filename + '0';
        filename = filename + pass.toString() + '.' + this.getExtension(type);
        return vscode.Uri.file(path.join(visualText_1.visualText.analyzer.getOutputDirectory().path, filename));
    }
    findSelectedTreeStr(editor) {
        this.setDocument(editor);
        this.selectedTreeStr = '';
        if (this.getFileType() == textFile_1.nlpFileType.TXXT || this.getFileType() == textFile_1.nlpFileType.TXT) {
            if (this.getFileType() == textFile_1.nlpFileType.TXT) {
                this.setFilesNames(visualText_1.visualText.analyzer.getAnaLogFile().path);
                this.absoluteRangeFromSelection(this.getUri().path, editor.selection);
            }
            else {
                this.setFilesNames(this.getUri().path);
                this.absoluteRangeFromSelection(this.highlightFile, editor.selection);
            }
            this.findLogfileLines();
        }
        return this.selectedTreeStr.length ? true : false;
    }
    generateRule(editor) {
        if (visualText_1.visualText.analyzer.hasText()) {
            let passFilePath = visualText_1.visualText.analyzer.getPassPath();
            let passName = visualText_1.visualText.analyzer.seqFile.base(passFilePath.path);
            let passItem = visualText_1.visualText.analyzer.seqFile.findPass('pat', passName);
            this.logFile = this.anaFile(passItem.passNum).path;
            if (this.findSelectedTreeStr(editor)) {
                let num = 1;
                let ruleStr = '';
                let lastend = 0;
                for (let line of this.selectedLines) {
                    let node = line.node;
                    if (line.end > lastend) {
                        if (line.type.localeCompare('white') == 0)
                            node = '_xWHITE';
                        else if (line.type.localeCompare('num') == 0)
                            node = '_xNUM';
                        else if (line.type.localeCompare('punct') == 0)
                            node = `\\${node}`;
                        let newRuleStr = `\t${node}\t### (${num})`;
                        ruleStr = ruleStr + '\n' + newRuleStr;
                        num++;
                    }
                    lastend = line.end;
                }
                let nlp = new nlp_1.NLPFile();
                nlp.setStr(ruleStr);
                ruleStr = nlp.formatRule(ruleStr);
                let ruleStrFinal = `
				
@RULES
_newNode <-
${ruleStr}
\t@@
`;
                nlp.setFile(passFilePath);
                nlp.insertRule(ruleStrFinal);
            }
        }
    }
    parseLogLine(line) {
        let logLine = { node: '', start: 0, end: 0, passNum: 0, ruleLine: 0, type: '', fired: false, built: false, rest: '' };
        var tokens = line.split('[');
        if (tokens.length > 1) {
            logLine.node = tokens[0].trim();
            var toks = tokens[1].split(/[,\]]/);
            if (toks.length >= 4) {
                logLine.start = +toks[0];
                logLine.end = +toks[1];
                logLine.passNum = +toks[2];
                logLine.ruleLine = +toks[3];
                logLine.type = toks[4];
                if (toks.length > 5) {
                    if (toks[5].length)
                        logLine.fired = true;
                }
                if (toks.length > 6) {
                    if (toks[6].length > 0)
                        logLine.built = true;
                }
            }
        }
        return logLine;
    }
    findSelectedTree(editor) {
        if (this.findSelectedTreeStr(editor)) {
            var filename = this.basename + '-' + this.selStart.toString() + '-' + this.selEnd.toString() + '.log';
            this.openNewFile(filename, this.selectedTreeStr);
        }
    }
    openNewFile(filepath, content) {
        const newFile = vscode.Uri.parse('untitled:' + filepath);
        vscode.workspace.openTextDocument(newFile).then(document => {
            const edit = new vscode.WorkspaceEdit();
            edit.insert(newFile, new vscode.Position(0, 0), content);
            return vscode.workspace.applyEdit(edit).then(success => {
                if (success) {
                    vscode.window.showTextDocument(document);
                }
                else {
                    vscode.window.showInformationMessage('Error!');
                }
            });
        });
    }
    bracketCount(text, end = 0) {
        if (end) {
            text = text.substr(0, end);
        }
        var brackets = text.split(/\[\[/);
        var brackets2 = text.split(/\]\]/);
        var curly = text.split(/\{\{/);
        var curly2 = text.split(/\}\}/);
        var bracketCount = ((brackets.length + brackets2.length - 2)) * 2;
        var curlyCount = ((curly.length + curly2.length - 2)) * 2;
        return bracketCount + curlyCount;
    }
    absoluteRangeFromSelection(textfile, selection) {
        var absStart = 0;
        var absEnd = 0;
        var file = new textFile_1.TextFile(textfile);
        var sep = file.getSeparator();
        var sepLength = file.getSeparatorLength();
        var linecount = 0;
        var multiline = false;
        for (let line of file.getLines(true)) {
            if (multiline) {
                if (selection.end.line == linecount) {
                    absEnd += selection.end.character - this.bracketCount(line, selection.end.character);
                    break;
                }
                absEnd += line.length + this.bracketCount(line);
                if (line.length == 0)
                    absEnd += 1;
            }
            else if (selection.start.line == linecount) {
                absStart += selection.start.character - this.bracketCount(line, selection.start.character);
                if (selection.end.line == linecount) {
                    var selStr = line.substr(selection.start.character, selection.end.character - selection.start.character);
                    absEnd = absStart + selection.end.character - selection.start.character - this.bracketCount(selStr) - 1;
                    break;
                }
                absEnd = absStart + line.length - this.bracketCount(line);
                multiline = true;
            }
            else {
                absStart += line.length - this.bracketCount(line);
                if (line.length == 0)
                    absStart += 1;
            }
            linecount++;
        }
        this.selStart = absStart;
        this.selEnd = absEnd;
    }
    findLogfileLines() {
        var file = new textFile_1.TextFile(this.logFile);
        var sep = file.getSeparatorNormalized();
        var from = 0;
        var to = 0;
        var add = false;
        this.selectedLines = [];
        this.selectedTreeStr = '';
        for (let line of file.getLines()) {
            from = 0;
            to = 0;
            add = false;
            var tokens = line.split('[');
            if (tokens.length > 1) {
                var toks = tokens[1].split(/[,\]]/);
                if (toks.length > 2) {
                    from = +toks[0];
                    to = +toks[1];
                    if (from >= this.selStart && to <= this.selEnd) {
                        this.selectedLines.push(this.parseLogLine(line));
                        this.selectedTreeStr = this.selectedTreeStr.concat(line, sep);
                    }
                }
            }
        }
    }
    findMatchByAbsolute(absolute) {
        var firedNumber = 0;
        for (let highlight of this.highlights) {
            if (highlight.startb <= absolute && absolute <= highlight.endb) {
                return firedNumber;
            }
            firedNumber++;
        }
        return -1;
    }
    lineCharacterToAbsolute(position) {
        var file = new textFile_1.TextFile(this.highlightFile);
        var lineCount = 0;
        var absolute = 0;
        for (let line of file.getLines()) {
            if (lineCount == position.line) {
                return absolute + position.character;
            }
            absolute += line.length;
            lineCount++;
        }
        return -1;
    }
    parseBrackets() {
        this.highlights = [];
        var squares = this.parseBracketsRegex('[');
        var curlies = this.parseBracketsRegex('{');
        return squares + curlies;
    }
    parseBracketsRegex(bracket) {
        var startPattern = bracket === '[' ? '\[\[' : '\{\{';
        var endPattern = bracket === '[' ? '\]\]' : '\}\}';
        var file = new textFile_1.TextFile(this.highlightFile, false);
        var tokens = file.getText(true).split(startPattern);
        var tokencount = 0;
        var len = 0;
        var lenBracket = 0;
        var start = 0;
        var end = 0;
        var startBracket = 0;
        var endBracket = 0;
        for (let token of tokens) {
            token = token.replace(/[\n\r]/g, '');
            if (tokencount) {
                var toks = token.split(endPattern);
                start = len;
                end = len + toks[0].length - 1;
                startBracket = lenBracket;
                endBracket = lenBracket + toks[0].length - 1;
                this.highlights.push({ start: start, end: end, startb: startBracket, endb: endBracket });
            }
            len += token.length;
            tokencount++;
            lenBracket += token.length + 2;
        }
        return tokencount - 1;
    }
    parseFireds(logfile) {
        var refire = /[\[,\]]/g;
        this.fireds = [];
        var file = new textFile_1.TextFile(logfile);
        var from = 0;
        var to = 0;
        var rulenum = 0;
        var ruleline = 0;
        for (let line of file.getLines()) {
            var tokens = line.split(',fired');
            if (tokens.length > 1) {
                var tts = line.split(refire);
                var blt = (tts.length >= 7 && tts[7] === 'blt') ? true : false;
                if (+tts[2] > to) {
                    from = +tts[1];
                    to = +tts[2];
                    rulenum = +tts[3];
                    ruleline = +tts[4];
                    if (status_1.nlpStatusBar.getFiredMode() == status_1.FiredMode.FIRED || blt)
                        this.fireds.push({ from: from, to: to, rule: rulenum, ruleline: ruleline, built: blt });
                }
            }
        }
        return this.fireds.length ? true : false;
    }
    firedFile(pass, rewrite = false) {
        var firefile = this.anaFile(pass, textFile_1.nlpFileType.TXXT);
        if (!fs.existsSync(firefile.path) || rewrite) {
            var logfile = this.anaFile(pass);
            if (fs.existsSync(logfile.path)) {
                this.parseFireds(logfile.path);
                this.writeFiredText(logfile, rewrite);
            }
        }
        return firefile;
    }
    fileCreateTime(filepath) {
        if (fs.existsSync(filepath)) {
            var stats = fs.statSync(filepath);
            if (stats)
                return stats.ctime;
        }
        return new Date(1970, 1, 1);
    }
    writeFiredText(logfile, rewrite = false) {
        this.setFilesNames(logfile.path);
        var logDate = this.fileCreateTime(logfile.path);
        var inputDate = this.fileCreateTime(this.inputFile);
        if (!rewrite && inputDate < logDate && fs.existsSync(this.highlightFile))
            return vscode.Uri.file(this.highlightFile);
        else if (!rewrite && !fs.existsSync(this.inputFile))
            return logfile;
        var file = new textFile_1.TextFile(this.inputFile, false);
        var textfire = '';
        var lastTo = 0;
        var between = '';
        var highlight = '';
        var from = 0;
        var to = 0;
        var built = false;
        if (this.fireds.length) {
            for (var i = 0; i < this.fireds.length; i++) {
                from = this.fireds[i].from;
                to = this.fireds[i].to;
                built = this.fireds[i].built;
                between = file.getText(true).substring(lastTo, from);
                highlight = file.getText(true).substring(from, to + 1);
                if (built)
                    textfire = textfire.concat(between, '[[', highlight, ']]');
                else if (status_1.nlpStatusBar.getFiredMode() == status_1.FiredMode.FIRED)
                    textfire = textfire.concat(between, '{{', highlight, '}}');
                else
                    textfire = textfire.concat(between, highlight);
                lastTo = to + 1;
            }
            textfire = textfire.concat(file.getText(true).substring(lastTo, file.getText(true).length));
        }
        else {
            textfire = file.getText(true);
        }
        fs.writeFileSync(this.highlightFile, file.unnormalizeText(textfire));
        this.fireds = [];
        return vscode.Uri.file(this.highlightFile);
    }
    updateTxxtFiles(fileType) {
        var exts = new Array('.' + this.getExtension(fileType));
        var files = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getOutputDirectory(), exts);
        for (let file of files) {
            var numStr = path.basename(file.path).substr(3, 3);
            var passNum = Number.parseInt(numStr);
            this.firedFile(passNum, true);
        }
    }
    deleteLogs(fileType) {
        var exts = new Array('.' + this.getExtension(fileType));
        dirfuncs_1.dirfuncs.deleteFiles(visualText_1.visualText.analyzer.getOutputDirectory(), exts);
    }
}
exports.LogFile = LogFile;
//# sourceMappingURL=logfile.js.map