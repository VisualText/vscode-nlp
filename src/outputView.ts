import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { logView } from './logView';
import { TextFile } from './textFile';
import { dirfuncs } from './dirfuncs';
import { fileOpRefresh, fileOperation } from './fileOps';

export enum outputFileType { ALL, TXXT, TREE, KB, NLP }

interface OutputItem {
	uri: vscode.Uri;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<OutputItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<OutputItem | undefined | null | void> = new vscode.EventEmitter<OutputItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<OutputItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(element: OutputItem): vscode.TreeItem {
		var icon = visualText.fileIconFromExt(element.uri.fsPath);
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
		vscode.commands.registerCommand('outputView.refreshAll', () => outputViewProvider.refresh());

		vscode.commands.registerCommand('outputView.copytoKB', (resource) => this.copytoKB(resource));
		vscode.commands.registerCommand('outputView.copytoText', (resource) => this.copytoText(resource));
		vscode.commands.registerCommand('outputView.deleteOutput', (resource) => this.deleteOutput(resource));
		vscode.commands.registerCommand('outputView.openFile', (resource) => this.openFile(resource));
		vscode.commands.registerCommand('outputView.kb', () => this.loadKB());
		vscode.commands.registerCommand('outputView.matches', () => this.loadTxxt());
		vscode.commands.registerCommand('outputView.trees', () => this.loadTrees());
		vscode.commands.registerCommand('outputView.all', () => this.loadAll());
		vscode.commands.registerCommand('outputView.orphanPasses', () => this.loadOrphans());
		vscode.commands.registerCommand('outputView.deleteOrphans', () => this.deleteOrphans());
		vscode.commands.registerCommand('outputView.explore', () => this.explore());

		this.outputFiles = [];
		this.logDirectory = vscode.Uri.file('');
		this.type = outputFileType.ALL;
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!outputView) {
            outputView = new OutputView(ctx);
        }
        return outputView;
	}

	explore() {
		let dir = visualText.analyzer.getOutputDirectory();
		visualText.openFileManager(dir.fsPath);
	}

	deleteOrphans(): void {
		if (visualText.hasWorkspaceFolder()) {
			let files: vscode.Uri[] = [];
			var nlpFiles = dirfuncs.getFiles(visualText.analyzer.getSpecDirectory(),['.pat','.nlp'],true);
			for (let nlpFile of nlpFiles) {
				if (visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath,'.nlp')) == true &&
					visualText.analyzer.seqFile.isOrphan(path.basename(nlpFile.fsPath,'.pat')) == true) {
					files.push(nlpFile);
				}
			}

			let count = files.length;

			let items: vscode.QuickPickItem[] = [];
			items.push({label: 'Yes', description: 'Delete all orphan passes'});
			items.push({label: 'No', description: 'Do not delete file'});

			vscode.window.showQuickPick(items, {title: 'Delete Orphan Files', placeHolder: 'Delete all '+count.toString()+' file(s)'}).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				for (let file of files) {
					visualText.fileOps.addFileOperation(file,file,[fileOpRefresh.OUTPUT],fileOperation.DELETE);
				}
				visualText.fileOps.startFileOps();
			});
		}
	}

	public setType(type: outputFileType) {
		this.type = type;
	}

	public getType(): outputFileType {
		return this.type;
	}

	private loadAll() {
		this.clearOutput(outputFileType.ALL);
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
						if (ext.localeCompare('.tree') != 0 && ext.localeCompare('.txxt') != 0)
							this.outputFiles.push(cand);
					}
				}					
			}
		}
        return this.outputFiles;
	}
	
	private openFile(resource: vscode.Uri): void {
		var textFile = new TextFile(resource.fsPath);
		textFile.cleanZeroZero();
		visualText.colorizeAnalyzer();
        vscode.window.showTextDocument(resource);
	}

	private deleteOutput(resource: OutputItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(resource.uri.fsPath),'\'');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete file'});

			vscode.window.showQuickPick(items, {title: 'Delete File', placeHolder: 'Select Yes or No?'}).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(resource.uri,resource.uri,[fileOpRefresh.OUTPUT],fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	copytoKB(outputItem: OutputItem) {
		this.copyFileToAnalyzer(outputItem.uri,path.join('kb','user'),'Copy file to another analyzer','Copy file to the KB directory of:');
	}

	copytoText(outputItem: OutputItem) {
		this.copyFileToAnalyzer(outputItem.uri,'input','Copy file to another analyzer','Copy file to input directory of:');
	}

	copyFileToAnalyzer(uri: vscode.Uri, subdir: string, title: string, placeHolder: string) {
		if (visualText.getWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = visualText.analyzerFolderList();

			vscode.window.showQuickPick(items, {title, canPickMany: false, placeHolder: placeHolder}).then(selection => {
				if (!selection || !selection.description)
					return;
				if (selection.description.startsWith('(FOLDER')) {
					vscode.window.showWarningMessage('You must select an analyzer directory not a folder');
					return;
				}
				let newFile = vscode.Uri.file(path.join(selection.description,subdir,path.basename(uri.fsPath)));
				visualText.fileOps.addFileOperation(uri,newFile,[fileOpRefresh.KB,fileOpRefresh.TEXT],fileOperation.COPY);
				visualText.fileOps.startFileOps();
			});
		}
	}
}