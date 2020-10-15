import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { sep } from 'path';

export enum separatorType { SEP_UNKNOWN, SEP_R, SEP_RN, SEP_N }

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

    constructor(filepath: string = '', separateLines: boolean = true) {
        this.setFile(filepath,separateLines);
    }

    setFile(filepath: string, separateLines: boolean = true) {
        this.clear();
        if (filepath.length) {
            this.uri = vscode.Uri.file(filepath);
            this.filepath = filepath;
            this.calculateSeparatorType();
            if (separateLines)
                this.separateLines();            
        }        
    }

    clear() {
        this.uri  = vscode.Uri.file('');
        this.filepath = '';
        this.text = '';
        this.sepType = separatorType.SEP_UNKNOWN;
        this.sep = '';
        this.lines = [];
    }
    
    calculateSeparatorType() {
        if (this.filepath.length) {
            this.text = fs.readFileSync(this.filepath, 'utf8');
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