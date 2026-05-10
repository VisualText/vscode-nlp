"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextFile = exports.nlpFileType = exports.separatorType = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
var separatorType;
(function (separatorType) {
    separatorType[separatorType["SEP_UNKNOWN"] = 0] = "SEP_UNKNOWN";
    separatorType[separatorType["SEP_R"] = 1] = "SEP_R";
    separatorType[separatorType["SEP_RN"] = 2] = "SEP_RN";
    separatorType[separatorType["SEP_N"] = 3] = "SEP_N";
})(separatorType = exports.separatorType || (exports.separatorType = {}));
var nlpFileType;
(function (nlpFileType) {
    nlpFileType[nlpFileType["UNKNOWN"] = 0] = "UNKNOWN";
    nlpFileType[nlpFileType["TXT"] = 1] = "TXT";
    nlpFileType[nlpFileType["NLP"] = 2] = "NLP";
    nlpFileType[nlpFileType["TXXT"] = 3] = "TXXT";
    nlpFileType[nlpFileType["TREE"] = 4] = "TREE";
    nlpFileType[nlpFileType["KB"] = 5] = "KB";
    nlpFileType[nlpFileType["KBB"] = 6] = "KBB";
})(nlpFileType = exports.nlpFileType || (exports.nlpFileType = {}));
class TextFile {
    constructor(filepath = '', separateLines = true) {
        this.uri = vscode.Uri.file('');
        this.filepath = '';
        this.text = '';
        this.textNormalized = '';
        this.sepNormalized = '\n';
        this.sepType = separatorType.SEP_UNKNOWN;
        this.sep = '';
        this.lines = new Array();
        this.linesNormalized = new Array();
        this.filetype = nlpFileType.UNKNOWN;
        this.tabsize = 4;
        this.basename = '';
        this.nlpFileExts = new Array('unknown', 'txt', 'nlp', 'txxt', 'log', 'kb', 'kbb');
        this.exists = false;
        this.selLines = [];
        if (filepath.length)
            this.setFile(vscode.Uri.file(filepath), separateLines);
    }
    positionAt(offset) {
        let lineNum = 0;
        let character = 0;
        let len = 0;
        for (let line of this.lines) {
            if (len + line.length >= offset) {
                character = offset - len + 1;
                break;
            }
            len += line.length + 1;
            lineNum++;
        }
        return new vscode.Position(lineNum, character);
    }
    getSelectedLines(editor) {
        this.selLines = [];
        let start = editor.selection.start;
        let end = editor.selection.end;
        var i = 0;
        for (i = start.line; i <= end.line; i++) {
            this.selLines.push(this.lines[i]);
        }
        return this.selLines;
    }
    cleanZeroZero() {
        if (this.text.length) {
            if (this.text.indexOf('\x00') >= 0) {
                this.text = this.text.replace(/\x00/g, '');
                try {
                    fs.writeFileSync(this.uri.path, this.text, { flag: 'w' });
                    return true;
                }
                catch (err) {
                    console.log('Error writing file ' + this.uri.path + ': ' + err.message);
                    return false;
                }
            }
        }
        return false;
    }
    getExtension(type) {
        return this.nlpFileExts[type];
    }
    setStr(str, separateLines = true) {
        this.text = str;
        this.separation(separateLines);
    }
    setFile(file, separateLines = true) {
        this.exists = false;
        this.clear();
        if (file.path.length && fs.existsSync(file.path)) {
            this.uri = file;
            this.filepath = file.path;
            this.text = fs.readFileSync(this.filepath, 'utf8');
            this.setFileType(this.filepath);
            if (this.text.length)
                this.separation(separateLines);
            this.exists = true;
        }
        return this.exists;
    }
    setDocument(editor, separateLines = true) {
        this.clear();
        this.uri = editor.document.uri;
        this.filepath = editor.document.uri.path;
        var firstLine = editor.document.lineAt(0);
        var lastLine = editor.document.lineAt(editor.document.lineCount - 1);
        var textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
        this.text = editor.document.getText(textRange);
        this.setFileType(this.filepath);
        this.separation(separateLines);
    }
    setFileType(filename) {
        this.basename = path.basename(filename, '.nlp');
        this.basename = path.basename(this.basename, '.pat');
        this.filetype = nlpFileType.NLP;
        if (path.extname(filename) == '.txt')
            this.filetype = nlpFileType.TXT;
        else if (path.extname(filename) == '.txxt')
            this.filetype = nlpFileType.TXXT;
        else if (path.extname(filename) == '.kb')
            this.filetype = nlpFileType.KB;
        else if (path.extname(filename) == '.kbb')
            this.filetype = nlpFileType.KBB;
        else if (path.extname(filename) == '.log')
            this.filetype = nlpFileType.TREE;
    }
    fileExists() {
        return this.exists;
    }
    isFileType(type) {
        return type == this.filetype;
    }
    getFileType() {
        return this.filetype;
    }
    getUri() {
        return this.uri;
    }
    getBasename() {
        return this.basename;
    }
    clear() {
        this.uri = vscode.Uri.file('');
        this.filepath = '';
        this.text = '';
        this.sepType = separatorType.SEP_UNKNOWN;
        this.sep = '';
        this.lines = [];
    }
    separation(separateLines = true) {
        if (this.text.length == 0)
            this.setFile(this.uri, separateLines);
        if (this.text.length) {
            var counts_rn = this.text.split('\r\n');
            var counts_r = this.text.split('\r');
            var counts_n = this.text.split('\n');
            this.sepType = separatorType.SEP_UNKNOWN;
            this.sep = '';
            if (counts_rn.length > 1) {
                this.sepType = separatorType.SEP_RN;
                this.sep = '\r\n';
            }
            else if (counts_r.length > 1) {
                this.sepType = separatorType.SEP_R;
                this.sep = '\r';
            }
            else if (counts_n.length > 1) {
                this.sepType = separatorType.SEP_N;
                this.sep = '\n';
            }
            if (separateLines)
                this.separateLines();
        }
    }
    normalizeText() {
        if (this.sepType == separatorType.SEP_RN) {
            const regReplace = new RegExp(this.sep, 'g');
            this.textNormalized = this.text.replace(regReplace, this.sepNormalized);
        }
        else {
            this.textNormalized = this.text;
        }
        return this.textNormalized;
    }
    unnormalizeText(text) {
        if (this.sepType == separatorType.SEP_RN) {
            const regReplace = new RegExp(this.sepNormalized, 'g');
            this.textNormalized = text.replace(regReplace, this.sep);
        }
        else {
            this.textNormalized = text;
        }
        return this.textNormalized;
    }
    separateLines() {
        this.lines = [];
        if (this.sepType != separatorType.SEP_UNKNOWN && this.text.length) {
            this.lines = this.text.split(this.sep);
        }
    }
    getText(normalized = false) {
        if (normalized) {
            if (this.textNormalized.length == 0) {
                this.normalizeText();
            }
            return this.textNormalized;
        }
        return this.text;
    }
    numberOfLines() {
        return this.lines.length;
    }
    getLines(normalized = false) {
        if (normalized) {
            if (this.linesNormalized.length == 0) {
                for (let line of this.lines) {
                    this.linesNormalized.push(line.concat(this.sepNormalized));
                }
            }
            return this.linesNormalized;
        }
        return this.lines;
    }
    getSeparatorLength() {
        return this.sep.length;
    }
    getSeparator() {
        return this.sep;
    }
    getSeparatorNormalized() {
        return this.sep;
    }
}
exports.TextFile = TextFile;
//# sourceMappingURL=textFile.js.map