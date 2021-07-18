import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export enum separatorType { SEP_UNKNOWN, SEP_R, SEP_RN, SEP_N }
export enum nlpFileType { UNKNOWN, TXT, NLP, TXXT, TREE, KB, KBB }

export class TextFile {
    private uri: vscode.Uri = vscode.Uri.file('');
    private filepath: string = '';
    private text: string = '';
    private textNormalized: string = '';
    private sepNormalized = '\n';
    private sepType: separatorType = separatorType.SEP_UNKNOWN;
    private sep: string = '';
    private lines = new Array();
    private linesNormalized = new Array();
    private filetype = nlpFileType.UNKNOWN;
    private tabsize = 4;
    public basename: string = '';
    private nlpFileExts = new Array('unknown', 'txt', 'nlp', 'txxt', 'log', 'kb', 'kbb');
    private exists: boolean = false;
    private selLines: string[] = [];

    constructor(filepath: string = '', separateLines: boolean = true) {
        if (filepath.length)
            this.setFile(vscode.Uri.file(filepath),separateLines);
    }

    positionAt(offset: number): vscode.Position {
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

    getSelectedLines(editor: vscode.TextEditor): string[] {
        this.selLines = [];
        let start = editor.selection.start;
        let end = editor.selection.end;
        var i = 0;
        for (i=start.line; i<=end.line; i++) {
            this.selLines.push(this.lines[i]);
        }
        return this.selLines;
    }

    public cleanZeroZero(): boolean {
        if (this.text.length) {
            if (this.text.indexOf('\x00') >= 0) {
                this.text = this.text.replace(/\x00/g, ''); 
                try {
                    fs.writeFileSync(this.uri.fsPath,this.text,{flag:'w'});
                    return true;
                } catch (err) {
                    console.log('Error writing file ' + this.uri.fsPath+ ': ' + err.message);
                    return false;
                }
            }
        }
        return false;
    }

    getExtension(type: nlpFileType): string {
        return this.nlpFileExts[type];
    }

    setStr(str: string, separateLines: boolean = true) {
        this.text = str;
        this.separation(separateLines);
    }

    setFile(file: vscode.Uri, separateLines: boolean = true): boolean {
        this.exists = false;
        this.clear();

        if (file.fsPath.length && fs.existsSync(file.fsPath)) {
            this.uri = file;
            this.filepath = file.fsPath;
            this.text = fs.readFileSync(this.filepath, 'utf8');
            this.setFileType(this.filepath);
            if (this.text.length)
                this.separation(separateLines);
            this.exists = true;
        }
        return this.exists;
    }
    
    setDocument(editor: vscode.TextEditor, separateLines: boolean = true) {
        this.clear();
        this.uri = editor.document.uri;
        this.filepath = editor.document.uri.fsPath;
        var firstLine = editor.document.lineAt(0);
        var lastLine = editor.document.lineAt(editor.document.lineCount - 1);
        var textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
        this.text = editor.document.getText(textRange);
        this.setFileType(this.filepath);
        this.separation(separateLines);
    }
    
	setFileType(filename: string) {
		this.basename = path.basename(filename, '.nlp');
		this.basename = path.basename(this.basename, '.pat');
        
        this.filetype = nlpFileType.NLP
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

    fileExists(): boolean {
        return this.exists;
    }

    isFileType(type: nlpFileType): boolean {
        return type == this.filetype;
    }

	getFileType(): nlpFileType {
		return this.filetype;
	}
    
    getUri(): vscode.Uri {
        return this.uri;
    }
    
	getBasename(): string {
		return this.basename;
    }

    clear() {
        this.uri  = vscode.Uri.file('');
        this.filepath = '';
        this.text = '';
        this.sepType = separatorType.SEP_UNKNOWN;
        this.sep = '';
        this.lines = [];
    }
    
    separation(separateLines: boolean=true) {
        if (this.text.length == 0)
            this.setFile(this.uri,separateLines);

        if (this.text.length) {
            var counts_rn = this.text.split('\r\n');
            var counts_r = this.text.split('\r');
            var counts_n = this.text.split('\n');

            this.sepType = separatorType.SEP_UNKNOWN;
            this.sep = '';

            if (counts_rn.length > 1) {
                this.sepType = separatorType.SEP_RN;
                this.sep = '\r\n';
            } else if (counts_r.length > 1) {
                this.sepType = separatorType.SEP_R;
                this.sep = '\r';
            } else if (counts_n.length > 1) {
                this.sepType = separatorType.SEP_N;
                this.sep = '\n';
            }
            if (separateLines)
                this.separateLines();      
        }
    }

    normalizeText(): string {
        if (this.sepType == separatorType.SEP_RN) {
            const regReplace = new RegExp(this.sep, 'g');
            this.textNormalized = this.text.replace(regReplace, this.sepNormalized);            
        } else {
            this.textNormalized = this.text;
        }
        return this.textNormalized;
    }

    unnormalizeText(text: string): string {
        if (this.sepType == separatorType.SEP_RN) {
            const regReplace = new RegExp(this.sepNormalized, 'g');
            this.textNormalized = text.replace(regReplace, this.sep);            
        } else {
            this.textNormalized = text;
        }
        return this.textNormalized;
    }

    separateLines() {
        this.lines = [];
        if (this.sepType != separatorType.SEP_UNKNOWN && this.text.length) {
            this.lines = this.text.split(this.sep)
        } else if (this.text.length) {
            this.lines.push(this.text);
        }
    }

    getText(normalized: boolean = false): string {
        if (normalized) {
            if (this.textNormalized.length == 0) {
                this.normalizeText();
            }
            return this.textNormalized;
        }
        return this.text;
    }

    numberOfLines(): number {
        return this.lines.length;
    }

    getLines(normalized: boolean = false) {
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

    getSeparatorLength(): number {
        return this.sep.length;
    }

    getSeparator(): string {
        return this.sep;
    }
    
    getSeparatorNormalized(): string {
        return this.sep;
    }
}