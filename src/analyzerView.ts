import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';
import { textView, TextItem } from './textView';
import { fileOpRefresh, fileOperation } from './fileOps';

export enum analyzerFolderType { ANALYZER, FOLDER }

interface AnalyzerItem {
	uri: vscode.Uri;
	type: analyzerFolderType;
	hasLogs: boolean;
	hasPats: boolean;
	moveUp: boolean;
	moveDown: boolean;
	isConverting: boolean;
}

export let analyzerItems: AnalyzerItem[] = new Array();

export class AnalyzerTreeDataProvider implements vscode.TreeDataProvider<AnalyzerItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<AnalyzerItem | undefined | null | void> = new vscode.EventEmitter<AnalyzerItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<AnalyzerItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	async getChildren(analyzerItem?: AnalyzerItem): Promise<AnalyzerItem[]> {
		if (analyzerItem) {
			return this.getKeepers(analyzerItem.uri); 
		}
		if (visualText.hasWorkspaceFolder() && visualText.hasAnalyzers()) {
			return this.getKeepers(visualText.getWorkspaceFolder());  
        }
		return [];
	}

	getMovement(analyzerItem: AnalyzerItem) {
		analyzerItem.moveDown = false;
		analyzerItem.moveUp = false;
		var itemPath = analyzerItem.uri.fsPath;
		var parent = path.dirname(itemPath);
		var anaDir = visualText.getAnalyzerDir().fsPath;
		if (parent != anaDir) {
			analyzerItem.moveUp = true;
		}
		if (analyzerItem.type == analyzerFolderType.FOLDER) {
			if (dirfuncs.parentHasOtherDirs(analyzerItem.uri)) {
				analyzerItem.moveDown = true;
			}
		} else if (dirfuncs.parentHasOtherDirs(vscode.Uri.file(itemPath))) {
			analyzerItem.moveDown = true;
		}
	}

	getTreeItem(analyzerItem: AnalyzerItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(analyzerItem.uri, visualText.isAnalyzerDirectory(analyzerItem.uri) ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
		this.getMovement(analyzerItem);
		var conVal = analyzerItem.moveDown ? 'moveDown' : '';
		if (analyzerItem.moveUp)
			conVal = conVal + 'moveUp';

		if (analyzerItem.type === analyzerFolderType.ANALYZER) {
			treeItem.command = { command: 'analyzerView.openAnalyzer', title: "Open Analyzer", arguments: [analyzerItem] };
			var hasLogs = treeItem.contextValue = analyzerItem.hasLogs ? 'hasLogs' : '';
			treeItem.contextValue = conVal + hasLogs;
			treeItem.tooltip = treeItem.contextValue;
			treeItem.iconPath = {
				light: path.join(__filename, '..', '..', 'resources', 'light', 'gear.svg'),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', 'gear.svg')
			}
		} else {
			treeItem.contextValue = conVal + 'isFolder';
			treeItem.contextValue = conVal + 'isFolder';
			treeItem.tooltip = treeItem.contextValue;
			treeItem.command = { command: 'analyzerView.openAnalyzer', title: "Open Analyzer", arguments: [analyzerItem] };
			treeItem.iconPath = {
				light: path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg'),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg'),
			}
		}
		return treeItem;
	}

	getKeepers(dir: vscode.Uri): AnalyzerItem[] {
		var keepers = Array();
		var entries = dirfuncs.getDirectoryTypes(dir);
		var hasAllLogs = false;
		var type: analyzerFolderType = analyzerFolderType.ANALYZER;

		for (let entry of entries) {
			if (entry.type == vscode.FileType.Directory) {
				type = visualText.isAnalyzerDirectory(entry.uri) ? analyzerFolderType.ANALYZER : analyzerFolderType.FOLDER;
				var hasLogs = dirfuncs.analyzerHasLogDirs(entry.uri,true);
				if (hasLogs) hasAllLogs = true;
                keepers.push({uri: entry.uri, type: type, hasLogs: hasLogs, hasPats: false, moveUp: false, moveDown: false, isConverting: false});
			}
		}

		var hasAllLogs = dirfuncs.hasLogDirs(dir,true);
		vscode.commands.executeCommand('setContext', 'analyzers.hasLogs', hasAllLogs);
		return keepers;
	}
}

export let analyzerView: AnalyzerView;
export class AnalyzerView {

	public analyzerView: vscode.TreeView<AnalyzerItem>;
	public folderUri: vscode.Uri | undefined;

	constructor(context: vscode.ExtensionContext) {
		const analyzerViewProvider = new AnalyzerTreeDataProvider();
		this.analyzerView = vscode.window.createTreeView('analyzerView', { treeDataProvider: analyzerViewProvider });
		vscode.commands.registerCommand('analyzerView.refreshAll', () => analyzerViewProvider.refresh());
		vscode.commands.registerCommand('analyzerView.newAnalyzer', () => this.newAnalyzer());
		vscode.commands.registerCommand('analyzerView.deleteAnalyzer', resource => this.deleteAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.loadDefaultAnalyzers', resource => this.loadDefaultAnalyzers());
		vscode.commands.registerCommand('analyzerView.openAnalyzer', resource => this.openAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.deleteAnalyzerLogs', resource => this.deleteAnalyzerLogs(resource));
		vscode.commands.registerCommand('analyzerView.deleteAllAnalyzerLogs', () => this.deleteAllAnalyzerLogs());
		vscode.commands.registerCommand('analyzerView.updateTitle', resource => this.updateTitle(resource));
		vscode.commands.registerCommand('analyzerView.copyAnalyzer', resource => this.copyAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.dupeAnalyzer', resource => this.dupeAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.explore', resource => this.explore(resource));
		vscode.commands.registerCommand('analyzerView.newFolder', resource => this.newFolder(resource));
		vscode.commands.registerCommand('analyzerView.moveToFolder', resource => this.moveToFolder(resource));
		vscode.commands.registerCommand('analyzerView.moveUp', resource => this.moveUp(resource));		vscode.commands.registerCommand('analyzerView.exploreAll', () => this.exploreAll());
		vscode.commands.registerCommand('analyzerView.copyAll', () => this.copyAll());

		visualText.colorizeAnalyzer();
		this.folderUri = undefined;
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!analyzerView) {
            analyzerView = new AnalyzerView(ctx);
        }
        return analyzerView;
	}

	newFolder(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'dirname', prompt: 'Enter folder name' }).then(newdir => {
				if (newdir) {
					var dirPath = '';
					if (!analyzerItem) {
						dirPath = visualText.getAnalyzerDir().fsPath;
					} else if (analyzerItem.type == analyzerFolderType.FOLDER) {
						dirPath = analyzerItem.uri.fsPath;
					} else {
						dirPath = path.dirname(analyzerItem.uri.fsPath);
					}

					dirfuncs.makeDir(path.join(dirPath,newdir));
					vscode.commands.executeCommand('analyzerView.refreshAll');
				}
			});
		}
	}

	moveToFolder(analyzerItem: AnalyzerItem) {
		if (this.folderUri) {
			var to = path.join(this.folderUri.fsPath,path.basename(analyzerItem.uri.fsPath));
			dirfuncs.rename(analyzerItem.uri.fsPath,to);
			vscode.commands.executeCommand('analyzerView.refreshAll');
		} else {
			vscode.window.showInformationMessage('No folder selected');
		}
	}

	moveUp(analyzerItem: AnalyzerItem) {
		var parent = path.dirname(analyzerItem.uri.fsPath);
		var analyzersFolder = visualText.getAnalyzerDir();
		if (parent != analyzersFolder.fsPath) {
			parent = path.dirname(parent);
			var to = path.join(parent,path.basename(analyzerItem.uri.fsPath));
			dirfuncs.rename(analyzerItem.uri.fsPath,to);
			vscode.commands.executeCommand('analyzerView.refreshAll');
		} else {
			vscode.window.showInformationMessage('Already at the top');
		}
	}

	explore(analyzerItem: AnalyzerItem) {
        if (fs.existsSync(analyzerItem.uri.fsPath)) {
			visualText.openFileManager(analyzerItem.uri.fsPath);
		}
	}

	exploreAll() {
		let dir = visualText.getAnalyzerDir();
        if (fs.existsSync(dir.fsPath)) {
			visualText.openFileManager(dir.fsPath);
		}
	}

	copyAll() {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Folder to copy all Analyzers to',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: false,
				canSelectFolders: true
			};
			vscode.window.showOpenDialog(options).then(selection => {
				if (!selection) {
					return;
				}
				const analyzers = visualText.getAnalyzers();
				var toFolder = vscode.Uri.file(selection[0].fsPath);
				for (let analyzer of analyzers) {
					var folder = path.basename(analyzer.fsPath);
					visualText.fileOps.addFileOperation(analyzer,vscode.Uri.file(path.join(toFolder.fsPath,folder)),[fileOpRefresh.UNKNOWN],fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();	
			});	
		}		
	}

	copyAnalyzer(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Folder to copy to',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: false,
				canSelectFolders: true
			};
			vscode.window.showOpenDialog(options).then(selection => {
				if (!selection) {
					return;
				}
				var folder = path.basename(analyzerItem.uri.fsPath);
				visualText.fileOps.addFileOperation(analyzerItem.uri,vscode.Uri.file(path.join(selection[0].fsPath,folder)),[fileOpRefresh.UNKNOWN],fileOperation.COPY);
				visualText.fileOps.startFileOps();	
			});	
		}
	}

	dupeAnalyzer(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(analyzerItem.uri.fsPath), prompt: 'Enter duplicate analyzer name' }).then(newname => {
				if (newname) {
					var folder = path.dirname(analyzerItem.uri.fsPath);
					visualText.fileOps.addFileOperation(analyzerItem.uri,vscode.Uri.file(path.join(folder,newname)),[fileOpRefresh.ANALYZERS],fileOperation.COPY);
					visualText.fileOps.startFileOps();	
					vscode.commands.executeCommand('analyzerView.refreshAll');
					vscode.commands.executeCommand('sequenceView.refreshAll');	
				}
			});
		}
	}
	
	private updateTitle(uri: vscode.Uri): void {
		if (uri.fsPath.length > 0) {
			var anaChosen = path.basename(uri.fsPath);
			if (anaChosen.length)
				this.analyzerView.title = `ANALYZERS (${anaChosen})`;
			return;
		}
		this.analyzerView.title = 'ANALYZERS';
	}

	private openAnalyzer(analyzerItem: AnalyzerItem): void {
		visualText.colorizeAnalyzer();
		if (analyzerItem.type == analyzerFolderType.ANALYZER) {
			visualText.loadAnalyzer(analyzerItem.uri);
			this.folderUri = undefined;
		} else {
			this.folderUri = analyzerItem.uri;
		}
	}

	private deleteAnalyzer(analyzerItem: AnalyzerItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(analyzerItem.uri.fsPath),'\' analyzer?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete analyzer'});

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(analyzerItem.uri,analyzerItem.uri,[fileOpRefresh.ANALYZERS],fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	private loadDefaultAnalyzers() {
		var defaults = vscode.Uri.file(path.join(visualText.getExtensionPath().fsPath,visualText.NLPENGINE_REPO,'analyzers'));
		vscode.commands.executeCommand("vscode.openFolder",defaults);
		vscode.commands.executeCommand('workbench.action.openPanel');
	}
	
	private newAnalyzer() {
		visualText.analyzer.newAnalyzer();
	}

	public deleteAllAnalyzerLogs() {
		if (visualText.hasWorkspaceFolder()) {

			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete log directories for all analyzers?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete analyzers log files'});

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				this.deleteAllAnalyzerLogDirs();
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteAnalyzerLogs(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			var analyzerName = path.basename(analyzerItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete log directories for \'',analyzerName,'\'?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete analyzer log files'});

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;

				textView.deleteFolderLogs(analyzerItem.uri);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteAllAnalyzerLogDirs() {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Deleting all log directories",
			cancellable: true
		}, async (progress, token) => {
			token.onCancellationRequested(() => {
				console.log("User canceled the long running operation");
			});

			if (vscode.workspace.workspaceFolders) {
				var analyzerUris = visualText.getAnalyzers();
				for (let analyzerUri of analyzerUris) {
					var analyzerName = path.basename(analyzerUri.fsPath);
					progress.report({ increment: 10, message: analyzerName });
					textView.deleteFolderLogs(analyzerUri);
				}
			}
		});
	}

	private getAnalyzerItem(analyzerDir: vscode.Uri): AnalyzerItem {
		for (let analyzerItem of analyzerItems) {
			if (analyzerItem.uri.fsPath == analyzerDir.fsPath)
				return analyzerItem;
		}
		return analyzerItems[0];
	}

	public getConverting(analyzerDir: vscode.Uri): boolean {
		var item = this.getAnalyzerItem(analyzerDir);
		return item.isConverting;
	}

	public setConverting(analyzerDir: vscode.Uri, value: boolean) {
		var item = this.getAnalyzerItem(analyzerDir);
		item.isConverting = value;
	}
}