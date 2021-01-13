import * as vscode from 'vscode';
import * as path from 'path';
import { TextFile } from './textFile';
import { dirfuncs } from './dirfuncs';

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
    
	searchFiles(dir: vscode.Uri, searchTerm: string, endswith: string = '', level: number = 0): boolean {
		if (level == 0)
			this.finds = [];
		const files = dirfuncs.getFiles(dir);
		var context: number = 60;
		var escaped = this.escapeRegExp(searchTerm);

		for (let file of files) {
			if (endswith.length && !file.fsPath.endsWith(endswith))
				continue;
			this.textFile.setFile(file);

			if (this.textFile.getText().search(escaped) >= 0) {
				let num = 0;
				for (let line of this.textFile.getLines()) {
					var pos = line.search(escaped);
					if (pos >= 0) {
						var filename = path.basename(file.fsPath);
						var uri = vscode.Uri.file(path.join(dir.fsPath,filename));
						if (line.length + escaped.length > context) {
							let half = context / 2;
							if (line.length - pos < half) {
								line = line.substr(line.length-context-1,context);
							} else if (pos > half) {
								line = line.substr(pos-half,context+escaped.length);								
							} else {
								line = line.substr(0,context);
							}
						}
						line = line.replace(searchTerm,` <<${searchTerm}>> `);
						var label = `${filename} [${num} ${pos}] ${line}`;
						this.finds.push({uri: uri, label: label, line: num, pos: Number.parseInt(pos), text: line});
					}
					num++;
				}				
			}
		}

		const dirs = dirfuncs.getDirectories(dir);

		for (let dir of dirs) {
			this.searchFiles(dir, searchTerm, endswith, level+1)
		}

		return this.finds.length ? true : false;
	}

	escapeRegExp(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
