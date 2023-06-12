import * as vscode from 'vscode';
import * as path from 'path';
import { TextFile } from './textFile';
import { dirfuncs } from './dirfuncs';
import { visualText } from './visualText';

export interface FindItem {
	uri: vscode.Uri;
	label: string;
	text: string;
	line: number;
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
		var context: number = 60;
		var escaped = this.escapeRegExp(searchTerm);

		for (let uri of fileUris) {
			this.searchFile(uri, searchTerm, escaped, context, false);
		}

		return false;
	}
    
	searchFiles(dir: vscode.Uri, searchTerm: string, extensions: string[] = [], level: number = 0, functionFlag: boolean = false, bracketsFlag: boolean = true): boolean {
		if (level == 0)
			this.finds = [];

		const files = dirfuncs.getFiles(dir);
		var context: number = 60;
		var escaped = this.escapeRegExp(searchTerm);

		for (let file of files) {
			if (dirfuncs.directoryIsLog(file.fsPath) || (functionFlag && file.fsPath.toLowerCase().indexOf('func') < 0))
				continue;
			if (extensions.length) {
				let found: boolean = false;
				for (let extension of extensions) {
					if (file.fsPath.endsWith(extension)) {
						found = true;
						break;
					}
				}
				if (!found)
					continue;
			}

			var filename = path.basename(file.fsPath);
			var uri = vscode.Uri.file(path.join(dir.fsPath,filename));
			this.searchFile(uri, searchTerm, escaped, context, functionFlag, bracketsFlag);
		}

		const dirs = dirfuncs.getDirectories(dir);

		for (let dir of dirs) {
			if (!dirfuncs.directoryIsLog(dir.fsPath))
				this.searchFiles(dir, searchTerm, extensions, level+1)
		}

		return this.finds.length ? true : false;
	}

	searchFile(uri: vscode.Uri, searchTerm: string, escaped: string, context: number, functionFlag: boolean, bracketsFlag: boolean = true) {
		if (dirfuncs.isDir(uri.fsPath))
			return;
		this.textFile.setFile(uri);
		let filename = path.basename(uri.fsPath);

		if (this.textFile.getText().search(escaped) >= 0) {
			let num = 0;
			for (let line of this.textFile.getLines()) {
				var pos = line.search(escaped);
				var lineOrig = line;
				if (pos >= 0) {
					if (line.length + escaped.length > context) {
						let half = context / 2;
						if (line.length - pos < half) {
							line = line.substring(line.length-context-1,context);
						} else if (pos > half) {
							line = line.substring(pos-half,context+escaped.length);								
						} else {
							line = line.substring(0,context);
						}
					}
					if (bracketsFlag)
						line = line.replace(searchTerm,` <<${searchTerm}>> `);
					var label = `${filename} [${num} ${pos}] ${line}`;
					var trimmed = line.trim();
					if (!functionFlag || bracketsFlag || (!lineOrig.includes(';') && trimmed.startsWith('<<' + searchTerm + '>> ('))) {
						this.finds.push({uri: uri, label: label, line: num, pos: Number.parseInt(pos), text: line});
					}
				}
				num++;
			}				
		}
	}

	escapeRegExp(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
