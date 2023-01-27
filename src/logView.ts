import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { visualText } from './visualText';
import { TextFile } from './textFile';
import { dirfuncs } from './dirfuncs';

export enum logLineType { INFO, UPDATER, FILE_OP, ANALYER_OUTPUT, LOGFILE, SEQUENCE, SYNTAX_ERROR, DOWNLOAD_ERROR, OPEN_PATH, UPDATER_TIMEOUT, JSON_ERROR }

interface LogItem {
	uri?: vscode.Uri | undefined;
	passNum: number;
	line: number;
	label: string;
	icon: string;
	type: logLineType;
}

export class OutputTreeDataProvider implements vscode.TreeDataProvider<LogItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<LogItem | undefined | null | void> = new vscode.EventEmitter<LogItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<LogItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	public getTreeItem(logItem: LogItem): vscode.TreeItem {
		return {
			label: logItem.label,
			resourceUri: logItem.uri,
			collapsibleState: void 0,
			command: {
				command: 'logView.openFile',
				arguments: [logItem],
				title: 'Open File with Error'
			},
			iconPath: {
				light: path.join(__filename, '..', '..', 'resources', 'dark', logItem.icon),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', logItem.icon)
			}
		};
	}

	public getChildren(element?: LogItem): LogItem[] {
        if (visualText.hasWorkspaceFolder()) {
            return logView.getLogs();
		}
		return [];
	}
}

export let logView: LogView;
export class LogView {

	panel: vscode.WebviewPanel | undefined;
	exists: boolean;
	ctx: vscode.ExtensionContext;

	public logView: vscode.TreeView<LogItem>;
	private logs: LogItem[] = new Array();

	constructor(context: vscode.ExtensionContext) {
		const logViewProvider = new OutputTreeDataProvider();
		this.logView = vscode.window.createTreeView('logView', { treeDataProvider: logViewProvider });
		vscode.commands.registerCommand('logView.refreshAll', () => logViewProvider.refresh());
		vscode.commands.registerCommand('logView.openFile', (resource) => this.openFile(resource));
		vscode.commands.registerCommand('logView.addMessage', (message,type,uri) => this.addMessage(message,type,uri));
		vscode.commands.registerCommand('logView.conceptualGrammar', () => this.loadCGLog());
		vscode.commands.registerCommand('logView.timing', () => this.loadTimingLog());
		vscode.commands.registerCommand('logView.makeAna', () => this.loadMakeAna());
		vscode.commands.registerCommand('logView.clear', () => this.clearLogs());
		vscode.commands.registerCommand('logView.stopFileOps', () => this.stopFileOps());
		vscode.commands.registerCommand('logView.stopUpdater', () => this.stopUpdater());
		vscode.commands.registerCommand('logView.exploreEngineDir', () => this.exploreEngineDir());
		vscode.commands.registerCommand('logView.downloadHelp', () => this.downloadHelp());
		vscode.commands.registerCommand('logView.updaterHelp', () => this.updaterHelp());
		vscode.commands.registerCommand('logView.checkUpdates', () => this.checkUpdates());
		vscode.commands.registerCommand('logView.updateDebug', () => this.updateDebug());
		vscode.commands.registerCommand('logView.analyzerOuts', () => this.loadAnalyzerOuts());

		this.exists = false;
		this.ctx = context;
        this.panel = undefined;
    }

    static attach(ctx: vscode.ExtensionContext) {
        if (!logView) {
            logView = new LogView(ctx);
        }
        return logView;
	}

	updateDebug() {
		let items: vscode.QuickPickItem[] = [];
		let arfirm = 'Turn ON update debugging';
        items.push({label: arfirm, description: 'display extra details of updating for debugging purposes'});
        items.push({label: 'Turn OFF update debugging', description: 'do not display debugging info for updating'});
        vscode.window.showQuickPick(items, {title: 'Debugging Output', canPickMany: false, placeHolder: 'Choose ON or Off'}).then(selection => {
            if (!selection) {
                return;
            }
            visualText.debug = selection.label === arfirm ? true : false;
        });	
	}

	stopUpdater() {
		visualText.stopUpdater();
	}

	checkUpdates() {
		visualText.startUpdater(false);
	}

	downloadHelp() {
		visualText.displayHTMLFile('Download Help','DOWNLOADHELP.html');
	}

	updaterHelp() {
		visualText.displayHTMLFile('Updater Help','UPDATERHELP.html');
	}

	public loadAnalyzerOuts() {
		this.clearLogs();
		let outputDir = path.join(visualText.getCurrentAnalyzer().fsPath,"output");
		let outFile = vscode.Uri.file(path.join(outputDir,'stdout.log'));
		let errFile = vscode.Uri.file(path.join(outputDir,'stderr.log'));
		this.addMessage('STD OUT FILE: ' + errFile.fsPath, logLineType.ANALYER_OUTPUT, errFile);
		this.addLogFile(outFile, logLineType.ANALYER_OUTPUT,'   ');
		this.addMessage('ERROR FILE: ' + errFile.fsPath, logLineType.ANALYER_OUTPUT, errFile);
		this.addLogFile(errFile, logLineType.ANALYER_OUTPUT,'   ');
	}

	private loadTimingLog() {
		this.clearLogs();
		var cgFile = vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,'dbg.log'));
		this.addLogFile(cgFile,logLineType.LOGFILE);
	}

	private loadCGLog() {
		this.clearLogs();
		this.addLogFile(visualText.analyzer.treeFile('cgerr'),logLineType.LOGFILE);
	}
	
	public loadMakeAna() {
		this.clearLogs();
		var errorLog = vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,'err.log'));
		this.addLogFile(errorLog,logLineType.LOGFILE);
		this.addLogFile(visualText.analyzer.treeFile('make_ana'),logLineType.LOGFILE);
	}

	public syntaxErrors(): boolean {
		var errorLog = vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,'err.log'));
		const logFile = new TextFile(errorLog.fsPath);
		for (let line of logFile.getLines()) {
			let parse = this.parseLogLine(line,logLineType.INFO,undefined);
			if (parse.type == logLineType.SYNTAX_ERROR)
				return true;
		}
		return false;
	}

	public clearLogs() {
		this.logs = [];
		vscode.commands.executeCommand('logView.refreshAll');			
	}

	public addMessage(message: string, type: logLineType = logLineType.INFO, uri: vscode.Uri | undefined) {
		this.logs.push(this.parseLogLine(message, type, uri));
	}

	public addLogFile(logFileName: vscode.Uri, type: logLineType, spaces: string='') {
		if (fs.existsSync(logFileName.fsPath)) {
			const logFile = new TextFile(logFileName.fsPath);
			for (let line of logFile.getLines()) {
				line = line.substring(0,line.length);
				if (line.length)
					this.logs.push(this.parseLogLine(spaces+line,type,undefined));
			}
		}		
	}

	public getLogs(): LogItem[] {
		return this.logs;
	}

	private parseLogLine(line: string, type: logLineType, uri: vscode.Uri | undefined): LogItem {
		var passNum = 0;
		var lineNum = -1;
		var icon = this.typeIcon(type);
		var firstTwoNumbers = false;
		if (uri)
			type = logLineType.OPEN_PATH;

		var lineTrimmed = line.trim();
		if (lineTrimmed.startsWith('[') && lineTrimmed.endsWith(']')) {
			line = line.replace('[','');
			line = line.replace(']','');
		}

		let tokens = line.split(/[\t\s]/,2);  
		if (tokens.length >= 2) {
			passNum = +tokens[0];
			lineNum = +tokens[1];
			if (!isNaN(passNum) && !isNaN(lineNum) && lineNum > 0) {
				firstTwoNumbers = true;
			}
		}

		if (line.length) {
			if (firstTwoNumbers) {
				if (visualText.analyzer.isLoaded()) {
					var seqFile = visualText.analyzer.seqFile;
					uri = seqFile.getUriByPassNumber(passNum);
					type = logLineType.SYNTAX_ERROR;
					icon = this.typeIcon(logLineType.SYNTAX_ERROR);
				}
			} else if (line.startsWith('FAILED download')) {
				type = logLineType.DOWNLOAD_ERROR;
			} else if (line.startsWith('Jason file error:')) {
				type = logLineType.JSON_ERROR;
			} else if (line.startsWith('Updater timed out')) {
				type = logLineType.UPDATER_TIMEOUT;
			}
		}

		if (!uri) {
			let i = line.lastIndexOf(' ');
			if (i >= 0) {
				let pather = line.substring(i+1,line.length);
				if (fs.existsSync(pather)) {
					type = logLineType.OPEN_PATH;
					uri = vscode.Uri.file(pather);
				}
			}
		}
		// if (uri) {
		// 	icon = 'right-blue.svg'; 
		// }
		return ({label: line, uri: uri, passNum: passNum, line: lineNum, icon: icon, type: type});
	}

	// INFO, UPDATER, FILE_OP, ANALYER_OUTPUT, LOGFILE, SEQUENCE, SYNTAX_ERROR, DOWNLOAD_ERROR, OPEN_PATH, UPDATER_TIMEOUT, JSON_ERROR
	private typeIcon(type: logLineType) {
		var icon = 'dot.svg';
		switch (type) {
			case logLineType.UPDATER:
				icon = 'update.svg';
				break;
			case logLineType.ANALYER_OUTPUT:
				icon = 'gear.svg';
				break;
			case logLineType.SEQUENCE:
				icon = 'dna.svg';
				break;
			case logLineType.LOGFILE:
				icon = 'log.svg';
				break;
			case logLineType.FILE_OP:
				icon = 'file.svg';
				break;
			case logLineType.JSON_ERROR:
			case logLineType.SYNTAX_ERROR:
			case logLineType.DOWNLOAD_ERROR:
				icon = 'error.svg';
				break;
		}
		return icon;
	}

	private openFile(logItem: LogItem): void {
		let line = logItem.label;
		visualText.colorizeAnalyzer();

		switch (logItem.type) {
			case logLineType.SYNTAX_ERROR: 
				var seqFile = visualText.analyzer.seqFile;
				if (logItem.uri) {
					vscode.window.showTextDocument(logItem.uri).then(editor => 
						{
							var pos = new vscode.Position(logItem.line-1,0);
							editor.selections = [new vscode.Selection(pos,pos)]; 
							var range = new vscode.Range(pos, pos);
							editor.revealRange(range);
						});
				}
				break;

			case logLineType.UPDATER_TIMEOUT:
				this.updaterHelp();
				break;

			case logLineType.DOWNLOAD_ERROR:
				this.downloadHelp();
				break;

			case logLineType.OPEN_PATH:
				if (logItem.uri) {
					if (dirfuncs.isDir(logItem.uri.fsPath)) {
						visualText.openFileManager(logItem.uri.fsPath);
					} else if (fs.existsSync(logItem.uri.fsPath)) {
						vscode.window.showTextDocument(logItem.uri);
					}
				}
				break;

			case logLineType.JSON_ERROR:
				let pos = line.indexOf('.json');
				let filepath = line.substring(18,pos+5);
				let msg = 'Json error(s) in file: ' + filepath;
				vscode.window.showErrorMessage(msg, "Click to fix file").then(response => {
					vscode.window.showTextDocument(vscode.Uri.file(filepath));
				});
				break;
		}
	}

	public updateTitle(message: string): void {
		if (message.length)
			this.logView.title = `LOGGING (${message})`;
		else
			this.logView.title = 'LOGGING';
	}

	private stopFileOps(): void {
		visualText.stopFileOps();
	}

	exploreEngineDir() {
		let dir = visualText.engineDirectory();
		visualText.openFileManager(dir.fsPath);
	}
}