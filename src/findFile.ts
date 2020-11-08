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
    
	searchFiles(dir: vscode.Uri, searchTerm: string, endswith: string = ''): boolean {
		this.finds = [];
		var files = dirfuncs.getFiles(dir);

		for (let file of files) {
			if (endswith.length && !file.path.endsWith(endswith))
				continue;
			this.textFile.setFile(file.path);
			if (this.textFile.getText().search(searchTerm)) {
				let num = 0;
				for (let line of this.textFile.getLines()) {
					var pos = line.search(searchTerm);
					if (pos >= 0) {
						var filename = path.basename(file.path);
						var uri = vscode.Uri.file(path.join(dir.path,filename));
						var label = `${filename} [${num} ${pos}] ${line}`;
						this.finds.push({uri: uri, label: label, line: num, pos: Number.parseInt(pos), text: line});
					}
					num++;
				}				
			}
		}

		return this.finds.length ? true : false;
	}
}
