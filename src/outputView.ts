import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { logView } from './logView';
import { TextFile } from './textFile';
import { dirfuncs } from './dirfuncs';

export enum outputFileType { TXT, TXXT, TREE, KB, NLP }

interface OutputItem {
	uri: vscode.Uri;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<OutputItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<OutputItem> = new vscode.EventEmitter<OutputItem>();
	readonly onDidChangeTreeData: vscode.Event<OutputItem> = this._onDidChangeTreeData.event;

	refresh(outputItem: OutputItem): void {
		this._onDidChangeTreeData.fire(outputItem);
	}

	constructor() { }

	public getTreeItem(element: OutputItem): vscode.TreeItem {
		var icon = 'file.svg';
		if (element.uri.fsPath.endsWith('.tree')) {
			icon = 'tree.svg';
		} else if (element.uri.fsPath.endsWith('.log')) {
			icon = 'log.svg';
		} else if (element.uri.fsPath.endsWith('.nlp') || element.uri.fsPath.endsWith('.pat')) {
			icon = 'nlp.svg';
		} else if (element.uri.fsPath.endsWith('.kb') || element.uri.fsPath.endsWith('.kbb')) {
			icon = 'kb.svg';
		} else if (element.uri.fsPath.endsWith('.txxt')) {
			icon = 'symbol-keyword.svg';
		}
		return {
			resourceUri: element.uri,
			collapsibleState: void 0,
			command: {
				command: 'outputView.openFile',
				arguments: [element.uri],
				title: 'Open Output File'
			},
			
			iconPath: {
				light: path.join(__filename, '..', '..', 'resources', 'light', icon),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', icon)
			},
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
		vscode.commands.registerCommand('outputView.refreshAll', (resource) => outputViewProvider.refresh(resource));

		vscode.commands.registerCommand('outputView.addKB', (resource) => this.addKB(resource));
		vscode.commands.registerCommand('outputView.deleteOutput', (resource) => this.deleteOutput(resource));
		vscode.commands.registerCommand('outputView.openFile', (resource) => this.openFile(resource));
		vscode.commands.registerCommand('outputView.kb', () => this.loadKB());
		vscode.commands.registerCommand('outputView.matches', () => this.loadTxxt());
		vscode.commands.registerCommand('outputView.trees', () => this.loadTrees());
		vscode.commands.registerCommand('outputView.txt', () => this.loadTxt());
		vscode.commands.registerCommand('outputView.orphanPasses', () => this.loadOrphans());


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

	addKB(resource: OutputItem) {
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
				var oldPath = selection[0].fsPath;
				var filename = path.basename(oldPath);
				var dir = visualText.analyzer.getAnalyzerDirectory('kb').fsPath;
				var newPath = path.join(dir,filename);
				fs.copyFileSync(oldPath,newPath);
				outputView.setType(outputFileType.KB);
				logView.addMessage('KB File copied: '+filename,vscode.Uri.file(oldPath));
				vscode.commands.executeCommand('logView.refreshAll');	
				vscode.commands.executeCommand('outputView.refreshAll');	
			});	
		}
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

	private loadTxxt() {
		this.clearOutput(outputFileType.TXXT);
	}
	
	private loadTrees() {
		this.clearOutput(outputFileType.TREE);
	}

	private loadKB() {
		this.clearOutput(outputFileType.KB);
	}
	
	private loadOrphans() {
		this.clearOutput(outputFileType.NLP);
	}

	public clearOutput(type: outputFileType) {
		this.type = type;
		this.outputFiles = [];
		vscode.commands.executeCommand('outputView.refreshAll');
	}

	public fileHasLog(path: string): boolean {
		this.logDirectory = vscode.Uri.file('');
		if (path.length == 0)
			return false;
		this.logDirectory = vscode.Uri.file(path + visualText.LOG_SUFFIX);
		if (!fs.existsSync(this.logDirectory.fsPath))
			return false;
		var stats = fs.lstatSync(this.logDirectory.fsPath);
		if (!stats)
			return false;
		return stats.isDirectory();
	}

	public getOutputFiles() {
		this.outputFiles = [];
		if (visualText.analyzer.hasText()) {
			if (this.type == outputFileType.KB) {
				this.outputFiles = dirfuncs.getFiles(visualText.analyzer.getAnalyzerDirectory('kb'),['.kb'],true);
				var kbFiles = dirfuncs.getFiles(visualText.analyzer.getOutputDirectory(),['.kbb'],true);
				this.outputFiles = this.outputFiles.concat(kbFiles);
			}
			else if (this.type == outputFileType.NLP) {
				var nlpFiles = dirfuncs.getFiles(visualText.analyzer.getSpecDirectory(),['.pat','.nlp'],true);
				for (let nlpFile of nlpFiles) {
					if (visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath,'.nlp')) == true &&
						visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath,'.pat')) == true) {
						this.outputFiles.push(nlpFile);
					}
				}
			}
			else if (this.type == outputFileType.TXXT) {
				var matchFiles = dirfuncs.getFiles(this.logDirectory,['.txxt'],true);
				this.outputFiles = this.outputFiles.concat(matchFiles);
			}
			else if (this.type == outputFileType.TREE) {
				var finalTree = vscode.Uri.file(path.join(this.logDirectory.fsPath,'final.tree'));
				if (fs.existsSync(finalTree.fsPath)) {
					this.outputFiles.push(finalTree);
				}
				var matchFiles = dirfuncs.getFiles(this.logDirectory,['.tree'],true);
				this.outputFiles = this.outputFiles.concat(matchFiles);
			}
			else {
				var textPath = visualText.analyzer.getTextPath().fsPath;
				this.outputFiles = [];
				if (textPath.length && this.fileHasLog(textPath)) {
					var finalTree = vscode.Uri.file(path.join(this.logDirectory.fsPath,'final.tree'));
					if (fs.existsSync(finalTree.fsPath)) {
						this.outputFiles.push(finalTree);
					}
					var candidates = dirfuncs.getFiles(this.logDirectory);
					for (let cand of candidates) {
						let ext = path.parse(cand.fsPath).ext;
						if (ext.localeCompare('.tree') != 0 && ext.localeCompare('.kbb') != 0 && ext.localeCompare('.txxt') != 0)
							this.outputFiles.push(cand);
					}
				} else {
					dirfuncs.delDir(visualText.analyzer.getOutputDirectory().fsPath);
				}					
			}
		}
        return this.outputFiles;
	}
	
	private openFile(resource: vscode.Uri): void {
		var textFile = new TextFile(resource.fsPath);
		textFile.cleanZeroZero();
        vscode.window.showTextDocument(resource);
	}

	private deleteOutput(resource: OutputItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(resource.uri.fsPath),'\'');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete file'});

			vscode.window.showQuickPick(items).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				if (!dirfuncs.delFile(resource.uri.fsPath)) {
					vscode.window.showWarningMessage('Could not delete file: '+resource.uri.fsPath);
				} else
					vscode.commands.executeCommand('outputView.refreshAll');
			});
		}
	}
}