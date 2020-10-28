import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { sep } from 'path';

export enum separatorType { SEP_UNKNOWN, SEP_R, SEP_RN, SEP_N }
export enum nlpFileType { UNKNOWN, NLP, TXXT, LOG, KB }

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
	private nlpFileExts = new Array('txt', 'nlp', 'txxt', 'log', 'kb');

    public basename: string = '';

    constructor(filepath: string = '', separateLines: boolean = true) {
        this.setFile(filepath,separateLines);
    }

    getExtension(type: nlpFileType): string {
        return this.nlpFileExts[type];
    }

    setFile(filepath: string, separateLines: boolean = true) {
        this.clear();
        if (filepath.length) {
            this.uri = vscode.Uri.file(filepath);
            this.filepath = filepath;
            this.text = fs.readFileSync(this.filepath, 'utf8');
            this.setFileType(this.filepath);   
            this.separation(separateLines);
        }        
    }

    setDocument(editor: vscode.TextEditor, separateLines: boolean = true) {
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
    
	setFileType(filename: string) {
		this.basename = path.basename(filename, '.nlp');
		this.basename = path.basename(this.basename, '.pat');
        
		this.filetype = nlpFileType.NLP
		if (path.extname(filename) == '.txxt')
			this.filetype = nlpFileType.TXXT;
		else if (path.extname(filename) == '.kb')
			this.filetype = nlpFileType.KB;
		else if (path.extname(filename) == '.log')
			this.filetype = nlpFileType.LOG;
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
        if (this.filepath.length && this.text.length) {
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