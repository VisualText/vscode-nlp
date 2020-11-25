import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';

export enum outputFileType { TXT, KB }

interface OutputItem {
	uri: vscode.Uri;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<OutputItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<OutputItem> = new vscode.EventEmitter<OutputItem>();
	readonly onDidChangeTreeData: vscode.Event<OutputItem> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(element: OutputItem): vscode.TreeItem {
		return {
			resourceUri: element.uri,
			collapsibleState: void 0,
			command: {
				command: 'outputView.openFile',
				arguments: [element.uri],
				title: 'Open Output File'
			}
		};
	}

	public getChildren(element?: OutputItem): OutputItem[] {
        if (visualText.hasWorkspaceFolder()) {
			const children: OutputItem[] = new Array();
            for (let folder of outputView.getOutputFiles()) {
				children.push({uri: folder});
            }
            return children;
        }

		return [];
	}

	addKB() {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Add KB File',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: true,
				canSelectFolders: true,
				filters: {
					'Text files': ['kb'],
					'All files': ['*']
				}
			};
			vscode.window.showOpenDialog(options).then(selection => {
				if (!selection) {
					return;
				}
				var oldPath = selection[0].path;
				var filename = path.basename(oldPath);
				var dir = visualText.analyzer.getAnalyzerDirectory('kb').path;
				var newPath = path.join(dir,filename);
				fs.copyFileSync(oldPath,newPath);
				outputView.setType(outputFileType.KB);		
				this.refresh();
			});	
		}
	}
}

export let outputView: OutputView;
export class OutputView {

	public outputView: vscode.TreeView<OutputItem>;
	private outputFiles: vscode.Uri[];
	private logDirectory: vscode.Uri;
	private type: outputFileType;

	constructor(context: vscode.ExtensionContext) {
		const outputViewProvider = new OutputTreeDataProvider();
		this.outputView = vscode.window.createTreeView('outputView', { treeDataProvider: outputViewProvider });
		vscode.commands.registerCommand('outputView.refreshAll', () => outputViewProvider.refresh());
		vscode.commands.registerCommand('outputView.addKB', () => outputViewProvider.addKB());

		vscode.commands.registerCommand('outputView.deleteOutput', resource => this.deleteOutput(resource));
		vscode.commands.registerCommand('outputView.openFile', resource => this.openFile(resource));
		vscode.commands.registerCommand('outputView.kb', () => this.loadKB());
		vscode.commands.registerCommand('outputView.txt', () => this.loadTxt());
		this.outputFiles = [];
		this.logDirectory = vscode.Uri.file('');
		this.type = outputFileType.TXT;
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!outputView) {
            outputView = new OutputView(ctx);
        }
        return outputView;
	}

	public setType(type: outputFileType) {
		this.type = type;
	}

	public getType(): outputFileType {
		return this.type;
	}

	private loadTxt() {
		this.clearOutput(outputFileType.TXT);
	}

	private loadKB() {
		this.clearOutput(outputFileType.KB);
	}

	public clearOutput(type: outputFileType) {
		this.type =type;
		this.outputFiles = [];
		vscode.commands.executeCommand('outputView.refreshAll');
	}

	public directoryIsLog(path: string): boolean {
		if (!path.endsWith('_log'))
			return false;
		const filepath = path.substr(0,path.length-4);
		var stats = fs.lstatSync(filepath);
		if (!stats)
			return false;
		return stats.isFile();
	}

	public fileHasLog(path: string): boolean {
		this.logDirectory = vscode.Uri.file('');
		if (path.length == 0)
			return false;
		this.logDirectory = vscode.Uri.file(path + '_log');
		if (!fs.existsSync(this.logDirectory.path))
			return false;
		var stats = fs.lstatSync(this.logDirectory.path);
		if (!stats)
			return false;
		return stats.isDirectory();
	}

	public getOutputFiles() {
		this.outputFiles = [];
		if (visualText.analyzer.hasText()) {
			if (this.type == outputFileType.KB) {
				this.outputFiles = dirfuncs.getFiles(visualText.analyzer.getAnalyzerDirectory('kb'),['.kb'],true);
				var kbFiles = dirfuncs.getFiles(visualText.analyzer.getOutputDirectory(),['.kb'],true);
				this.outputFiles = this.outputFiles.concat(kbFiles);
			} else {
				var textPath = visualText.analyzer.getTextPath().path;
				this.outputFiles = [];
				if (textPath.length && this.fileHasLog(textPath)) {
					var candidates = dirfuncs.getFiles(this.logDirectory,['.txt','.log']);
					for (let cand of candidates) {
						let base = path.basename(cand.path);
						if (!base.startsWith('ana'))
							this.outputFiles.push(cand);
					}
				} else {
					dirfuncs.delDir(visualText.analyzer.getOutputDirectory().path);
				}					
			}
		}
        return this.outputFiles;
	}
	
	private openFile(resource: vscode.Uri): void {
        vscode.window.showTextDocument(resource);
	}

	private deleteOutput(resource: OutputItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(resource.uri.path),'\' analzyer');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete pass'});

			vscode.window.showQuickPick(items).then(selection => {
			});
		}
	}
	
	private addKB(resource: OutputItem) {
		console.log('New Output code to be implemented');
	}
}