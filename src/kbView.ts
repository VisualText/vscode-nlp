import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { FindFile } from './findFile';
import { findView } from './findView';
import { dirfuncs } from './dirfuncs';
import { fileOperation, fileOpRefresh } from './fileOps';
import * as fs from 'fs';

export interface KBItem {
	uri: vscode.Uri;
	type: vscode.FileType;
}

export class FileSystemProvider implements vscode.TreeDataProvider<KBItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<KBItem> = new vscode.EventEmitter<KBItem>();
	readonly onDidChangeTreeData: vscode.Event<KBItem> = this._onDidChangeTreeData.event;

	refresh(KBItem: KBItem): void {
		this._onDidChangeTreeData.fire(KBItem);
	}

	constructor() {}

	async getChildren(KBItem?: KBItem): Promise<KBItem[]> {
		if (KBItem) {
			return this.getKBFiles(KBItem.uri); 
		}
		if (visualText.hasWorkspaceFolder() && visualText.hasAnalyzers() && visualText.analyzer.isLoaded()) {
			return this.getKBFiles(visualText.analyzer.getKBDirectory());  
        }
		return [];
	}

	getTreeItem(KBItem: KBItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(KBItem.uri, KBItem.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

        let name = path.basename(KBItem.uri.fsPath);
        treeItem.command = { command: 'kbView.openFile', title: "Open File", arguments: [KBItem], };
        treeItem.contextValue = 'kb';

		var icon = 'kb.svg';
		if (name == 'main.kb') {
			icon = 'kb-main.svg';
		} else if (KBItem.uri.fsPath.endsWith('.dict')) {
			icon = 'dict.svg';
		}

		treeItem.iconPath = {
			light: path.join(__filename, '..', '..', 'resources', 'light', icon),
			dark: path.join(__filename, '..', '..', 'resources', 'dark', icon)
		}

		return treeItem;
	}

	getKBFiles(dir: vscode.Uri): KBItem[] {
		var files = Array();
		var entries = dirfuncs.getDirectoryTypes(dir);

		for (let entry of entries) {
			if (!(entry.type == vscode.FileType.Directory && dirfuncs.directoryIsLog(entry.uri.fsPath))) {
				files.push({uri: entry.uri, type: entry.type});
			}
		}

		return files;
	}

	dirHasNonText(dir: vscode.Uri): boolean {
		const files = dirfuncs.getFiles(dir);
		for (let file of files) {
			if (!file.fsPath.endsWith('.txt'))
				return true;
		}
		return false;
	}

	existingFile(KBItem: KBItem) {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: true,
				openLabel: 'Add Existing File(s)',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: true,
				canSelectFolders: false,
				filters: {
					'Text files': ['txt','xml','html','csv'],
					'All files': ['*']
				}
			};
			
			vscode.window.showOpenDialog(options).then(selections => {
				if (!selections) {
					return;
				}
				for (let sel of selections) {
					var filename = path.basename(sel.fsPath);
					var dir = visualText.analyzer.getInputDirectory().fsPath;
					if (KBItem) {
						dir = path.dirname(KBItem.uri.fsPath);
					} else if (visualText.analyzer.getTextPath()) {
						var textPath = visualText.analyzer.getTextPath().fsPath;
						if (fs.existsSync(textPath))
							dir = path.dirname(textPath);
						else
							dir = visualText.analyzer.getInputDirectory().fsPath;
					}
					var newPath = vscode.Uri.file(path.join(dir,filename));
					visualText.fileOps.addFileOperation(sel,newPath,[fileOpRefresh.KB],fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();
			});	
		}
	}

	existingFolder(KBItem: KBItem) {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: true,
				openLabel: 'Add Existing Folder(s)',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: false,
				canSelectFolders: true,
			};
			
			vscode.window.showOpenDialog(options).then(selections => {
				if (!selections) {
					return;
				}
				for (let sel of selections) {
					var dirname = path.basename(sel.fsPath);
					var dir = visualText.analyzer.getInputDirectory().fsPath;
					if (KBItem) {
						dir = path.dirname(KBItem.uri.fsPath);
					}
					var newPath = vscode.Uri.file(path.join(dir,dirname));
					visualText.fileOps.addFileOperation(sel,newPath,[fileOpRefresh.KB],fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();	
			});	
		}
	}
	
	rename(KBItem: KBItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(KBItem.uri.fsPath), prompt: 'Enter new name for file' }).then(newname => {
				if (newname) {
					var original = KBItem.uri;
					if (path.extname(newname).length == 0)
						newname = newname+path.extname(KBItem.uri.fsPath);
					var newfile = vscode.Uri.file(path.join(path.dirname(KBItem.uri.fsPath),newname));
					dirfuncs.rename(original.fsPath,newfile.fsPath);	
					var logFolderOrig = vscode.Uri.file(path.join(original.fsPath + visualText.LOG_SUFFIX));
					if (dirfuncs.isDir(logFolderOrig.fsPath)) {
						var logFolderNew = vscode.Uri.file(path.join(path.dirname(KBItem.uri.fsPath),newname + visualText.LOG_SUFFIX));
						dirfuncs.rename(logFolderOrig.fsPath,logFolderNew.fsPath);
					}
					vscode.commands.executeCommand('kbView.refreshAll');	
				}
			});
		}
	}
		
	renameDir(KBItem: KBItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(KBItem.uri.fsPath), prompt: 'Enter new name for directory' }).then(newname => {
				if (newname) {
					var original = KBItem.uri;
					var newfile = vscode.Uri.file(path.join(path.dirname(KBItem.uri.fsPath),newname));
					dirfuncs.rename(original.fsPath,newfile.fsPath);						
					vscode.commands.executeCommand('kbView.refreshAll');	
				}
			});
		}
	}
}

export let kbView: KBView;
export class KBView {

	private kbView: vscode.TreeView<KBItem>;
	private findFile = new FindFile();

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new FileSystemProvider();
		this.kbView = vscode.window.createTreeView('kbView', { treeDataProvider });
		vscode.commands.registerCommand('kbView.refreshAll', (KBItem) => treeDataProvider.refresh(KBItem));
		vscode.commands.registerCommand('kbView.existingFile', (KBItem) => treeDataProvider.existingFile(KBItem));
		vscode.commands.registerCommand('kbView.existingFolder', (KBItem) => treeDataProvider.existingFolder(KBItem));
		vscode.commands.registerCommand('kbView.rename', (KBItem) => treeDataProvider.rename(KBItem));
		vscode.commands.registerCommand('kbView.renameDir', (KBItem) => treeDataProvider.renameDir(KBItem));

		vscode.commands.registerCommand('kbView.openFile', (KBItem) => this.openFile(KBItem));
		vscode.commands.registerCommand('kbView.openText', () => this.openText());
		vscode.commands.registerCommand('kbView.search', () => this.search());
		vscode.commands.registerCommand('kbView.newKBFile', (KBItem) => this.newKBFile(KBItem,false));
		vscode.commands.registerCommand('kbView.newDictFile', (KBItem) => this.newDictFile(KBItem,false));
		vscode.commands.registerCommand('kbView.deleteFile', (KBItem) => this.deleteFile(KBItem));
		vscode.commands.registerCommand('kbView.deleteDir', (KBItem) => this.deleteFile(KBItem));;
		vscode.commands.registerCommand('kbView.updateTitle', (KBItem) => this.updateTitle(KBItem));
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!kbView) {
            kbView = new KBView(ctx);
        }
        return kbView;
	}

	search() {
		if (visualText.hasWorkspaceFolder()) {
			if (visualText.hasWorkspaceFolder()) {
				vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
					if (searchWord) {
						this.findFile.searchFiles(visualText.analyzer.getKBDirectory(),searchWord,['.kb']);
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
		var filepath = resource.fsPath;
		if (resource && filepath.length) {
			var filename = path.basename(resource.fsPath);
			if (filename.length) {
				this.kbView.title = `KB (${filename})`;	
				return;					
			}
		}
		this.kbView.title = 'KB';
	}

	private openFile(KBItem: KBItem): void {
		this.updateTitle(KBItem.uri);
		vscode.window.showTextDocument(KBItem.uri);
		visualText.analyzer.saveCurrentFile(KBItem.uri);
		vscode.commands.executeCommand('outputView.refreshAll');
		vscode.commands.executeCommand('status.update');
	}

	private deleteFile(KBItem: KBItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			var filename = path.basename(KBItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete \'',filename,'\'?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete '+filename });

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(KBItem.uri,KBItem.uri,[fileOpRefresh.KB],fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	private newKBFile(KBItem: KBItem, top: boolean) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter KB file name' }).then(newname => {
				if (newname) {
					var dirPath = visualText.analyzer.getKBDirectory().fsPath;
					if (KBItem && !top)
						dirPath = dirfuncs.getDirPath(KBItem.uri.fsPath);
					var filepath = path.join(dirPath,newname+'.kb');
					if (path.extname(newname))
						filepath = path.join(dirPath,newname);
					dirfuncs.writeFile(filepath,"\n\nquit\n\n");
					vscode.commands.executeCommand('kbView.refreshAll');
				}
			});
		}
	}

	private newDictFile(KBItem: KBItem, top: boolean) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter Dictionary file name' }).then(newname => {
				if (newname) {
					var dirPath = visualText.analyzer.getKBDirectory().fsPath;
					if (KBItem && !top)
						dirPath = dirfuncs.getDirPath(KBItem.uri.fsPath);
					var filepath = path.join(dirPath,newname+'.dict');
					if (path.extname(newname))
						filepath = path.join(dirPath,newname);
					dirfuncs.writeFile(filepath,"word attr=value");
					vscode.commands.executeCommand('kbView.refreshAll');
				}
			});
		}
	}
}