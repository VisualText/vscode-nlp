import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { visualText } from './visualText';
import { TextFile } from './textFile';

interface LogItem {
	uri?: vscode.Uri | undefined;
	passNum: number;
	line: number;
	label: string;
	icon: string;
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
		vscode.commands.registerCommand('logView.addMessage', (message,uri) => this.addMessage(message,uri));
		vscode.commands.registerCommand('logView.conceptualGrammar', () => this.loadCGLog());
		vscode.commands.registerCommand('logView.timing', () => this.loadTimingLog());
		vscode.commands.registerCommand('logView.makeAna', () => this.loadMakeAna());
		vscode.commands.registerCommand('logView.clear', () => this.clearLogs());
		vscode.commands.registerCommand('logView.stopFileOps', () => this.stopFileOps());
		vscode.commands.registerCommand('logView.exploreEngineDir', () => this.exploreEngineDir());
		vscode.commands.registerCommand('logView.downloadHelp', () => this.downloadHelp());

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

    createPanel(): vscode.WebviewPanel {
        return vscode.window.createWebviewPanel(
            'logView',
            'Download Help',
            {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false
            }
        );
    }

	downloadHelp() {
		this.panel = this.createPanel();
		this.panel.onDidDispose(
			() => {
				this.exists = false;
			},
			null,
			this.ctx.subscriptions
		);
		this.exists = true;

		if (this.panel) {
			let htmlFile = path.join(visualText.extensionDirectory().fsPath,'DOWNLOADHELP.html');
			if (fs.existsSync(htmlFile)) {
				this.panel.webview.html = fs.readFileSync(htmlFile, 'utf8');
			}

		}
	}

	private loadTimingLog() {
		this.clearLogs();
		var cgFile = vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,'dbg.log'));
		this.addLogFile(cgFile);
	}

	private loadCGLog() {
		this.clearLogs();
		this.addLogFile(visualText.analyzer.treeFile('cgerr'));
	}
	
	public loadMakeAna() {
		this.clearLogs();
		var errorLog = vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,'err.log'));
		this.addLogFile(errorLog);
		this.addLogFile(visualText.analyzer.treeFile('make_ana'));
	}

	public clearLogs() {
		this.logs = [];
		vscode.commands.executeCommand('logView.refreshAll');			
	}

	public addMessage(message: string, uri: vscode.Uri | undefined) {
		this.logs.push(this.messageLine(message, uri));
	}

	public addLogFile(logFileName: vscode.Uri) {
		if (fs.existsSync(logFileName.fsPath)) {
			const logFile = new TextFile(logFileName.fsPath);
			for (let line of logFile.getLines()) {
				line = line.substring(0,line.length);
				if (line.length) {
					let log = this.parseLogLine(line);
					this.logs.push(log);						
				}
			}
		}		
	}

	public getLogs(): LogItem[] {
		return this.logs;
	}

	private messageLine(label: string, uri: vscode.Uri | undefined): LogItem {
		return ({label: label, uri: uri, passNum: 0, line: 0, icon: 'arrow-small-right.svg'});	
	}

	private parseLogLine(line: string): LogItem {
		var uri = vscode.Uri.file('');
		var passNum = 0;
		var lineNum = -1;
		var icon = 'arrow-small-right.svg';

		if (line.length) {
			let tokens = line.split(/[\t\s]/,2);  
			if (tokens.length >= 2) {
				var seqFile = visualText.analyzer.seqFile;
				passNum = +tokens[0];
				if (passNum) {
					uri = seqFile.getUriByPassNumber(passNum);
					icon = 'gear.svg';
				}
				lineNum = +tokens[1];
			}
		}

		return ({label: line, uri: uri, passNum: passNum, line: lineNum, icon: icon});
	}

	private openFile(logItem: LogItem): void {
		if (logItem.passNum && logItem.uri) {
			var seqFile = visualText.analyzer.seqFile;
			visualText.colorizeAnalyzer();
			vscode.window.showTextDocument(logItem.uri).then(editor => 
				{
					var pos = new vscode.Position(logItem.line-1,0);
					editor.selections = [new vscode.Selection(pos,pos)]; 
					var range = new vscode.Range(pos, pos);
					editor.revealRange(range);
				});
		} else if (logItem.uri) {
			visualText.colorizeAnalyzer();
			vscode.window.showTextDocument(logItem.uri);
		} else {
			let line = logItem.label;
			if (line.startsWith('FAILED download')) {
				visualText.failedWarning();
			} else if (line.startsWith('Jason file error:')) {
				let pos = line.indexOf('.json');
				let filepath = line.substring(18,pos+5);
				let msg = 'Json error(s) in file: ' + filepath;
				vscode.window.showErrorMessage(msg, "Click to edit file").then(response => {
					vscode.window.showTextDocument(vscode.Uri.file(filepath));
				});
			}
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