import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { NLPFile } from './nlp';
import { FindFile } from './findFile';
import { findView } from './findView';
import { outputView } from './outputView';
import { dirfuncs } from './dirfuncs';

interface Entry {
	uri: vscode.Uri;
	type: vscode.FileType;
}

export class FileSystemProvider implements vscode.TreeDataProvider<Entry> {

	private _onDidChangeTreeData: vscode.EventEmitter<Entry> = new vscode.EventEmitter<Entry>();
	readonly onDidChangeTreeData: vscode.Event<Entry> = this._onDidChangeTreeData.event;

	refresh(entry: Entry): void {
		this._onDidChangeTreeData.fire(entry);
	}

	constructor() {}

	async getChildren(entry?: Entry): Promise<Entry[]> {
		if (entry) {
			return this.getKeepers(entry.uri); 
		}
		if (visualText.hasWorkspaceFolder() && visualText.hasAnalyzers() && visualText.analyzer.isLoaded()) {
			return this.getKeepers(visualText.analyzer.getInputDirectory());   				
        }
		return [];
	}

	getTreeItem(entry: Entry): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(entry.uri, entry.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		if (entry.type === vscode.FileType.File) {
			treeItem.command = { command: 'textView.openFile', title: "Open File", arguments: [entry], };
			treeItem.contextValue = 'file';
		} else {
			treeItem.contextValue = 'dir';
		}
		var isLogDir = outputView.fileHasLog(entry.uri.path);
		treeItem.iconPath = {
			light: isLogDir ? path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') :  
								path.join(__filename, '..', '..', 'resources', 'light', 'file.svg'),
			dark: isLogDir ? path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') : 
								path.join(__filename, '..', '..', 'resources', 'dark', 'file.svg'),
		}
		return treeItem;
	}

	getKeepers(dir: vscode.Uri): Entry[] {
		var keepers = Array();
		var entries = dirfuncs.getDirectoryTypes(dir);

		for (let entry of entries) {
			if (!(entry.type == vscode.FileType.Directory && outputView.directoryIsLog(entry.uri.path))) {
				keepers.push(entry);
			}
		} 

		return keepers;
	}

	existingText(entry: Entry) {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Add Existing File',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: true,
				canSelectFolders: true,
				filters: {
					'Text files': ['txt','xml','html','cvs'],
					'All files': ['*']
				}
			};
			vscode.window.showOpenDialog(options).then(selection => {
				if (!selection) {
					return;
				}
				var oldPath = selection[0].path;
				var filename = path.basename(oldPath);
				var dir = visualText.analyzer.getInputDirectory().path;
				if (entry) {
					dir = path.dirname(entry.uri.path);
				} else if (visualText.analyzer.getTextPath()) {
					var textPath = visualText.analyzer.getTextPath().path;
					if (textPath.length)
						dir = path.dirname(textPath);
				}
				var newPath = path.join(dir,filename);
				fs.copyFileSync(oldPath,newPath);		
				this.refresh(entry);
			});	
		}
	}
	
	rename(entry: Entry): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(entry.uri.path), prompt: 'Enter new name for file' }).then(newname => {
				if (newname) {
					var original = entry.uri;
					if (path.extname(newname).length == 0)
						newname = newname+path.extname(entry.uri.path);
					var newfile = vscode.Uri.file(path.join(path.dirname(entry.uri.path),newname));
					dirfuncs.renameFile(original.path,newfile.path);						
					this.refresh(entry);
				}
			});
		}
	}
		
	renameDir(entry: Entry): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(entry.uri.path), prompt: 'Enter new name for directory' }).then(newname => {
				if (newname) {
					var original = entry.uri;
					var newfile = vscode.Uri.file(path.join(path.dirname(entry.uri.path),newname));
					dirfuncs.renameFile(original.path,newfile.path);						
					this.refresh(entry);
				}
			});
		}
	}
}

export let textView: TextView;
export class TextView {

	private textView: vscode.TreeView<Entry>;
	private findFile = new FindFile();

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new FileSystemProvider();
		this.textView = vscode.window.createTreeView('textView', { treeDataProvider });
		vscode.commands.registerCommand('textView.refreshAll', (entry) => treeDataProvider.refresh(entry));
		vscode.commands.registerCommand('textView.existingText', (entry) => treeDataProvider.existingText(entry));
		vscode.commands.registerCommand('textView.rename', (entry) => treeDataProvider.rename(entry));
		vscode.commands.registerCommand('textView.renameDir', (entry) => treeDataProvider.renameDir(entry));

		vscode.commands.registerCommand('textView.openFile', (entry) => this.openFile(entry));
		vscode.commands.registerCommand('textView.analyzeLast', () => this.analyzeLast());
		vscode.commands.registerCommand('textView.analyze', (entry) => this.analyze(entry));
		vscode.commands.registerCommand('textView.openText', () => this.openText());
		vscode.commands.registerCommand('textView.search', () => this.search());
		vscode.commands.registerCommand('textView.newText', (entry) => this.newText(entry));
		vscode.commands.registerCommand('textView.newDir', (entry) => this.newDir(entry));
		vscode.commands.registerCommand('textView.deleteText', (entry) => this.deleteText(entry));
		vscode.commands.registerCommand('textView.updateTitle', (entry) => this.updateTitle(entry));
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!textView) {
            textView = new TextView(ctx);
        }
        return textView;
	}

	private analyzeLast() {
		if (visualText.analyzer.hasText()) {
			var textUri = visualText.analyzer.getTextPath();
			this.openFile({uri: textUri, type: vscode.FileType.File});
            var nlp = new NLPFile();
			nlp.analyze(textUri);
        }
	}

	private analyze(entry: Entry) {
        if (entry.uri.path.length) {
			this.openFile(entry);
            var nlp = new NLPFile();
			nlp.analyze(entry.uri);
		}

	}

	search() {
		if (visualText.hasWorkspaceFolder()) {
			if (visualText.hasWorkspaceFolder()) {
				vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
					if (searchWord) {
						this.findFile.searchFiles(visualText.analyzer.getInputDirectory(),searchWord,'.txt');
						findView.loadFinds(searchWord,this.findFile.getMatches());
						vscode.commands.executeCommand('findView.refreshAll');
						vscode.commands.executeCommand('findView.updateTitle');
					}
				});
			}
		}
	}

	private openText() {
		if (visualText.analyzer.hasText())
			vscode.window.showTextDocument(visualText.analyzer.getTextPath());
			vscode.commands.executeCommand('status.update');
	}
	
	private updateTitle(resource: vscode.Uri): void {
		var filepath = resource.path;
		if (resource && filepath.length) {
			var filename = path.basename(resource.path);
			if (filename.length) {
				this.textView.title = `TEXT (${filename})`;	
				return;					
			}
		}
		this.textView.title = 'TEXT';
	}

	private openFile(entry: Entry): void {
		this.updateTitle(entry.uri);
		vscode.window.showTextDocument(entry.uri);
		visualText.analyzer.saveCurrentFile(entry.uri);
		vscode.commands.executeCommand('outputView.refreshAll');
		vscode.commands.executeCommand('status.update');
	}

	private deleteText(entry: Entry): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			var filename = path.basename(entry.uri.path);
			deleteDescr = deleteDescr.concat('Delete \'',filename,'\'?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete '+filename });

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				var path = entry.uri.path;
				if (dirfuncs.isDir(path))
					dirfuncs.delDir(path);
				else
					dirfuncs.delFile(path);
				vscode.commands.executeCommand('textView.refreshAll');
			});
		}
	}

	private newDir(entry: Entry) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'dirname', prompt: 'Enter directory name' }).then(newdir => {
				if (newdir) {
					var dirPath = visualText.analyzer.getInputDirectory().path;
					if (entry)
						dirPath = dirfuncs.getDirPath(entry.uri.path);
					dirPath = path.join(dirPath,newdir);
					dirfuncs.makeDir(dirPath);
					vscode.commands.executeCommand('textView.refreshAll');
				}
			});
		}
	}
	
	private newText(entry: Entry) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter text file name' }).then(newname => {
				if (newname) {
					var dirPath = visualText.analyzer.getInputDirectory().path;
					if (entry)
						dirPath = dirfuncs.getDirPath(entry.uri.path);
					var filepath = path.join(dirPath,newname+'.txt');
					if (path.extname(newname))
						filepath = path.join(dirPath,newname);
					dirfuncs.writeFile(filepath,'Hello world!');
					vscode.commands.executeCommand('textView.refreshAll');
				}
			});
		}
	}
}