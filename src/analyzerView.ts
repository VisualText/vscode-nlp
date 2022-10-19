import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';
import { textView, TextItem } from './textView';
import { fileOpRefresh, fileOperation } from './fileOps';

interface AnalyzerItem {
	uri: vscode.Uri;
	hasLogs: boolean;
	hasPats: boolean;
	isConverting: boolean;
}

export let analyzerItems: AnalyzerItem[] = new Array();

export class AnalyzerTreeDataProvider implements vscode.TreeDataProvider<AnalyzerItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<AnalyzerItem> = new vscode.EventEmitter<AnalyzerItem>();
	readonly onDidChangeTreeData: vscode.Event<AnalyzerItem> = this._onDidChangeTreeData.event;

	refresh(analyzerItem: AnalyzerItem): void {
		this._onDidChangeTreeData.fire(analyzerItem);
	}

	constructor() { }

	public getTreeItem(element: AnalyzerItem): vscode.TreeItem {
		var conVal = element.hasLogs ? 'hasLogs' : '';
		return {
			resourceUri: element.uri,
			collapsibleState: void 0,
			contextValue: conVal,
			iconPath: {
				light: path.join(__filename, '..', '..', 'resources', 'light', 'gear.svg'),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', 'gear.svg')
			},
			command: {
				command: 'analyzerView.openAnalyzer',
				arguments: [element],
				title: 'Open Analyzer'
			}
		};
	}

	public getChildren(element?: AnalyzerItem): AnalyzerItem[] {
        if (visualText.hasWorkspaceFolder()) {
            const analyzers = visualText.getAnalyzers();
            analyzerItems = [];
			var hasAllLogs = false;
            for (let analyzer of analyzers) {
				var hasLogs = dirfuncs.hasLogDirs(analyzer,true);
				if (hasLogs) hasAllLogs = true;
                analyzerItems.push({uri: analyzer, hasLogs: hasLogs, hasPats: false, isConverting: false});
            }
			vscode.commands.executeCommand('setContext', 'analyzers.hasLogs', hasAllLogs);
            return analyzerItems;
        }
		return [];
	}
}

export let analyzerView: AnalyzerView;
export class AnalyzerView {

	public analyzerView: vscode.TreeView<AnalyzerItem>;

	constructor(context: vscode.ExtensionContext) {
		const analyzerViewProvider = new AnalyzerTreeDataProvider();
		this.analyzerView = vscode.window.createTreeView('analyzerView', { treeDataProvider: analyzerViewProvider });
		vscode.commands.registerCommand('analyzerView.refreshAll', resource => analyzerViewProvider.refresh(resource));
		vscode.commands.registerCommand('analyzerView.newAnalyzer', () => this.newAnalyzer());
		vscode.commands.registerCommand('analyzerView.deleteAnalyzer', resource => this.deleteAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.colorizeAnalyzer', resource => this.colorizeAnalyzer());
		vscode.commands.registerCommand('analyzerView.loadDefaultAnalyzers', resource => this.loadDefaultAnalyzers());
		vscode.commands.registerCommand('analyzerView.openAnalyzer', resource => this.openAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.deleteAnalyzerLogs', resource => this.deleteAnalyzerLogs(resource));
		vscode.commands.registerCommand('analyzerView.deleteAllAnalyzerLogs', () => this.deleteAllAnalyzerLogs());
		vscode.commands.registerCommand('analyzerView.updateTitle', resource => this.updateTitle(resource));
		vscode.commands.registerCommand('analyzerView.copyAnalyzer', resource => this.copyAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.dupeAnalyzer', resource => this.dupeAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.copyAll', () => this.copyAll());
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!analyzerView) {
            analyzerView = new AnalyzerView(ctx);
        }
        return analyzerView;
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
	
	private updateTitle(analyzerItem: AnalyzerItem): void {
		visualText.analyzer.name = path.basename(analyzerItem.uri.fsPath);
		if (visualText.analyzer.name.length)
			this.analyzerView.title = `ANALYZERS (${visualText.analyzer.name})`;
		else
			this.analyzerView.title = 'ANALYZERS';
	}

	private openAnalyzer(analyzerItem: AnalyzerItem): void {
		this.updateTitle(analyzerItem);
		visualText.loadAnalyzer(analyzerItem.uri);
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

	private colorizeAnalyzer() {
		if (vscode.workspace.workspaceFolders) {
			var fromFile = path.join(visualText.extensionDirectory().fsPath,'.vscode','settings.json');
			var toFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath,'.vscode','settings.json');
			dirfuncs.copyFile(fromFile,toFile);
		}
	}

	private loadDefaultAnalyzers() {
		var ext = visualText.getExtension();
        if (ext) {
			var defaults = vscode.Uri.file(path.join(ext.uri.fsPath,visualText.NLPENGINE_FOLDER,'analyzers'));
			vscode.commands.executeCommand("vscode.openFolder",defaults);
			vscode.commands.executeCommand('workbench.action.openPanel');
		}
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

				this.deleteAnalyzerLogFiles(analyzerItem.uri);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteAnalyzerLogFiles(analyzerDir: vscode.Uri) {
		var analyzerName = path.basename(analyzerDir.fsPath);
		const logDirs: TextItem[] = Array();
		textView.getLogDirs(analyzerDir,logDirs,false);
		var count = logDirs.length;
		
		if (count) {
			for (let dir of logDirs) {
				visualText.fileOps.addFileOperation(dir.uri,dir.uri,[fileOpRefresh.TEXT],fileOperation.DELETE);
			};
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
					analyzerView.deleteAnalyzerLogFiles(analyzerUri);
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