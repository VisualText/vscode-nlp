import * as vscode from 'vscode';
import * as path from 'path';
import { TextFile } from './textFile';
import { dirfuncs } from './dirfuncs';
import { visualText } from './visualText';
import { RuleLocator, visualColumn } from './language/ruleLocator';

export interface FindItem {
	uri: vscode.Uri;
	label: string;
	highlighted: string;
	line: string;
	lineNum: number;
	pos: number;
}

export let findFiles: FindFile;
export class FindFile {

	private finds: FindItem[];
	private dirPath: string;
	private textFile = new TextFile();

    constructor() {
		this.finds = [];
		this.dirPath = '';
	}
	
	getMatches(): FindItem[] {
		return this.finds;
	}

	searchSequenceFiles(searchTerm: string, topFlag: boolean): boolean {
		this.finds = [];
		const fileUris = visualText.analyzer.seqFile.getPassFileUris(topFlag);
		const context: number = 60;
		const escaped = this.escapeRegExp(searchTerm);

		for (const uri of fileUris) {
			this.searchFile(uri, searchTerm, escaped, context, false);
		}

		return false;
	}
    
	searchFiles(dir: vscode.Uri, searchTerm: string, extensions: string[] = [], level: number = 0, functionFlag: boolean = false, bracketsFlag: boolean = true): boolean {
		if (level == 0)
			this.finds = [];

		const files = dirfuncs.getFiles(dir);
		const context: number = 60;
		const escaped = this.escapeRegExp(searchTerm);

		for (const file of files) {
			if ((!functionFlag && dirfuncs.directoryIsLog(file.fsPath)) || (functionFlag && file.fsPath.toLowerCase().indexOf('func') < 0))
				continue;
			if (extensions.length) {
				let found: boolean = false;
				for (const extension of extensions) {
					if (file.fsPath.endsWith(extension)) {
						found = true;
						break;
					}
				}
				if (!found)
					continue;
			}

			const filename = path.basename(file.fsPath);
			const uri = vscode.Uri.file(path.join(dir.fsPath,filename));
			this.searchFile(uri, searchTerm, escaped, context, bracketsFlag);
		}

		const dirs = dirfuncs.getDirectories(dir);

		for (const dir of dirs) {
			if (!dirfuncs.directoryIsLog(dir.fsPath))
				this.searchFiles(dir, searchTerm, extensions, level+1)
		}

		return this.finds.length ? true : false;
	}

	searchFile(uri: vscode.Uri, searchTerm: string, escaped: string, context: number, bracketsFlag: boolean = true) {
		if (dirfuncs.isDir(uri.fsPath))
			return;
		this.textFile.setFile(uri);
		const filename = path.basename(uri.fsPath);
		// #157: optional case-sensitive / whole-word matching (settings; default off, so
		// the behaviour is unchanged -- case-insensitive substring).
		const findConfig = vscode.workspace.getConfiguration('nlp');
		const caseSensitive = findConfig.get<boolean>('findCaseSensitive', false);
		const wholeWord = findConfig.get<boolean>('findWholeWord', false);
		const rx = new RegExp(wholeWord ? '\\b' + escaped + '\\b' : escaped, caseSensitive ? '' : 'i');
		const termLen = searchTerm.length;
		// #787: prefix results with the analyzer-sequence pass info so they read in
		// pass order and show the multi-pass progression. The tag is "<mark><passNum>  "
		// where <mark> is "I " for an inactive (disabled) pass, or "O " for an orphan
		// pass file (a .nlp/.rec/.pat in spec/ not referenced by the sequence). Non-pass
		// files (function libraries, input text) get no tag. Computed once per file.
		const seqFile = visualText.analyzer.seqFile;
		const passName = path.parse(filename).name;
		const passItem = seqFile.getPasses().find(p => p.passNum > 0 && p.name == passName);
		let passTag = '';
		if (passItem)
			passTag = (passItem.active ? '' : 'I ') + `${passItem.passNum}`;
		else if (path.dirname(uri.fsPath) == seqFile.getSpecDirectory().fsPath && /\.(nlp|rec|pat)$/i.test(filename))
			passTag = 'O -';

		const text = this.textFile.getText();
		if (text.search(rx) >= 0) {
			// Pass files read "X PASS RULE ELT | LINE,COL name text": rule numbers as
			// G("$rulenum") counts them, elements as N(n) does, and the column the
			// editor's status bar shows (tabs expanded). See ruleLocator.ts.
			const lines = this.textFile.getLines();
			const locator = passTag ? new RuleLocator(text) : undefined;
			const tabSize = vscode.workspace.getConfiguration('editor', { languageId: 'nlp' }).get<number>('tabSize', 4);
			const lineChars = lines.reduce((n, l) => n + l.length, 0);
			const sepLen = lines.length > 1 ? (text.length - lineChars) / (lines.length - 1) : 0;
			let offset = 0;
			let num = 0;
			for (let line of lines) {
				const pos = line.search(rx);
				const lineStart = offset;
				offset += line.length + sepLen;
				if (pos >= 0) {
					let where = '';
					if (locator) {
						const spot = locator.at(lineStart + pos);
						const rule = spot ? `${spot.rule}` : '-';
						const elt = spot && spot.elt >= 0 ? `${spot.elt}` : '-';
						where = `${passTag} ${rule} ${elt} | ${num + 1},${visualColumn(line, pos, tabSize)}  `;
					}
					if (line.length + termLen > context) {
						const half = context / 2;
						if (line.length - pos < half) {
							line = line.substring(line.length-context-1,context);
						} else if (pos > half) {
							line = line.substring(pos-half,context+termLen);
						} else {
							line = line.substring(0,context);
						}
					}
					let shown = line;
					if (bracketsFlag)
						shown = line.replace(rx, m => ` <<${m}>> `);
					// Every pass file is .nlp/.pat, so the extension adds nothing there.
					const label = where ? `${where}${passName} ${line}` : `${filename} [${num} ${pos}] ${line}`;
					const newText = where ? `${where}${passName} ${shown}` : `${filename} ${shown}`;
					this.finds.push({uri: uri, label: label, line: line, lineNum: num, pos: Number.parseInt(pos), highlighted: newText});
				}
				num++;
			}
		}
	}

	escapeRegExp(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
