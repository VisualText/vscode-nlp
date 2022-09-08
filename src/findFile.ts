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
    
	searchFiles(dir: vscode.Uri, searchTerm: string, extensions: string[] = [], level: number = 0, functionFlag: boolean = false): boolean {
		if (level == 0)
			this.finds = [];
		const files = dirfuncs.getFiles(dir);
		var context: number = 60;
		var escaped = this.escapeRegExp(searchTerm);

		for (let file of files) {
			if (extensions.length) {
				let found: boolean = false;
				for (let extension of extensions) {
					if (file.fsPath.endsWith(extension))
						found = true;
				}
				if (!found)
					continue;
			} 

			this.textFile.setFile(file);

			if (this.textFile.getText().search(escaped) >= 0) {
				let num = 0;
				for (let line of this.textFile.getLines()) {
					var pos = line.search(escaped);
					var lineOrig = line;
					if (pos >= 0) {
						var filename = path.basename(file.fsPath);
						var uri = vscode.Uri.file(path.join(dir.fsPath,filename));
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
						line = line.replace(searchTerm,` <<${searchTerm}>> `);
						var label = `${filename} [${num} ${pos}] ${line}`;
						var trimmed = line.trim();
						if (!functionFlag || (!lineOrig.includes(';') && trimmed.startsWith('<<' + searchTerm + '>> ('))) {
							this.finds.push({uri: uri, label: label, line: num, pos: Number.parseInt(pos), text: line});
						}
					}
					num++;
				}				
			}
		}

		const dirs = dirfuncs.getDirectories(dir);

		for (let dir of dirs) {
			this.searchFiles(dir, searchTerm, extensions, level+1)
		}

		return this.finds.length ? true : false;
	}

	escapeRegExp(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
