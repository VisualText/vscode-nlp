"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreeFile = exports.treeFile = exports.generateType = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const visualText_1 = require("./visualText");
const textFile_1 = require("./textFile");
const nlp_1 = require("./nlp");
const status_1 = require("./status");
const sequence_1 = require("./sequence");
const findFile_1 = require("./findFile");
const findView_1 = require("./findView");
const dirfuncs_1 = require("./dirfuncs");
const os = tslib_1.__importStar(require("os"));
var generateType;
(function (generateType) {
    generateType[generateType["GENERAL"] = 0] = "GENERAL";
    generateType[generateType["EXACT"] = 1] = "EXACT";
})(generateType || (exports.generateType = generateType = {}));
class TreeFile extends textFile_1.TextFile {
    constructor() {
        super();
        this.fireds = [];
        this.Highlight = [];
        this.selectedTreeStr = '';
        this.selStart = -1;
        this.selEnd = -1;
        this.treeFile = '';
        this.HighlightFile = '';
        this.inputFile = '';
        this.selectedLines = [];
        this.findFile = new findFile_1.FindFile();
    }
    ruleFired(editor) {
        if (visualText_1.visualText.analyzer.hasText()) {
            this.setFile(editor.document.uri);
            this.parseTreeLines(editor);
            if (this.selStart >= 0) {
                const tline = this.selectedLines[0];
                const passNum = tline.passNum;
                if (passNum) {
                    const seqFile = new sequence_1.SequenceFile();
                    seqFile.init();
                    const passFile = seqFile.getUriByPassNumber(passNum);
                    visualText_1.visualText.colorizeAnalyzer();
                    vscode.window.showTextDocument(passFile, { viewColumn: vscode.ViewColumn.Beside }).then(edit => {
                        const pos = new vscode.Position(this.selectedLines[0].ruleLine - 1, 0);
                        const range = new vscode.Range(pos, pos);
                        edit.selections = [new vscode.Selection(pos, pos)];
                        edit.revealRange(range);
                    });
                    // If 0,0, then search inside dictionary files
                }
                else if (tline.ruleLine == 0) {
                    this.searchInDictionaries(tline.node);
                }
            }
        }
    }
    searchInDictionaries(word) {
        const finalMatches = [];
        let searchWord = word.toLowerCase();
        let str = searchWord;
        if (searchWord.startsWith('_')) {
            searchWord = word.substring(1);
            str = this.gatherChildrenText();
            if (searchWord == 'phrase') {
                searchWord = str;
            }
            else {
                searchWord = 's=' + word.substring(1);
            }
        }
        this.findFile.searchFiles(visualText_1.visualText.analyzer.getKBDirectory(), searchWord, ['.dict'], 0, false, false);
        const matches = this.findFile.getMatches();
        for (const match of matches) {
            if (this.matchDictLine(str, match.highlighted)) {
                finalMatches.push(match);
            }
        }
        // Display the find(s)
        if (finalMatches.length >= 1) {
            findView_1.findView.openFile(finalMatches[0]);
            findView_1.findView.loadFinds(searchWord, finalMatches);
            findView_1.findView.setSearchWord(searchWord);
            vscode.commands.executeCommand('findView.updateTitle');
            vscode.commands.executeCommand('findView.refreshAll');
        }
    }
    matchDictLine(original, line) {
        const tokens = line.split('=');
        if (tokens.length > 1) {
            const toks = tokens[0].split('\s');
            const lastIndex = tokens[0].lastIndexOf(" ");
            const str = tokens[0].substring(0, lastIndex);
            return str.localeCompare(original, undefined, { sensitivity: 'base' }) == 0;
        }
        return false;
    }
    gatherChildrenText() {
        let str = '';
        const lines = this.getLines();
        if (lines.length > this.selStartLine) {
            let i = this.selStartLine + 1;
            const indent = this.selectedLines[0].indent;
            while (i < lines.length) {
                const line = lines[i++];
                const treeLine = this.parseTreeLine(line);
                if (treeLine.indent > indent) {
                    str += ' ' + treeLine.node;
                }
                else {
                    break;
                }
            }
        }
        str = str.toLocaleLowerCase().trim();
        return str;
    }
    highlightText(editor) {
        if (visualText_1.visualText.analyzer.hasText()) {
            this.setFile(editor.document.uri);
            this.parseTreeLines(editor);
            if (this.selStart >= 0) {
                visualText_1.visualText.colorizeAnalyzer();
                vscode.window.showTextDocument(visualText_1.visualText.analyzer.getTextPath(), { viewColumn: vscode.ViewColumn.Beside }).then(edit => {
                    const txt = new textFile_1.TextFile(visualText_1.visualText.analyzer.getTextPath().fsPath);
                    const posStart = txt.positionAt(this.selStart - 1);
                    const posEnd = txt.positionAt(this.selEnd);
                    const range = new vscode.Range(posStart, posEnd);
                    edit.selections = [new vscode.Selection(posStart, posEnd)];
                    edit.revealRange(range);
                });
            }
        }
    }
    generatePath(editor) {
        if (visualText_1.visualText.analyzer.hasText()) {
            const passFileUri = this.getPassFromPath(editor);
            if (passFileUri.fsPath.length > 2) {
                this.setFile(editor.document.uri);
                this.parseTreeLines(editor);
                if (this.selStart >= 0) {
                    let pathStr = '';
                    let treeLine = this.selectedLines[0];
                    if (treeLine) {
                        let start = this.getStartLine();
                        let lastIndent = treeLine.indent + 1;
                        while (treeLine.indent > 0) {
                            const line = this.getLines()[start--];
                            treeLine = this.parseTreeLine(line);
                            if (treeLine.indent < lastIndent) {
                                pathStr = treeLine.node + ' ' + pathStr;
                                lastIndent = treeLine.indent;
                            }
                        }
                    }
                    pathStr = '@PATH ' + pathStr.trim();
                    const nlp = new nlp_1.NLPFile();
                    nlp.setFile(passFileUri);
                    nlp.replaceContext(pathStr);
                }
                else {
                    vscode.window.showInformationMessage('No text selected');
                }
            }
            else {
                vscode.window.showInformationMessage('Must not be the final tree');
            }
        }
    }
    getPassFromPath(editor) {
        const filePath = editor.document.uri.fsPath;
        const passNum = parseInt(filePath.substring(filePath.length - 8, filePath.length - 5));
        const seqFile = new sequence_1.SequenceFile();
        seqFile.init();
        return seqFile.getUriByPassNumber(passNum);
    }
    parseTreeLines(editor) {
        const lines = this.getSelectedLines(editor);
        this.selectedLines = [];
        this.selStart = -1;
        this.selEnd = -1;
        let lineCount = 0;
        for (const line of lines) {
            lineCount++;
            const treeLine = this.parseTreeLine(line);
            if (this.selStart < 0 || treeLine.ustart < this.selStart) {
                this.selStart = treeLine.ustart;
            }
            if (this.selEnd < 0 || treeLine.uend > this.selEnd) {
                this.selEnd = treeLine.uend;
            }
            this.selectedLines.push(treeLine);
        }
    }
    findRule(editor) {
        this.setDocument(editor);
        if (this.getFileType() == textFile_1.nlpFileType.TXXT) {
            this.setFilesNames(this.getUri().fsPath);
            if (this.parseBrackets()) {
                this.parseFireds(this.treeFile);
                const absolute = this.lineCharacterToAbsolute(editor.selection.active);
                if (absolute >= 0) {
                    const firedNumber = this.findMatchByAbsolute(absolute);
                    if (firedNumber >= 0) {
                        const chosen = this.getFired(firedNumber);
                        if (chosen.rulenum > 0) {
                            const ruleFileUri = visualText_1.visualText.analyzer.seqFile.getUriByPassNumber(chosen.rulenum);
                            visualText_1.visualText.colorizeAnalyzer();
                            vscode.window.showTextDocument(ruleFileUri, { viewColumn: vscode.ViewColumn.Beside }).then(editor => {
                                const pos = new vscode.Position(chosen.ruleline - 1, 0);
                                editor.selections = [new vscode.Selection(pos, pos)];
                                const range = new vscode.Range(pos, pos);
                                editor.revealRange(range);
                            });
                        }
                        else {
                            this.searchInDictionaries(chosen.str);
                        }
                    }
                }
            }
            else {
                vscode.window.showInformationMessage('No fired rule found');
            }
        }
    }
    getFired(firedNumber) {
        const chosen = this.fireds[firedNumber];
        while (chosen.rulenum == 0 && firedNumber > 0) {
            firedNumber--;
            if (firedNumber < 0)
                break;
            const parent = this.fireds[firedNumber];
            if (parent.to < chosen.from)
                break;
        }
        return chosen;
    }
    setFile(file, separateLines = true) {
        if (file.fsPath.length) {
            super.setFile(file, separateLines);
            this.setFilesNames(file.fsPath);
            return true;
        }
        return false;
    }
    setFilesNames(filepath) {
        if (filepath.length) {
            this.basename = path.basename(filepath, '.log');
            this.basename = path.basename(this.basename, '.tree');
            this.basename = path.basename(this.basename, '.txxt');
            this.basename = path.basename(this.basename, '.txt');
            this.basename = path.basename(this.basename, '.pat');
            this.basename = path.basename(this.basename, '.nlp');
            this.treeFile = visualText_1.visualText.analyzer.getOutputDirectory(this.basename + '.tree').fsPath;
            this.HighlightFile = visualText_1.visualText.analyzer.getOutputDirectory(this.basename + '.txxt').fsPath;
            this.inputFile = visualText_1.visualText.analyzer.getTextPath().fsPath;
        }
    }
    findSelectedTreeStr(editor) {
        this.setDocument(editor);
        this.selectedTreeStr = '';
        const type = this.getFileType();
        if (this.getFileType() == textFile_1.nlpFileType.TXXT || this.getFileType() == textFile_1.nlpFileType.TXT) {
            if (this.getFileType() == textFile_1.nlpFileType.TXT) {
                this.setFilesNames(visualText_1.visualText.analyzer.getTreeFile().fsPath);
                this.absoluteRangeFromSelection(this.getUri().fsPath, editor.selection);
            }
            else {
                this.setFilesNames(this.getUri().fsPath);
                this.absoluteRangeFromSelection(this.HighlightFile, editor.selection);
            }
            this.findTreeFileLines();
        }
        return this.selectedTreeStr.length ? true : false;
    }
    generateRule(editor, genType) {
        if (visualText_1.visualText.analyzer.hasText()) {
            const ruleStr = '';
            const type = this.getFileType();
            const nlp = new nlp_1.NLPFile();
            if (type == textFile_1.nlpFileType.NLP || type == textFile_1.nlpFileType.UNKNOWN) {
                const range = new vscode.Range(editor.selection.start, editor.selection.end);
                const str = editor.document.getText(range);
                let ruleStr = this.generateRuleFromStr(str, genType);
                ruleStr = this.ruleStrOutput(ruleStr);
                const snippet = new vscode.SnippetString(ruleStr);
                editor.insertSnippet(snippet, range);
            }
            else {
                const passFilePath = visualText_1.visualText.analyzer.getPassPath();
                const passName = visualText_1.visualText.analyzer.seqFile.base(passFilePath.fsPath);
                const passItem = visualText_1.visualText.analyzer.seqFile.findPass('nlp', passName);
                this.treeFile = this.anaFile(passItem.passNum).fsPath;
                if (this.findSelectedTreeStr(editor)) {
                    let ruleStr = this.ruleFromLines(genType);
                    nlp.setStr(ruleStr);
                    ruleStr = nlp.formatRule(ruleStr);
                    const ruleStrFinal = this.ruleStrOutput(ruleStr);
                    nlp.setFile(passFilePath);
                    nlp.insertRule(ruleStrFinal);
                }
            }
        }
        else {
            vscode.window.showInformationMessage('No text selected');
        }
    }
    ruleStrOutput(ruleStr) {
        return `
@RULES
_newNode <-
${ruleStr}
\t@@
		`;
    }
    ruleFromLines(genType) {
        let num = 1;
        let ruleStr = '';
        let lastend = 0;
        let indent = -1;
        for (const line of this.selectedLines) {
            if (line.node.localeCompare('_ROOT') == 0)
                continue;
            let node = line.node;
            if (indent == -1 || line.indent < indent)
                indent = line.indent;
            if (line.end > lastend && line.indent <= indent) {
                if (genType == generateType.GENERAL) {
                    if (line.type.localeCompare('alpha') == 0 && node.charAt(0) === node.charAt(0).toUpperCase())
                        node = '_xCAP';
                    else if (line.type.localeCompare('alpha') == 0)
                        node = '_xALPHA';
                    else if (line.type.localeCompare('white') == 0)
                        node = '_xWHITE';
                    else if (line.type.localeCompare('num') == 0)
                        node = '_xNUM';
                    else if (line.type.localeCompare('punct') == 0 || node.length == 1)
                        node = `\\${node}`;
                }
                else if (node.length == 1) {
                    node = `\\${node}`;
                }
                const newRuleStr = `\t${node}\t### (${num})`;
                if (ruleStr.length)
                    ruleStr += '\n';
                ruleStr += newRuleStr;
                num++;
            }
            lastend = line.end;
        }
        return ruleStr;
    }
    generateRuleFromStr(str, genType) {
        let ruleStr = '';
        let node = '';
        const tokens = this.nlpppSplitter(str.toLowerCase());
        let num = 1;
        for (const token of tokens) {
            node = token;
            const isint = !isNaN(parseInt(token));
            if (genType == generateType.GENERAL) {
                if (isint) {
                    node = '_xNUM';
                }
                else if (token == ' ') {
                    node = '_xWHITE';
                }
                else if (token.length == 1 && !isint) {
                    node = '\\' + token;
                }
                else {
                    node = '_xALPHA';
                }
            }
            else if (token.length == 1 && !isint) {
                node = '\\' + token;
            }
            const nodeStr = `\t${node}\t### (${num})`;
            if (ruleStr.length)
                ruleStr += '\n';
            ruleStr += nodeStr;
            num++;
        }
        return ruleStr;
    }
    nlpppSplitter(str) {
        const len = str.length;
        let i = 0;
        const tokens = [];
        let tok = '';
        const isDigit = false;
        let charType;
        (function (charType) {
            charType[charType["UNKNOWN"] = 0] = "UNKNOWN";
            charType[charType["ALPHA"] = 1] = "ALPHA";
            charType[charType["DIGIT"] = 2] = "DIGIT";
            charType[charType["SPACE"] = 3] = "SPACE";
            charType[charType["SPECIAL"] = 4] = "SPECIAL";
        })(charType || (charType = {}));
        let type = charType.UNKNOWN;
        let lastType = charType.UNKNOWN;
        while (i < len) {
            const c = str[i++];
            if (c >= '0' && c <= '9') {
                type = charType.DIGIT;
            }
            else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
                type = charType.ALPHA;
            }
            else if (c == ' ') {
                type = charType.SPACE;
            }
            else {
                type = charType.SPECIAL;
            }
            if (type != lastType && lastType != charType.UNKNOWN && lastType != charType.SPACE) {
                tokens.push(tok);
                if (type == charType.SPACE)
                    tok = '';
                else
                    tok = c;
                lastType = charType.UNKNOWN;
            }
            else if (type != charType.SPACE) {
                tok = tok + c;
            }
            lastType = type;
        }
        if (tok.length)
            tokens.push(tok);
        return tokens;
    }
    parseTreeLine(line) {
        const treeLine = { node: '', start: 0, end: 0, ustart: 0, uend: 0, passNum: 0, ruleLine: 0, type: '', fired: false, built: false, rest: '', indent: 0 };
        const tokens = line.split('[');
        let firstTok = 1;
        if (tokens.length > 1) {
            // Exception when the character is an open square bracket
            if (line.trim().startsWith('[')) {
                treeLine.node = '[';
                treeLine.indent = tokens[0].length;
                firstTok = 2;
            }
            else {
                treeLine.node = tokens[0].trim();
                treeLine.indent = tokens[0].search(/\S/) - 1;
            }
            const toks = tokens[firstTok].split(/[,\]]/);
            if (toks.length >= 4) {
                treeLine.start = +toks[0];
                treeLine.end = +toks[1];
                treeLine.ustart = +toks[2];
                treeLine.uend = +toks[3];
                treeLine.passNum = +toks[4];
                treeLine.ruleLine = +toks[5];
                treeLine.type = toks[6];
                if (toks.length > 7) {
                    if (toks[7].length)
                        treeLine.fired = true;
                }
                if (toks.length > 8) {
                    if (toks[8].length > 0)
                        treeLine.built = true;
                }
            }
        }
        return treeLine;
    }
    findSelectedTree(editor) {
        if (this.findSelectedTreeStr(editor)) {
            const filename = this.basename + '-' + this.selStart.toString() + '-' + this.selEnd.toString() + '.tree';
            this.openTemporaryFile(filename, this.selectedTreeStr);
        }
        else {
            vscode.window.showInformationMessage('No text selected');
        }
    }
    openTemporaryFile(filepath, content) {
        const newFile = vscode.Uri.parse('untitled:' + filepath);
        const tempDir = path.resolve(vscode.workspace
            .getConfiguration('createtmpfile')
            .get('tmpDir') || os.tmpdir());
        const filePath = vscode.Uri.file(path.join(tempDir, filepath));
        fs.writeFileSync(filePath.fsPath, content);
        vscode.workspace.openTextDocument(filePath).then(document => {
            visualText_1.visualText.colorizeAnalyzer();
            vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside });
        });
    }
    bracketCount(text, end = 0) {
        if (end) {
            text = text.substring(0, end);
        }
        const parens = text.split(/\(\(\(/);
        const parens2 = text.split(/\)\)\)/);
        const angle = text.split(/\<\<\</);
        const angle2 = text.split(/\>\>\>/);
        const parenCount = ((parens.length - 1) + (parens2.length - 1)) * 3;
        const angleCount = ((angle.length - 1) + (angle2.length - 1)) * 3;
        return parenCount + angleCount;
    }
    getCharacterLength(str) {
        return str.length;
    }
    absoluteRangeFromSelection(textfile, selection) {
        let absStart = 0;
        let absEnd = 0;
        const file = new textFile_1.TextFile(textfile);
        let linecount = 0;
        let multiline = false;
        for (const line of file.getLines(true)) {
            const len = this.getCharacterLength(line);
            if (multiline) {
                if (selection.end.line == linecount) {
                    absEnd += selection.end.character - this.bracketCount(line, selection.end.character) - 1;
                    break;
                }
                absEnd += len + this.bracketCount(line);
                if (len == 0)
                    absEnd += 1;
            }
            else if (selection.start.line == linecount) {
                const beforeStr = line.substring(0, selection.start.character);
                const bLen = this.getCharacterLength(beforeStr);
                absStart += bLen - this.bracketCount(line, selection.start.character);
                if (selection.end.line == linecount) {
                    const selStr = line.substring(selection.start.character, selection.end.character);
                    // let selStr = line.substring(selection.start.character,selection.end.character-selection.start.character);
                    absEnd = absStart + selStr.length - this.bracketCount(selStr);
                    break;
                }
                absEnd = absStart + len - selection.start.character - this.bracketCount(line);
                multiline = true;
            }
            else {
                const bracket = this.bracketCount(line);
                absStart += len - bracket;
                if (len == 0)
                    absStart += 1;
            }
            linecount++;
        }
        this.selStart = absStart;
        this.selEnd = absEnd;
    }
    findTreeFileLines() {
        const file = new textFile_1.TextFile(this.treeFile);
        const sep = file.getSeparatorNormalized();
        let from = 0;
        let to = 0;
        let add = false;
        this.selectedLines = [];
        this.selectedTreeStr = '';
        for (const line of file.getLines()) {
            from = 0;
            to = 0;
            add = false;
            const tokens = line.split('[');
            if (tokens.length > 1) {
                const toks = tokens[1].split(/[,\]]/);
                if (toks.length > 4) {
                    from = +toks[2];
                    to = +toks[3];
                    if (from >= this.selStart && to <= this.selEnd) {
                        this.selectedLines.push(this.parseTreeLine(line));
                        this.selectedTreeStr = this.selectedTreeStr.concat(line, sep);
                    }
                }
            }
        }
    }
    findMatchByAbsolute(absolute) {
        let firedNumber = 0;
        for (const Highlight of this.Highlight) {
            if (Highlight.startb <= absolute && absolute <= Highlight.endb) {
                return firedNumber;
            }
            else if (absolute < Highlight.endb) {
                return -1;
            }
            firedNumber++;
        }
        return -1;
    }
    lineCharacterToAbsolute(position) {
        let lineCount = 0;
        let absolute = 0;
        for (const line of this.getLines()) {
            if (lineCount == position.line) {
                return absolute + position.character;
            }
            absolute += line.length;
            lineCount++;
        }
        return -1;
    }
    parseBrackets() {
        this.Highlight = [];
        const squares = this.parseBracketsRegex('(');
        const curlies = this.parseBracketsRegex('<');
        this.Highlight.sort(function (a, b) { return a.start - b.start; });
        return squares + curlies;
    }
    parseBracketsRegex(bracket) {
        const repeatedBrackets = 3;
        const startPattern = bracket === '<' ? '\<\<\<' : '\(\(\(';
        const endPattern = bracket === '<' ? '\>\>\>' : '\)\)\)';
        const file = new textFile_1.TextFile(this.HighlightFile, false);
        const tokens = file.getText(true).split(startPattern);
        let tokencount = 0;
        let len = 0;
        let lenBracket = 0;
        for (let token of tokens) {
            token = token.replace(/[\n\r]/g, '');
            if (tokencount) {
                const Highlight = { start: 0, end: 0, startb: 0, endb: 0 };
                const toks = token.split(endPattern);
                Highlight.start = len;
                Highlight.end = len + toks[0].length - 1;
                Highlight.startb = lenBracket;
                Highlight.endb = lenBracket + toks[0].length - 1;
                this.Highlight.push(Highlight);
            }
            let tok = token.replace(/\<\<\</g, '');
            tok = tok.replace(/\>\>\>/g, '');
            tok = tok.replace(/\(\(\(/g, '');
            tok = tok.replace(/\)\)\)/g, '');
            len += tok.length;
            tokencount++;
            lenBracket += token.length + repeatedBrackets;
        }
        return tokencount - 1;
    }
    parseFireds(treeFile) {
        const refire = /[\[,\]]/g;
        this.fireds = [];
        const file = new textFile_1.TextFile(treeFile);
        let lastTo = 0;
        for (let i = 0; i < file.getLines().length; i++) {
            const line = file.getLine(i);
            const tokens = line.split(',fired');
            if (tokens.length > 1) {
                const fired = { str: '', from: 0, to: 0, ufrom: 0, uto: 0, rulenum: 0, ruleline: 0, built: false };
                const tts = line.split(refire);
                const firstChar = line.trim().charAt(0);
                if (/^[\[\],]/i.test(firstChar)) {
                    tts[0] = firstChar;
                    tts.splice(1, 1);
                }
                fired.built = (tts.length >= 9 && tts[9] === 'blt') ? true : false;
                if (+tts[2] > lastTo) {
                    fired.str = tts[0].trim();
                    fired.from = +tts[1];
                    fired.to = lastTo = +tts[2];
                    fired.ufrom = +tts[3];
                    fired.uto = +tts[4];
                    fired.rulenum = +tts[5];
                    fired.ruleline = +tts[6];
                    if (status_1.nlpStatusBar.getFiredMode() == status_1.FiredMode.FIRED || fired.built)
                        this.fireds.push(fired);
                    if (fired.str.startsWith('_')) {
                        const indent = line.search(/\S/);
                        fired.str = '';
                        while (indent > 0) {
                            i++;
                            const nextLine = file.getLine(i);
                            const pos = nextLine.search(/\S/);
                            if (pos <= indent)
                                break;
                            const ts = nextLine.split(/\s+/);
                            const rest = ts[1].trim();
                            fired.str = fired.str + ' ' + rest;
                        }
                        fired.str = fired.str.trim();
                        i--; // Back up one line
                    }
                }
            }
        }
        return this.fireds.length ? true : false;
    }
    firedFile(pass, rewrite = false) {
        const firefile = this.anaFile(pass, textFile_1.nlpFileType.TXXT);
        if (!fs.existsSync(firefile.fsPath) || rewrite) {
            const treeFile = this.anaFile(pass);
            if (fs.existsSync(treeFile.fsPath)) {
                this.parseFireds(treeFile.fsPath);
                this.writeFiredText(treeFile, rewrite);
            }
        }
        return firefile;
    }
    fileCreateTime(filepath) {
        if (fs.existsSync(filepath)) {
            const stats = fs.statSync(filepath);
            if (stats)
                return stats.ctime;
        }
        return new Date(1970, 1, 1);
    }
    writeFiredText(treeFile, rewrite = false) {
        this.setFilesNames(treeFile.fsPath);
        const logDate = this.fileCreateTime(treeFile.fsPath);
        const inputDate = this.fileCreateTime(this.inputFile);
        if (!rewrite && inputDate < logDate && fs.existsSync(this.HighlightFile))
            return vscode.Uri.file(this.HighlightFile);
        else if (!rewrite && !fs.existsSync(this.inputFile))
            return treeFile;
        const file = new textFile_1.TextFile(this.inputFile, false);
        let textfire = '';
        let lastTo = 0;
        const between = '';
        const Highlight = '';
        let from = 0;
        let to = 0;
        let built = false;
        const byteText = new TextEncoder().encode(file.getText(true));
        if (this.fireds.length) {
            for (let i = 0; i < this.fireds.length; i++) {
                from = this.fireds[i].from;
                to = this.fireds[i].to;
                built = this.fireds[i].built;
                const hl = byteText.slice(from, to + 1);
                const Highlight = new TextDecoder().decode(hl);
                const bt = byteText.slice(lastTo, from);
                const between = new TextDecoder().decode(bt);
                if (built)
                    textfire = textfire.concat(between, '<<<', Highlight, '>>>');
                else if (status_1.nlpStatusBar.getFiredMode() == status_1.FiredMode.FIRED)
                    textfire = textfire.concat(between, '(((', Highlight, ')))');
                else
                    textfire = textfire.concat(between, Highlight);
                lastTo = to + 1;
            }
            const tx = byteText.slice(lastTo, byteText.length);
            const rest = new TextDecoder().decode(tx);
            textfire = textfire.concat(rest);
        }
        else {
            textfire = file.getText(true);
        }
        fs.writeFileSync(this.HighlightFile, file.unnormalizeText(textfire));
        this.fireds = [];
        return vscode.Uri.file(this.HighlightFile);
    }
    updateTxxtFiles(fileType) {
        const exts = new Array('.' + this.getExtension(fileType));
        const files = dirfuncs_1.dirfuncs.getFiles(visualText_1.visualText.analyzer.getOutputDirectory(), exts);
        for (const file of files) {
            const numStr = path.basename(file.fsPath).substring(3, 3);
            const passNum = Number.parseInt(numStr);
            this.firedFile(passNum, true);
        }
    }
}
exports.TreeFile = TreeFile;
//# sourceMappingURL=treeFile.js.map