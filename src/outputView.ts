import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { TextFile } from './textFile';
import { dirfuncs } from './dirfuncs';
import { fileOpRefresh, fileOperation } from './fileOps';
import { anaSubDir } from './analyzer';

export enum outputFileType { ALL, TXXT, TREE, KB, NLP }

interface OutputItem {
	uri: vscode.Uri;
	input?: boolean; // an input file whose outputs are its children (#688)
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<OutputItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<OutputItem | undefined | null | void> = new vscode.EventEmitter<OutputItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<OutputItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(outputItem: OutputItem): vscode.TreeItem {
		if (outputItem.input) {
			const folder = outputView.folder?.fsPath ?? '';
			const rel = path.relative(folder, path.dirname(outputItem.uri.fsPath));
			return {
				label: path.basename(outputItem.uri.fsPath),
				description: rel && !rel.startsWith('..') ? rel : undefined,
				resourceUri: outputItem.uri,
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				contextValue: 'input',
				iconPath: {
					light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', 'file.svg')),
					dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', 'file.svg'))
				},
			};
		}
		const icon = visualText.fileIconFromExt(outputItem.uri.fsPath);

		const testFolder = visualText.analyzer.testFolder(outputItem.uri, true);
		const testFile = path.join(testFolder.fsPath, path.basename(outputItem.uri.fsPath));
		// 'nlp' marks pass files, which can be added to the sequence (#794).
		const value = (fs.existsSync(testFile) ? 'test' : '') + (/\.(nlp|pat)$/i.test(outputItem.uri.fsPath) ? 'nlp' : '');

		return {
			resourceUri: outputItem.uri,
			collapsibleState: void 0,
			contextValue: value,
			command: {
				command: 'outputView.openFile',
				arguments: [outputItem.uri],
				title: 'Open Output File'
			},

			iconPath: {
				light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', icon)),
				dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', icon))
			},
		};
	}

	public getChildren(outputItem?: OutputItem): OutputItem[] {
		if (outputItem?.input)
			return outputView.filesForLog(vscode.Uri.file(outputItem.uri.fsPath + visualText.LOG_SUFFIX)).map(uri => ({ uri }));
		if (visualText.hasWorkspaceFolder() && outputView.browsingFolder())
			return outputView.inputsWithOutput().map(uri => ({ uri, input: true }));
		if (visualText.hasWorkspaceFolder()) {
			const children: OutputItem[] = new Array();
			for (const folder of outputView.getOutputFiles()) {
				children.push({ uri: folder });
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
	private testDirectory: vscode.Uri;
	private type: outputFileType;

	constructor(ctx: vscode.ExtensionContext) {
		const outputViewProvider = new OutputTreeDataProvider();
		this.outputView = vscode.window.createTreeView('outputView', { treeDataProvider: outputViewProvider });
		ctx.subscriptions.push(this.outputView);
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.refreshAll', () => outputViewProvider.refresh()));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.showFolder', (folder?: vscode.Uri) => this.showFolder(folder)));

		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.copytoKB', (resource) => this.copytoKB(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.copytoText', (resource) => this.copytoText(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.deleteOutput', (resource) => this.deleteOutput(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.openFile', (resource) => this.openFile(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.addTest', (resource) => this.addTest(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.runTest', (resource) => this.runTest(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.deleteTest', (resource) => this.deleteTest(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.editTest', (resource) => this.editTest(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.rename', (resource) => this.rename(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.copyOrMoveTo', (resource) => this.copyOrMoveTo(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.addToSequence', (resource) => this.addToSequence(resource)));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.kb', () => this.loadKB()));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.matches', () => this.loadTxxt()));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.trees', () => this.loadTrees()));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.all', () => this.loadAll()));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.orphanPasses', () => this.loadOrphans()));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.deleteOrphans', () => this.deleteOrphans()));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.explore', () => this.explore()));
		ctx.subscriptions.push(vscode.commands.registerCommand('outputView.video', () => this.video()));

		this.outputFiles = [];
		this.logDirectory = vscode.Uri.file('');
		this.testDirectory = vscode.Uri.file('');
		this.type = outputFileType.ALL;
	}

	static attach(ctx: vscode.ExtensionContext) {
		if (!outputView) {
			outputView = new OutputView(ctx);
		}
		return outputView;
	}

	rename(outputItem: OutputItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(outputItem.uri.fsPath), prompt: 'Enter new name for file' }).then(newname => {
				if (newname) {
					const original = outputItem.uri;
					if (path.extname(newname).length == 0)
						newname = newname + path.extname(outputItem.uri.fsPath);
					const newfile = vscode.Uri.file(path.join(path.dirname(outputItem.uri.fsPath), newname));
					dirfuncs.rename(original.fsPath, newfile.fsPath);
					vscode.window.showTextDocument(newfile);

					const logFolderOrig = vscode.Uri.file(path.join(original.fsPath + visualText.LOG_SUFFIX));
					if (dirfuncs.isDir(logFolderOrig.fsPath)) {
						const logFolderNew = vscode.Uri.file(path.join(path.dirname(outputItem.uri.fsPath), newname + visualText.LOG_SUFFIX));
						dirfuncs.rename(logFolderOrig.fsPath, logFolderNew.fsPath);
					}
					vscode.commands.executeCommand('outputView.refreshAll');
				}
			});
		}
	}

	editTest(outputItem: OutputItem) {
		if (visualText.getWorkspaceFolder()) {
			visualText.editTestFiles(outputItem.uri, true);
		}
	}

	deleteTest(outputItem: OutputItem) {
		const items: vscode.QuickPickItem[] = [];
		items.push({ label: 'Yes', description: 'Delete all the test files associated with this test' });
		items.push({ label: 'No', description: 'Do not delete the test files' });

		vscode.window.showQuickPick(items, { title: 'Delete Test Files', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
			if (!selection || selection.label == 'No')
				return;
			const testFolder = visualText.analyzer.testFolder(outputItem.uri, true);
			visualText.fileOps.addFileOperation(testFolder, testFolder, [fileOpRefresh.TEXT, fileOpRefresh.OUTPUT], fileOperation.DELETE);
			visualText.fileOps.startFileOps();
		});
	}

	runTest(outputItem: OutputItem) {
		const logDir = path.dirname(outputItem.uri.fsPath);
		let textFile = path.basename(logDir);
		textFile = textFile.substring(0, textFile.length - visualText.LOG_SUFFIX.length);
		const textFilePath = path.join(path.dirname(logDir), textFile);
		if (fs.existsSync(textFilePath)) {
			visualText.testInit();
			dirfuncs.delFile(visualText.regressionTestFile());
			visualText.runTest(vscode.Uri.file(textFilePath));
			visualText.closeTest();
			vscode.window.showTextDocument(vscode.Uri.file(visualText.regressionTestFile()));
			vscode.commands.executeCommand('kbView.refreshAll');
		}
	}

	addTest(outputItem: OutputItem) {
		let hasTestFile = true;
		const testFolder = visualText.analyzer.testFolder(outputItem.uri, true);

		if (!fs.existsSync(testFolder.fsPath)) {
			this.testDirectory = testFolder;
			dirfuncs.makeDir(testFolder.fsPath);
			hasTestFile = false;
		}

		const testFilePath = vscode.Uri.file(path.join(testFolder.fsPath, path.basename(outputItem.uri.fsPath)));

		if (!hasTestFile || !fs.existsSync(outputItem.uri.fsPath)) {
			visualText.fileOps.addFileOperation(outputItem.uri, testFilePath, [fileOpRefresh.OUTPUT, fileOpRefresh.TEXT], fileOperation.COPY);
			visualText.fileOps.startFileOps();
		} else {
			const items: vscode.QuickPickItem[] = [];
			items.push({ label: 'Yes', description: 'Overwrite the current test file?' });
			items.push({ label: 'No', description: 'Do not overwrite' });

			vscode.window.showQuickPick(items, { title: 'Add Test File', placeHolder: 'Choose response' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(outputItem.uri, testFilePath, [fileOpRefresh.OUTPUT, fileOpRefresh.TEXT], fileOperation.COPY);
				visualText.fileOps.startFileOps();
			});
		}
	}

	video() {
		const url = 'http://vscodeoutviewer.visualtext.org';
		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
	}

	explore() {
		const dir = visualText.analyzer.getOutputDirectory();
		visualText.openFileManager(dir.fsPath);
	}

	deleteOrphans(): void {
		if (visualText.hasWorkspaceFolder()) {
			const files: vscode.Uri[] = [];
			const nlpFiles = dirfuncs.getFiles(visualText.analyzer.getSpecDirectory(), ['.pat', '.nlp', '.py']);
			for (const nlpFile of nlpFiles) {
				if (visualText.analyzer.seqFile.isOrphan(path.parse(nlpFile.fsPath).name) == true) {
					files.push(nlpFile);
				}
			}

			const count = files.length;

			const items: vscode.QuickPickItem[] = [];
			items.push({ label: 'Yes', description: 'Delete all orphan passes' });
			items.push({ label: 'No', description: 'Do not delete file' });

			vscode.window.showQuickPick(items, { title: 'Delete Orphan Files', placeHolder: 'Delete all ' + count.toString() + ' file(s)' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				for (const file of files) {
					visualText.fileOps.addFileOperation(file, file, [fileOpRefresh.OUTPUT], fileOperation.DELETE);
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

	public loadAll() {
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

	public fileHasLog(filepath: string): boolean {
		this.logDirectory = vscode.Uri.file('');
		if (filepath.length == 0)
			return false;
		this.logDirectory = vscode.Uri.file(filepath + visualText.LOG_SUFFIX);
		if (!fs.existsSync(this.logDirectory.fsPath))
			return false;
		const stats = fs.lstatSync(this.logDirectory.fsPath);
		if (!stats)
			return false;
		return stats.isDirectory();
	}

	public fileHasTest(filepath: string): boolean {
		this.testDirectory = vscode.Uri.file('');
		if (filepath.length == 0)
			return false;
		this.testDirectory = vscode.Uri.file(filepath + visualText.TEST_SUFFIX);
		if (!fs.existsSync(this.testDirectory.fsPath))
			return false;
		const stats = fs.lstatSync(this.testDirectory.fsPath);
		if (!stats)
			return false;
		return stats.isDirectory();
	}

	public getOutputFiles() {
		this.outputFiles = [];
		if (visualText.analyzer.hasText()) {
			if (this.type == outputFileType.KB) {
				this.outputFiles = dirfuncs.getFiles(visualText.analyzer.getAnalyzerDirectory('kb'), ['.kb']);
				const kbFiles = dirfuncs.getFiles(visualText.analyzer.getOutputDirectory(), ['.kbb']);
				this.outputFiles = this.outputFiles.concat(kbFiles);
			}
			else if (this.type == outputFileType.NLP) {
				// Include python passes (.py) alongside .nlp/.pat, and test orphan status
				// by the extension-stripped pass name so .py files are classified correctly.
				const nlpFiles = dirfuncs.getFiles(visualText.analyzer.getSpecDirectory(), ['.pat', '.nlp', '.py']);
				for (const nlpFile of nlpFiles) {
					if (visualText.analyzer.seqFile.isOrphan(path.parse(nlpFile.fsPath).name) == true) {
						this.outputFiles.push(nlpFile);
					}
				}
			}
			else {
				// ALL, TXXT and TREE list one input file's _log folder. Each mode
				// finds that folder itself: TXXT and TREE used to reuse the one ALL
				// had last set, and listed nothing if ALL had not run first.
				const textPath = visualText.analyzer.getTextPath().fsPath;
				if (textPath.length && this.fileHasLog(textPath))
					this.outputFiles = this.filesForLog(this.logDirectory);
			}
		}
		return this.outputFiles;
	}

	// The outputs in one input file's _log folder that the current mode shows.
	filesForLog(logDir: vscode.Uri): vscode.Uri[] {
		const files: vscode.Uri[] = [];
		const finalTree = vscode.Uri.file(path.join(logDir.fsPath, 'final.tree'));
		if (this.type == outputFileType.TXXT)
			return dirfuncs.getFiles(logDir, ['.txxt']);
		if (fs.existsSync(finalTree.fsPath))
			files.push(finalTree);
		if (this.type == outputFileType.TREE)
			return files.concat(dirfuncs.getFiles(logDir, ['.tree']).filter(f => f.fsPath !== finalTree.fsPath));
		for (const cand of dirfuncs.getFiles(logDir)) {
			const ext = path.parse(cand.fsPath).ext;
			if (ext.localeCompare('.tree') != 0 && ext.localeCompare('.txxt') != 0)
				files.push(cand);
		}
		return files;
	}

	// #688: with a folder selected in the Text view, the view lists every input
	// file under it that has outputs, each expanding to its own outputs.
	public folder: vscode.Uri | undefined;

	public showFolder(folder: vscode.Uri | undefined) {
		this.folder = folder;
		vscode.commands.executeCommand('outputView.refreshAll');
	}

	public browsingFolder(): boolean {
		return !!this.folder && this.type != outputFileType.KB && this.type != outputFileType.NLP;
	}

	// Input files under the selected folder that have a _log folder, depth first.
	inputsWithOutput(): vscode.Uri[] {
		const found: vscode.Uri[] = [];
		const walk = (dir: string) => {
			let entries: fs.Dirent[];
			try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
			for (const entry of entries) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					if (!dirfuncs.directoryIsLog(full)) walk(full);
				} else if (entry.isFile() && dirfuncs.isDir(full + visualText.LOG_SUFFIX)) {
					found.push(vscode.Uri.file(full));
				}
			}
		};
		if (this.folder) walk(this.folder.fsPath);
		return found;
	}

	private openFile(resource: vscode.Uri): void {
		const textFile = new TextFile(resource.fsPath);
		textFile.cleanZeroZero();
		visualText.colorizeAnalyzer();
		vscode.window.showTextDocument(resource);
	}

	private deleteOutput(resource: OutputItem): void {
		if (visualText.hasWorkspaceFolder()) {
			const items: vscode.QuickPickItem[] = [];
			let deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'', path.basename(resource.uri.fsPath), '\'');
			items.push({ label: 'Yes', description: deleteDescr });
			items.push({ label: 'No', description: 'Do not delete file' });

			vscode.window.showQuickPick(items, { title: 'Delete File', placeHolder: 'Select Yes or No?' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(resource.uri, resource.uri, [fileOpRefresh.OUTPUT], fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	// #658: put an output file anywhere, as a copy or by moving it.
	async copyOrMoveTo(outputItem: OutputItem) {
		const from = outputItem.uri;
		const target = await vscode.window.showSaveDialog({
			title: 'Copy or move output file to',
			defaultUri: vscode.Uri.file(path.join(visualText.analyzer.getInputDirectory().fsPath, path.basename(from.fsPath))),
		});
		if (!target || target.fsPath === from.fsPath)
			return;
		const how = await vscode.window.showQuickPick(['Copy', 'Move'], { title: path.basename(target.fsPath), placeHolder: 'Copy the file, or move it?' });
		if (!how)
			return;
		try {
			fs.mkdirSync(path.dirname(target.fsPath), { recursive: true });
			fs.copyFileSync(from.fsPath, target.fsPath);
			if (how === 'Move')
				fs.unlinkSync(from.fsPath);
		} catch (err) {
			vscode.window.showErrorMessage(`Could not ${how.toLowerCase()} ${path.basename(from.fsPath)}: ${err instanceof Error ? err.message : err}`);
			return;
		}
		vscode.commands.executeCommand('outputView.refreshAll');
		vscode.commands.executeCommand('textView.refreshAll');
		vscode.commands.executeCommand('kbView.refreshAll');
	}

	// #794: a pass file produced by a run (rule generation, a RUG pass) goes into
	// the sequence after the pass the user picks. If a pass of that name is
	// already in the sequence, they choose to replace it or add this one under a
	// free name.
	async addToSequence(outputItem: OutputItem) {
		const seqFile = visualText.analyzer.seqFile;
		const passes = seqFile.getPasses();
		if (!passes.length) {
			vscode.window.showWarningMessage('Open an analyzer first');
			return;
		}
		const items = passes.map((pass, index) => ({
			label: pass.passNum ? `${pass.passNum}  ${pass.name}` : pass.name,
			description: pass.isFolder() ? 'folder' : pass.typeStr,
			index,
		}));
		const after = await vscode.window.showQuickPick(items, { title: `Add ${path.basename(outputItem.uri.fsPath)} to the sequence`, placeHolder: 'Insert after which pass?' });
		if (!after)
			return;

		const specDir = visualText.analyzer.getSpecDirectory().fsPath;
		const name = path.basename(outputItem.uri.fsPath);
		const existing = seqFile.findPassByFilename(name);
		if (existing) {
			const replace = `Replace pass ${existing} (${path.parse(name).name})`;
			const choice = await vscode.window.showQuickPick([replace, 'Add it as a new pass under another name'], { title: `A pass named ${path.parse(name).name} is already in the sequence` });
			if (!choice)
				return;
			if (choice === replace) {
				// The pass keeps its place in the sequence; only its file changes.
				fs.copyFileSync(outputItem.uri.fsPath, path.join(specDir, name));
				vscode.commands.executeCommand('sequenceView.refreshAll');
				return;
			}
			const { name: base, ext } = path.parse(name);
			let n = 2;
			while (fs.existsSync(path.join(specDir, `${base}${n}${ext}`)) || seqFile.findPassByFilename(`${base}${n}${ext}`))
				n++;
			const renamed = path.join(specDir, `${base}${n}${ext}`);
			fs.copyFileSync(outputItem.uri.fsPath, renamed);
			seqFile.insertPass(after.index, vscode.Uri.file(renamed));
		} else {
			seqFile.insertPass(after.index, outputItem.uri);
		}
		vscode.commands.executeCommand('sequenceView.refreshAll');
	}

	copytoKB(outputItem: OutputItem) {
		const kbDir = visualText.analyzer.anaSubDirPath(anaSubDir.KB);
		this.copyFileToAnalyzer(outputItem.uri, kbDir, 'Copy file to another analyzer', 'Copy file to the KB directory of:');
	}

	copytoText(outputItem: OutputItem) {
		const out = visualText.analyzer.anaSubDirPath(anaSubDir.INPUT);
		this.copyFileToAnalyzer(outputItem.uri, out, 'Copy file to another analyzer', 'Copy file to input directory of:');
	}

	copyFileToAnalyzer(uri: vscode.Uri, subdir: string, title: string, placeHolder: string) {
		if (visualText.getWorkspaceFolder()) {
			const items: vscode.QuickPickItem[] = visualText.analyzerFolderList();

			vscode.window.showQuickPick(items, { title, canPickMany: false, placeHolder: placeHolder }).then(selection => {
				if (!selection || !selection.description)
					return;
				if (selection.description.startsWith('(FOLDER')) {
					vscode.window.showWarningMessage('You must select an analyzer directory not a folder');
					return;
				}
				const newFile = vscode.Uri.file(path.join(selection.description, subdir, path.basename(uri.fsPath)));
				visualText.fileOps.addFileOperation(uri, newFile, [fileOpRefresh.KB, fileOpRefresh.TEXT], fileOperation.COPY);
				visualText.fileOps.startFileOps();
			});
		}
	}
}
