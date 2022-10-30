import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { analyzerView } from './analyzerView';
import { NLPFile } from './nlp';
import { FindFile } from './findFile';
import { findView } from './findView';
import { dirfuncs } from './dirfuncs';
import { fileOperation, fileOpRefresh } from './fileOps';
import * as fs from 'fs';

export interface TextItem {
	uri: vscode.Uri;
	type: vscode.FileType;
	hasLogs: boolean;
	hasNonText: boolean;
}

export class FileSystemProvider implements vscode.TreeDataProvider<TextItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<TextItem> = new vscode.EventEmitter<TextItem>();
	readonly onDidChangeTreeData: vscode.Event<TextItem> = this._onDidChangeTreeData.event;

	refresh(textItem: TextItem): void {
		this._onDidChangeTreeData.fire(textItem);
	}

	constructor() {}

	async getChildren(textItem?: TextItem): Promise<TextItem[]> {
		if (textItem) {
			return this.getKeepers(textItem.uri); 
		}
		if (visualText.hasWorkspaceFolder() && visualText.hasAnalyzers() && visualText.analyzer.isLoaded()) {
			return this.getKeepers(visualText.analyzer.getInputDirectory());  
        }
		return [];
	}

	getTreeItem(textItem: TextItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(textItem.uri, textItem.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

		if (textItem.type === vscode.FileType.File) {
			var conval = textItem.hasLogs ? 'HasLogs' : '';
			treeItem.command = { command: 'textView.openFile', title: "Open File", arguments: [textItem], };
			treeItem.contextValue = 'file' + conval;
			treeItem.iconPath = {
				light: textItem.hasLogs ? path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') :  
									path.join(__filename, '..', '..', 'resources', 'light', 'file.svg'),
				dark: textItem.hasLogs ? path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') : 
									path.join(__filename, '..', '..', 'resources', 'dark', 'file.svg'),
			}
		} else {
			var conval = textItem.hasNonText ? 'HasNonText' : '';
			conval = textItem.hasLogs ? conval + 'HasLogs' : conval;
			treeItem.contextValue = 'dir' + conval ;
			treeItem.iconPath = {
				light: path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg'),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg'),
			}
		}

		return treeItem;
	}

	getKeepers(dir: vscode.Uri): TextItem[] {
		var keepers = Array();
		var entries = dirfuncs.getDirectoryTypes(dir);

		for (let entry of entries) {
			if (!(entry.type == vscode.FileType.Directory && dirfuncs.directoryIsLog(entry.uri.fsPath))) {
				var hasLogs =  dirfuncs.hasLogDirs(entry.uri,false);
				var hasNonText = entry.type == vscode.FileType.Directory && this.dirHasNonText(entry.uri) ? true : false;
				keepers.push({uri: entry.uri, type: entry.type, hasLogs: hasLogs, hasNonText: hasNonText});
			}
		}

		var hasAllLogs = dirfuncs.hasLogDirs(visualText.getCurrentAnalyzer(),true);
		vscode.commands.executeCommand('setContext', 'text.hasLogs', hasAllLogs);
		return keepers;
	}

	dirHasNonText(dir: vscode.Uri): boolean {
		const files = dirfuncs.getFiles(dir);
		for (let file of files) {
			if (!file.fsPath.endsWith('.txt'))
				return true;
		}
		return false;
	}

	existingFile(textItem: TextItem) {
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
					if (textItem) {
						dir = path.dirname(textItem.uri.fsPath);
					} else if (visualText.analyzer.getTextPath()) {
						var textPath = visualText.analyzer.getTextPath().fsPath;
						if (fs.existsSync(textPath))
							dir = path.dirname(textPath);
						else
							dir = visualText.analyzer.getInputDirectory().fsPath;
					}
					var newPath = vscode.Uri.file(path.join(dir,filename));
					visualText.fileOps.addFileOperation(sel,newPath,[fileOpRefresh.TEXT],fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();
			});	
		}
	}

	existingFolder(textItem: TextItem) {
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
					if (textItem) {
						dir = path.dirname(textItem.uri.fsPath);
					}
					var newPath = vscode.Uri.file(path.join(dir,dirname));
					visualText.fileOps.addFileOperation(sel,newPath,[fileOpRefresh.TEXT],fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();	
			});	
		}
	}
	
	rename(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(textItem.uri.fsPath), prompt: 'Enter new name for file' }).then(newname => {
				if (newname) {
					var original = textItem.uri;
					if (path.extname(newname).length == 0)
						newname = newname+path.extname(textItem.uri.fsPath);
					var newfile = vscode.Uri.file(path.join(path.dirname(textItem.uri.fsPath),newname));
					dirfuncs.rename(original.fsPath,newfile.fsPath);	
					var logFolderOrig = vscode.Uri.file(path.join(original.fsPath + visualText.LOG_SUFFIX));
					if (dirfuncs.isDir(logFolderOrig.fsPath)) {
						var logFolderNew = vscode.Uri.file(path.join(path.dirname(textItem.uri.fsPath),newname + visualText.LOG_SUFFIX));
						dirfuncs.rename(logFolderOrig.fsPath,logFolderNew.fsPath);
					}
					vscode.commands.executeCommand('textView.refreshAll');	
				}
			});
		}
	}
		
	renameDir(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(textItem.uri.fsPath), prompt: 'Enter new name for directory' }).then(newname => {
				if (newname) {
					var original = textItem.uri;
					var newfile = vscode.Uri.file(path.join(path.dirname(textItem.uri.fsPath),newname));
					dirfuncs.rename(original.fsPath,newfile.fsPath);						
					vscode.commands.executeCommand('textView.refreshAll');	
				}
			});
		}
	}
	
	convert(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			visualText.fileOps.addFileOperation(textItem.uri,textItem.uri,[fileOpRefresh.TEXT],fileOperation.RENAME,'','txt');
			visualText.fileOps.startFileOps(100);
		}
	}
}

export let textView: TextView;
export class TextView {

	private textView: vscode.TreeView<TextItem>;
	private findFile = new FindFile();

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new FileSystemProvider();
		this.textView = vscode.window.createTreeView('textView', { treeDataProvider });
		vscode.commands.registerCommand('textView.refreshAll', (textItem) => treeDataProvider.refresh(textItem));
		vscode.commands.registerCommand('textView.existingFile', (textItem) => treeDataProvider.existingFile(textItem));
		vscode.commands.registerCommand('textView.existingFolder', (textItem) => treeDataProvider.existingFolder(textItem));
		vscode.commands.registerCommand('textView.rename', (textItem) => treeDataProvider.rename(textItem));
		vscode.commands.registerCommand('textView.renameDir', (textItem) => treeDataProvider.renameDir(textItem));
		vscode.commands.registerCommand('textView.convert', (textItem) => treeDataProvider.convert(textItem));

		vscode.commands.registerCommand('textView.openFile', (textItem) => this.openFile(textItem));
		vscode.commands.registerCommand('textView.analyzerCurrent', () => this.analyzerCurrent());
		vscode.commands.registerCommand('textView.analyze', (textItem) => this.analyze(textItem));
		vscode.commands.registerCommand('textView.analyzeDir', (textItem) => this.analyzeDir(textItem));
		vscode.commands.registerCommand('textView.openText', () => this.openText());
		vscode.commands.registerCommand('textView.search', () => this.search());
		vscode.commands.registerCommand('textView.newTextTop', (textItem) => this.newText(textItem,true));
		vscode.commands.registerCommand('textView.newText', (textItem) => this.newText(textItem,false));
		vscode.commands.registerCommand('textView.newDirTop', (textItem) => this.newDir(textItem,true));
		vscode.commands.registerCommand('textView.newDir', (textItem) => this.newDir(textItem,false));
		vscode.commands.registerCommand('textView.deleteFile', (textItem) => this.deleteFile(textItem));
		vscode.commands.registerCommand('textView.deleteDir', (textItem) => this.deleteFile(textItem));
		vscode.commands.registerCommand('textView.deleteFileLogs', (textItem) => this.deleteFileLogs(textItem));
		vscode.commands.registerCommand('textView.deleteAnalyzerLogs', () => this.deleteAnalyzerLogs());
		vscode.commands.registerCommand('textView.updateTitle', (textItem) => this.updateTitle(textItem));
		vscode.commands.registerCommand('textView.propertiesFile', (textItem) => this.propertiesFile(textItem));
		vscode.commands.registerCommand('textView.propertiesFolder', (textItem) => this.propertiesFolder(textItem));
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!textView) {
            textView = new TextView(ctx);
        }
        return textView;
	}

	private analyzerCurrent() {
		if (visualText.analyzer.hasText()) {
			var textUri = visualText.analyzer.getTextPath();
			this.openFile({uri: textUri, type: vscode.FileType.File, hasLogs: false, hasNonText: false});
            var nlp = new NLPFile();
			nlp.analyze(textUri);
        }
	}

	propertiesFile(textItem: TextItem) {
		fs.stat(textItem.uri.fsPath, (err, stats) => {
			if (err) {
				vscode.window.showInformationMessage('File read error: ' + err);
			} else {
				var sizeStr = this.humanFileSize(stats.size,true,1);
				var base = path.basename(textItem.uri.fsPath);
				vscode.window.showInformationMessage(base + ": " + sizeStr);
			}
		});
	}

	propertiesFolder(textItem: TextItem) {
		var files = dirfuncs.getFiles(textItem.uri);
		var len: number = files.length;
		var base = path.basename(textItem.uri.fsPath);
		vscode.window.showInformationMessage(base + ": " + len + " files");
	}

	humanFileSize(bytes: number, si: boolean, dp: number): string {
		const thresh = si ? 1000 : 1024;
	  
		if (Math.abs(bytes) < thresh) {
		  return bytes + ' B';
		}
	  
		const units = si 
		  ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
		  : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
		let u = -1;
		const r = 10**dp;
	  
		do {
		  bytes /= thresh;
		  ++u;
		} while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
	  
	  
		return bytes.toFixed(dp) + ' ' + units[u];
	}
	  

	analyze(textItem: TextItem) {
        if (textItem.uri.fsPath.length) {
			//this.openFile(textItem);
            var nlp = new NLPFile();
			nlp.analyze(textItem.uri);
			vscode.commands.executeCommand('analyzerView.refreshAll');
		}
	}

	analyzeDir(textItem: TextItem) {
        if (textItem.uri.fsPath.length) {
			let items: vscode.QuickPickItem[] = [];
			var foldername = path.basename(textItem.uri.fsPath);
			var msg = '';
			msg = msg.concat('Analyze all files in folder \'',foldername,'\'?');
			items.push({label: 'Yes', description: msg});
			items.push({label: 'No', description: 'Do not analyze folder \''+foldername+'\''});

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				var nlp = new NLPFile();
				nlp.analyze(textItem.uri);
				vscode.commands.executeCommand('analyzerView.refreshAll');
			});
		}
	}

	search() {
		if (visualText.hasWorkspaceFolder()) {
			if (visualText.hasWorkspaceFolder()) {
				vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
					if (searchWord) {
						this.findFile.searchFiles(visualText.analyzer.getInputDirectory(),searchWord,['.txt']);
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
				this.textView.title = `TEXT (${filename})`;	
				return;					
			}
		}
		this.textView.title = 'TEXT';
	}

	private openFile(textItem: TextItem): void {
		this.updateTitle(textItem.uri);
		vscode.window.showTextDocument(textItem.uri);
		visualText.analyzer.saveCurrentFile(textItem.uri);
		vscode.commands.executeCommand('outputView.refreshAll');
		vscode.commands.executeCommand('status.update');
	}

	private deleteFile(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			var filename = path.basename(textItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete \'',filename,'\'?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete '+filename });

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(textItem.uri,textItem.uri,[fileOpRefresh.TEXT],fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteFileOrFolderLogs(textItem: TextItem) {
		if (visualText.hasWorkspaceFolder()) {
			if (dirfuncs.isDir(textItem.uri.fsPath)) {
				this.deleteFolderLogs(textItem.uri);
			} else {
				this.deleteFileLogDir(textItem.uri.fsPath);
			}
		}
	}

	public deleteFileLogs(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			var filename = path.basename(textItem.uri.fsPath);
			var type = dirfuncs.isDir(textItem.uri.fsPath) ? 'directory' : 'file';
			deleteDescr = deleteDescr.concat('Delete logs for ',type,' \'',filename,'\'?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete logs for '+filename });

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				this.deleteFileOrFolderLogs(textItem);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteFolderFileLogs(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			var filename = path.basename(textItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete logs for \'',filename,'\'?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete logs for '+filename });

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				this.deleteFolderLogs(textItem.uri);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteFolderLogs(dir: vscode.Uri) {
		var analyzerName = path.basename(dir.fsPath);
		const logDirs: TextItem[] = Array();
		textView.getLogDirs(dir,logDirs,false);
		var count = logDirs.length;
		
		if (count) {
			for (let dir of logDirs) {
				visualText.fileOps.addFileOperation(dir.uri,dir.uri,[fileOpRefresh.TEXT],fileOperation.DELETE);
			};
		}
	}

	public deleteFileLogDir(dirPath: string): void {
		var logPath = vscode.Uri.file(dirPath + visualText.LOG_SUFFIX);
		visualText.fileOps.addFileOperation(logPath,logPath,[fileOpRefresh.TEXT,fileOpRefresh.OUTPUT],fileOperation.DELETE);
	}

	public deleteAnalyzerLogs(): void {
		if (visualText.hasWorkspaceFolder() && visualText.analyzer.hasText()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete all logs for this Analyzer?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete all logs for this Analyzer' });

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				var anaPath = visualText.getCurrentAnalyzer();
				if (anaPath.fsPath.length) {
					this.deleteFolderLogs(anaPath);
					visualText.fileOps.startFileOps();
				}
			});
		}
	}

	public getLogDirs(dir: vscode.Uri, logDirs: TextItem[],first: boolean) {
		var inputDir = first ? vscode.Uri.file(path.join(dir.fsPath,'input')) : dir;
		var entries = dirfuncs.getDirectoryTypes(inputDir);

		for (let entry of entries) {
			if (entry.type == vscode.FileType.Directory) {
				var name = path.basename(entry.uri.fsPath);
				if (dirfuncs.directoryIsLog(entry.uri.fsPath) || name == 'logs' || name == 'output')
					logDirs.push({uri: entry.uri, type: entry.type, hasLogs: false, hasNonText: false});
				else
					this.getLogDirs(entry.uri,logDirs,false);
			}
		}
	}

	private newDir(textItem: TextItem, top: boolean) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'dirname', prompt: 'Enter directory name' }).then(newdir => {
				if (newdir) {
					var dirPath = visualText.analyzer.getInputDirectory().fsPath;
					if (textItem && !top)
						dirPath = dirfuncs.getDirPath(textItem.uri.fsPath);
					dirPath = path.join(dirPath,newdir);
					dirfuncs.makeDir(dirPath);
					vscode.commands.executeCommand('textView.refreshAll');
				}
			});
		}
	}
	
	private newText(textItem: TextItem, top: boolean) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter text file name' }).then(newname => {
				if (newname) {
					var dirPath = visualText.analyzer.getInputDirectory().fsPath;
					if (textItem && !top)
						dirPath = dirfuncs.getDirPath(textItem.uri.fsPath);
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