import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { outputView } from './outputView';
import { logView } from './logView';
import { dirfuncs } from './dirfuncs';
import { Entry } from './textView';
import * as fs from 'fs';

interface AnalyzerItem {
	uri: vscode.Uri;
	hasLogs: boolean;
}

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
            const children: AnalyzerItem[] = new Array();
			var hasAllLogs = false;
            for (let analyzer of analyzers) {
				var hasLogs = analyzerView.hasLogDirs(analyzer,true);
				if (hasLogs) hasAllLogs = true;
                children.push({uri: analyzer, hasLogs: hasLogs});
            }
			vscode.commands.executeCommand('setContext', 'analyzers.hasLogs', hasAllLogs);
            return children;
        }
		return [];
	}
}

const deleteLogDir = (dir: vscode.Uri) => {
	return new Promise<void>((resolve,reject) => {
		if (dirfuncs.delDir(dir.fsPath))
			resolve();
		else
			reject();
	});
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
		vscode.commands.registerCommand('analyzerView.openAnalyzer', resource => this.openAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.deleteLogFiles', resource => this.deleteLogFiles(resource));
		vscode.commands.registerCommand('analyzerView.deleteAllLogFiles', () => this.deleteAllLogFiles());
		vscode.commands.registerCommand('analyzerView.updateTitle', resource => this.updateTitle(resource));
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!analyzerView) {
            analyzerView = new AnalyzerView(ctx);
        }
        return analyzerView;
	}
	
	private updateTitle(analyzerItem: AnalyzerItem): void {
		/* Currently not compiling
		var analyzerName = path.basename(analyzerItem.uri.fsPath);
		if (analyzerName.length)
			this.analyzerView.title = `ANALYZERS (${analyzerName})`;
		else
			this.analyzerView.title = 'ANALYZERS';
		*/
	}

	private openAnalyzer(analyzerItem: AnalyzerItem): void {
		this.updateTitle(analyzerItem);
		visualText.loadAnalyzer(analyzerItem.uri);
	}

	private deleteAnalyzer(analyzerItem: AnalyzerItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(analyzerItem.uri.fsPath),'\' analyzer');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete log'});

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				dirfuncs.delDir(analyzerItem.uri.fsPath);
				vscode.commands.executeCommand('analyzerView.refreshAll');
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
	
	private newAnalyzer() {
		visualText.analyzer.newAnalyzer();
	}
	
	public hasLogDirs(dir: vscode.Uri, first: boolean): boolean {
		var inputDir = first ? vscode.Uri.file(path.join(dir.fsPath,'input')) : dir;
		var entries = dirfuncs.getDirectoryTypes(inputDir);

		for (let entry of entries) {
			if (entry.type == vscode.FileType.Directory) {
				if (outputView.directoryIsLog(entry.uri.fsPath))
					return true;
				else
					this.hasLogDirs(entry.uri,false);
			}
		}
		return false;
	}

	public getLogDirs(dir: vscode.Uri, logDirs: Entry[],first: boolean) {
		var inputDir = first ? vscode.Uri.file(path.join(dir.fsPath,'input')) : dir;
		var entries = dirfuncs.getDirectoryTypes(inputDir);

		for (let entry of entries) {
			if (entry.type == vscode.FileType.Directory) {
				if (outputView.directoryIsLog(entry.uri.fsPath))
					logDirs.push(entry);
				else
					this.getLogDirs(entry.uri,logDirs,false);
			}
		}
	}

	public deleteAllLogFiles() {
		if (visualText.hasWorkspaceFolder()) {

			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete log directories for all analyzers');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete directory logs'});

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;

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
							this.deleteAnalyzerLogFiles(analyzer.uri);
						}

						const p = new Promise<void>(resolve => {
							vscode.commands.executeCommand('analyzerView.refreshAll');
							vscode.commands.executeCommand('textView.refreshAll');	
							vscode.commands.executeCommand('logView.refreshAll');	
							resolve();
						});
						return p;
					}
				});
			});
		}
	}

	public deleteLogFiles(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			var analyzerName = path.basename(analyzerItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete log directories for \'',analyzerName,'\'');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete directory logs'});

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;

				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'Deleting log directories',
					cancellable: true
				}, async (progress, token) => {
					token.onCancellationRequested(() => {
						console.log("User canceled the long running operation");
					});

					progress.report({ increment: 50, message: analyzerName });

					this.deleteAnalyzerLogFiles(analyzerItem.uri);
					const p = new Promise<void>(resolve => {
						vscode.commands.executeCommand('analyzerView.refreshAll');
						vscode.commands.executeCommand('textView.refreshAll');	
						vscode.commands.executeCommand('logView.refreshAll');	
						resolve();
					});
					return p;
				});
			});
		}
	}

	deleteAnalyzerLogFiles(analyzerDir: vscode.Uri) {
		const logDirs: Entry[] = Array();
		this.getLogDirs(analyzerDir,logDirs,true);
		var count = logDirs.length;
		
		if (count) {
			for (let dir of logDirs) {
				logView.addMessage(`Removing ${dir.uri.fsPath}`,dir.uri);
				vscode.commands.executeCommand('logView.refreshAll');	

				fs.rmdir(dir.uri.fsPath, { recursive: true},
					(error) => {
						if (error) {
							console.log(error);
						}
						else {
							vscode.commands.executeCommand('analyzerView.refreshAll');
							vscode.commands.executeCommand('textView.refreshAll');	
						}
				});
			};
		}
	}
}