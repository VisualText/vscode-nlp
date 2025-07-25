import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';

export enum separatorType { SEP_UNKNOWN, SEP_R, SEP_RN, SEP_N }
export enum nlpFileType { UNKNOWN, SEQ, TXT, NLP, TXXT, TREE, LOG, KB, KBB, DICT, NLM }

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
    public basename: string = '';
    private nlpFileExts = new Array('unknown', 'seq', 'txt', 'nlp', 'txxt', 'tree', 'log', 'kb', 'kbb', 'dict', 'nlm');
    private exists: boolean = false;
    private selLines: string[] = [];
    public selStartLine: number = 0;
    public selEndLine: number = 0;

    constructor(filepath: string = '', separateLines: boolean = true, text: string = '') {
        if (text.length)
            this.setText(text, separateLines);
        else if (filepath.length)
            this.setFile(vscode.Uri.file(filepath),separateLines);
    }

    runPython(editor: vscode.TextEditor) {
        if (vscode.window.activeTextEditor) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                this.choosePythonScript(editor);
            }
        }
    }

    choosePythonScript(editor: vscode.TextEditor) {
		const fileDir = visualText.getVisualTextDirectory("python");
        if (!fs.existsSync(fileDir)) {
            vscode.window.showWarningMessage("No library Python scripts available");
			return;
        }
		const items: vscode.QuickPickItem[] = [];
        const exts = [".py"];

		const dictFiles = dirfuncs.getFiles(vscode.Uri.file(fileDir),exts);
		for (const dictFile of dictFiles) {
			let descr = "";

			const firstLine = this.readFirstLine(dictFile.fsPath);
			if (firstLine[0] == '#') {
				descr = firstLine.substring(1);
			}
			const icon = visualText.fileIconFromExt(dictFile.fsPath);
			const label = path.basename(dictFile.fsPath);
			const light = vscode.Uri.file(path.join(visualText.getExtensionPath().fsPath,"resources","light",icon));
			const dark = vscode.Uri.file(path.join(visualText.getExtensionPath().fsPath,"resources","dark",icon));
			items.push({label: label, description: descr, detail: dictFile.fsPath});
		}

		if (items.length == 0) {
			vscode.window.showWarningMessage('Not created yet and you can help!');
			return;
		}

        const prompt = "Python Script";

		vscode.window.showQuickPick(items, {title: 'Choose ' + prompt, placeHolder: 'Choose ' + prompt + ' to insert'}).then(selection => {
            if (!selection)
                return;
			if (selection.detail) {
				this.runPythonCode(editor, selection.detail);
			}	
		});
	}

    runPythonCode(editor: vscode.TextEditor, pythonScriptPath: string) {
        const inputFilePath = editor.document.uri.fsPath;
        const command = `python ${pythonScriptPath} ${inputFilePath}`;

        // Execute the command
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing the Python script: ${error.message}`);
                return;
            }
        
            if (stderr) {
                console.error(`Python script STDERR: ${stderr}`);
                return;
            }

            const range = new vscode.Range(editor.document.lineAt(0).range.start, editor.document.lineAt(editor.document.lineCount - 1).range.end);
            const snippet = new vscode.SnippetString(stdout);
            editor.insertSnippet(snippet,range);
        });
    }

    appendText(text: string) {
        this.text = this.text.concat(text);
    }

    saveFile() {
        fs.writeFileSync(this.uri.fsPath,this.getText(),{flag:'w+'});
    }

    saveFileLines() {
        let text = '';
        for (const line of this.lines) {
            if (text.length)
                text += this.sep;
            text += line;
        }
        fs.writeFileSync(this.uri.fsPath,text,{flag:'w+'});
    }

    linesToText(editor: vscode.TextEditor, selFlag: boolean=false) {
        if (selFlag) {
            if (this.selLines.length) {
                let text = '';
                for (const line of this.selLines) {
                    if (text.length)
                        text += this.sep;
                    text += line;
                }
                const posStart = editor.selection.active;
                const posEnd = editor.selection.end;
                const rang = new vscode.Selection(posStart,posEnd);
                const snippet = new vscode.SnippetString(text);
                editor.insertSnippet(snippet,rang);

                // select new lines
                const endLine = new vscode.Position(this.selStartLine + this.selLines.length-1,this.selLines[this.selLines.length-1].length);
                const newRang = new vscode.Selection(posStart,endLine);
                editor.selection = newRang;
            }
        }
        else {
            if (this.lines.length) {
                this.text = '';
                for (const line of this.lines) {
                    this.text += line + this.sep;
                }
            }
        }
    }

    sortLines(selFlag: boolean=false) {
        if (selFlag)
            this.selLines.sort(function (a, b) {
                return a.toLowerCase().localeCompare(b.toLowerCase());
            });
        else
            this.lines.sort(function (a, b) {
                return a.toLowerCase().localeCompare(b.toLowerCase());
            });
    }

    rollupLines(selFlag: boolean=false) {
        let lastLine = '';
        const deletes: number[] = new Array();
        let index: number = 0;

        if (selFlag) {
            for (const line of this.selLines) {
                if (line == lastLine || line.length == 0)
                    deletes.push(index);
                lastLine = line;
                index++;
            }
    
            for (const del of deletes.reverse()) {
                this.selLines.splice(del,1);
            }
        }
        else {
            for (const line of this.lines) {
                if (line == lastLine || line.length == 0)
                    deletes.push(index);
                lastLine = line;
                index++;
            }
    
            for (const del of deletes.reverse()) {
                this.lines.splice(del,1);
            }
        }
    }

    positionAt(offset: number): vscode.Position {
        let lineNum = 0;
        let character = 0;
        let len = 0;
        for (const line of this.lines) {
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
        const start = editor.selection.start;
        this.selStartLine = start.line;
        const end = editor.selection.end;
        this.selEndLine = end.line;
        let i = 0;
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
                } catch (err: any) {
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
        this.uri = file;
        this.filepath = file.fsPath;
        this.setFileType(this.filepath);

        if (file.fsPath.length && fs.existsSync(file.fsPath)) {
            this.text = fs.readFileSync(this.filepath, 'utf8');
            if (this.text.length)
                this.separation(separateLines);
            this.exists = true;
        }
        return this.exists;
    }

    isEmpty(): boolean {
        return this.filepath.length > 0 ? false : true;
    }

    setText(text: string, separateLines: boolean = true) {
        if (text.length) {
            this.text = text;
            this.separation(separateLines);
            this.exists = true;
        }
    }
    
    setDocument(editor: vscode.TextEditor, separateLines: boolean = true) {
        this.clear();
        this.uri = editor.document.uri;
        this.filepath = editor.document.uri.fsPath;
        const firstLine = editor.document.lineAt(0);
        const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
        const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
        this.text = editor.document.getText(textRange);
        this.setFileType(this.filepath);
        this.separation(separateLines);
    }
    
	setFileType(filename: string) {
		this.basename = path.basename(filename, '.nlp');
        
        this.filetype = nlpFileType.NLP
        if (path.extname(filename) == '.seq')
            this.filetype = nlpFileType.SEQ;
        else if (path.extname(filename) == '.txt')
            this.filetype = nlpFileType.TXT;
		else if (path.extname(filename) == '.txxt')
			this.filetype = nlpFileType.TXXT;
		else if (path.extname(filename) == '.kb')
            this.filetype = nlpFileType.KB;
        else if (path.extname(filename) == '.kbb')
			this.filetype = nlpFileType.KBB;
		else if (path.extname(filename) == '.tree')
			this.filetype = nlpFileType.TREE;
		else if (path.extname(filename) == '.log')
			this.filetype = nlpFileType.LOG;
        else if (path.extname(filename) == '.dict')
			this.filetype = nlpFileType.DICT;
        else if (path.extname(filename) == '.nlm')
			this.filetype = nlpFileType.NLM;
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
            const counts_rn = this.text.split('\r\n');
            const counts_r = this.text.split('\r');
            const counts_n = this.text.split('\n');

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
                for (const line of this.lines) {
                    this.linesNormalized.push(line.concat(this.sepNormalized));
                }
            }
            return this.linesNormalized;
        }
        return this.lines;
    }

    getLine(lineNumber: number): string {
        return this.lines[lineNumber];
    }

    findLineStartsWith(startsWithStr: string): vscode.Selection {
        const lines = this.getLines();
        let lineCount = 0;
        for (const line of lines) {
            if (line.startsWith(startsWithStr)) {
                const posStart = new vscode.Position(lineCount,0);
                const posEnd = new vscode.Position(lineCount,line.length);
                const rang = new vscode.Selection(posStart,posEnd);
                return rang;
            }
            lineCount++;
        }
        const pos = new vscode.Position(0,0);
        return new vscode.Selection(pos,pos);
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

    getStartLine(): number {
        return this.selStartLine;
    }

	anaFile(pass: number, type: nlpFileType = nlpFileType.TREE): vscode.Uri {
		let filename: string = 'ana';
		if (pass > 0) {
			if (pass < 10)
				filename = filename + '00';
			else if (pass < 100)
				filename = filename + '0';
			filename = filename + pass.toString() + '.' + this.getExtension(type);
		} else {
			filename = 'final.tree';
		}
		return visualText.analyzer.getOutputDirectory(filename);
    }

	hasFileType(uri: vscode.Uri, pass: number, type: nlpFileType = nlpFileType.TREE): boolean {
        if (!fs.existsSync(uri.fsPath))
            return false;
		const anaFile = this.anaFile(pass,type);
		if (type == nlpFileType.TREE) {
			if (this.fileHasNLines(anaFile.fsPath,6))
				return true;
			return false;
		}
		return fs.existsSync(anaFile.fsPath);
	}

	fileHasNLines(filepath: string, max: number): boolean {
        if (!fs.existsSync(filepath))
            return false;
        const lineByLine = require('n-readlines');
        const liner = new lineByLine(filepath);
         
        let line;
        let lineNumber = 0;
        let found = false;
         
        while (line = liner.next()) {
            if (lineNumber++ >= max) {
                found = true;
                break;
            }
        }
        if (liner.next())
            liner.close();
        return found;
	}

	public readFirstLine(filepath: string): string {
        if (!fs.existsSync(filepath))
            return '';
        const lineByLine = require('n-readlines');
        const liner = new lineByLine(filepath);
         
        let line = '';
         
        while (line = liner.next()) {
            break;
        }

        if (liner.next())
            liner.close();
            
        return line.toString().trim();
	}

    replaceLineNumber(lineNum: number, text: string) {
        this.lines[lineNum] = text;
    }
}
