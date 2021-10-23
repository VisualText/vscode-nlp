import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { NLPFile } from './nlp';
import { FindFile } from './findFile';
import { findView } from './findView';
import { dirfuncs } from './dirfuncs';
import { fileOps, fileOperation } from './fileOps';

export interface TextItem {
	uri: vscode.Uri;
	type: vscode.FileType;
	hasLogs: boolean;
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
		var conval = textItem.hasLogs ? 'HasLogs' : '';
		if (textItem.type === vscode.FileType.File) {
			treeItem.command = { command: 'textView.openFile', title: "Open File", arguments: [textItem], };
			treeItem.contextValue = 'file' + conval;
			treeItem.iconPath = {
				light: textItem.hasLogs ? path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') :  
									path.join(__filename, '..', '..', 'resources', 'light', 'file.svg'),
				dark: textItem.hasLogs ? path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') : 
									path.join(__filename, '..', '..', 'resources', 'dark', 'file.svg'),
			}
		} else {
			treeItem.contextValue = 'dir';
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
				var hasLogs =  dirfuncs.fileHasLog(entry.uri.fsPath);
				keepers.push({uri: entry.uri, type: entry.type, hasLogs: hasLogs});
			}
		}

		var hasAllLogs = dirfuncs.hasLogDirs(visualText.getCurrentAnalyzer(),true);
		vscode.commands.executeCommand('setContext', 'text.hasLogs', hasAllLogs);
		return keepers;
	}

	existingText(textItem: TextItem) {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: true,
				openLabel: 'Add Existing File(s)',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: true,
				canSelectFolders: false,
				filters: {
					'Text files': ['txt','xml','html','cvs'],
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
						if (textPath.length)
							dir = path.dirname(textPath);
					}
					var newPath = vscode.Uri.file(path.join(dir,filename));
					fileOps.addFileOperation(sel,newPath,fileOperation.COPY);
					fileOps.startFileOps();
				}
	
				vscode.commands.executeCommand('textView.refreshAll');	
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
					} else if (visualText.analyzer.getTextPath()) {
						var textPath = visualText.analyzer.getTextPath().fsPath;
						if (textPath.length > 1)
							dir = path.dirname(textPath);
					}
					var newPath = vscode.Uri.file(path.join(dir,dirname));
					visualText.fileOps.addFileOperation(sel,newPath,fileOperation.COPY);
					visualText.fileOps.startFileOps();	
				}
	
				vscode.commands.executeCommand('textView.refreshAll');	
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
}

export let textView: TextView;
export class TextView {

	private textView: vscode.TreeView<TextItem>;
	private findFile = new FindFile();

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new FileSystemProvider();
		this.textView = vscode.window.createTreeView('textView', { treeDataProvider });
		vscode.commands.registerCommand('textView.refreshAll', (textItem) => treeDataProvider.refresh(textItem));
		vscode.commands.registerCommand('textView.existingText', (textItem) => treeDataProvider.existingText(textItem));
		vscode.commands.registerCommand('textView.existingFolder', (textItem) => treeDataProvider.existingFolder(textItem));
		vscode.commands.registerCommand('textView.rename', (textItem) => treeDataProvider.rename(textItem));
		vscode.commands.registerCommand('textView.renameDir', (textItem) => treeDataProvider.renameDir(textItem));

		vscode.commands.registerCommand('textView.openFile', (textItem) => this.openFile(textItem));
		vscode.commands.registerCommand('textView.analyzeLast', () => this.analyzeLast());
		vscode.commands.registerCommand('textView.analyze', (textItem) => this.analyze(textItem));
		vscode.commands.registerCommand('textView.analyzeDir', (textItem) => this.analyzeDir(textItem));
		vscode.commands.registerCommand('textView.openText', () => this.openText());
		vscode.commands.registerCommand('textView.search', () => this.search());
		vscode.commands.registerCommand('textView.newText', (textItem) => this.newText(textItem));
		vscode.commands.registerCommand('textView.newDir', (textItem) => this.newDir(textItem));
		vscode.commands.registerCommand('textView.deleteFile', (textItem) => this.deleteFile(textItem));
		vscode.commands.registerCommand('textView.deleteDir', (textItem) => this.deleteFile(textItem));
		vscode.commands.registerCommand('textView.deleteAnalyzerLogs', (textItem) => this.deleteAnalyzerLogs(textItem));
		vscode.commands.registerCommand('textView.deleteAllLogs', () => this.deleteAllLogs());
		vscode.commands.registerCommand('textView.updateTitle', (textItem) => this.updateTitle(textItem));
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
			this.openFile({uri: textUri, type: vscode.FileType.File, hasLogs: false});
            var nlp = new NLPFile();
			nlp.analyze(textUri);
        }
	}

	analyze(textItem: TextItem) {
        if (textItem.uri.fsPath.length) {
			this.openFile(textItem);
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
		/* Currently not compiling
		var filepath = resource.fsPath;
		if (resource && filepath.length) {
			var filename = path.basename(resource.fsPath);
			if (filename.length) {
				this.textView.title = `TEXT (${filename})`;	
				return;					
			}
		}
		this.textView.title = 'TEXT';
		*/
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
				visualText.fileOps.addFileOperation(textItem.uri,textItem.uri,fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteAnalyzerLogs(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			var filename = path.basename(textItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete logs for \'',filename,'\'?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete '+filename });

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				this.deleteAnalyzerLogDir(textItem.uri.fsPath);
			});
		}
	}

	public deleteAnalyzerLogDir(dirPath: string): void {
		var logPath = vscode.Uri.file(dirPath + visualText.LOG_SUFFIX);
		visualText.fileOps.addFileOperation(logPath,logPath,fileOperation.DELETE);
		visualText.fileOps.startFileOps();
	}

	private deleteAllLogs(): void {
		if (visualText.hasWorkspaceFolder() && visualText.analyzer.hasText()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete all logs?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete all logs' });

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				var anaPath = visualText.getCurrentAnalyzer();
				if (anaPath.fsPath.length) {
					this.deleteAnalyzerLogFiles(anaPath);
					visualText.fileOps.startFileOps();
				}
			});
		}
	}

	public deleteAnalyzerLogFiles(analyzerDir: vscode.Uri) {
		var analyzerName = path.basename(analyzerDir.fsPath);
		const logDirs: TextItem[] = Array();
		this.getLogDirs(analyzerDir,logDirs,false);
		var count = logDirs.length;
		
		if (count) {
			for (let dir of logDirs) {
				var dirName = dir.uri.fsPath.substring(analyzerDir.fsPath.length);
				visualText.fileOps.addFileOperation(dir.uri,dir.uri,fileOperation.DELETE);
			};
		}
	}

	public deleteAllLogDirs() {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Deleting all log directories",
			cancellable: true
		}, async (progress, token) => {
			token.onCancellationRequested(() => {
				console.log("User canceled the long running operation");
			});

			if (vscode.workspace.workspaceFolders) {
				var analyzers = dirfuncs.getDirectoryTypes(vscode.workspace.workspaceFolders[0].uri);
				for (let analyzer of analyzers) {
					var analyzerName = path.basename(analyzer.uri.fsPath);
					progress.report({ increment: 10, message: analyzerName });
					textView.deleteAnalyzerLogFiles(analyzer.uri);
				}
				visualText.fileOps.startFileOps();
			}
		});
	}
		
	public getLogDirs(dir: vscode.Uri, logDirs: TextItem[],first: boolean) {
		var inputDir = first ? vscode.Uri.file(path.join(dir.fsPath,'input')) : dir;
		var entries = dirfuncs.getDirectoryTypes(inputDir);

		for (let entry of entries) {
			if (entry.type == vscode.FileType.Directory) {
				var name = path.basename(entry.uri.fsPath);
				if (dirfuncs.directoryIsLog(entry.uri.fsPath) || name == 'logs' || name == 'output')
					logDirs.push({uri: entry.uri, type: entry.type, hasLogs: false});
				else
					this.getLogDirs(entry.uri,logDirs,false);
			}
		}
	}

	private newDir(textItem: TextItem) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'dirname', prompt: 'Enter directory name' }).then(newdir => {
				if (newdir) {
					var dirPath = visualText.analyzer.getInputDirectory().fsPath;
					if (textItem)
						dirPath = dirfuncs.getDirPath(textItem.uri.fsPath);
					dirPath = path.join(dirPath,newdir);
					dirfuncs.makeDir(dirPath);
					vscode.commands.executeCommand('textView.refreshAll');
				}
			});
		}
	}
	
	private newText(textItem: TextItem) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter text file name' }).then(newname => {
				if (newname) {
					var dirPath = visualText.analyzer.getInputDirectory().fsPath;
					if (textItem)
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