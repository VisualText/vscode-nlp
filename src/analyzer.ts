import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SequenceFile } from './sequence';
import { visualText } from './visualText';
import { JsonState } from './jsonState';
import { dirfuncs } from './dirfuncs';
import { AsyncResource } from 'async_hooks';

export let analyzer: Analyzer;
export class Analyzer {

    public seqFile = new SequenceFile();
    private jsonState = new JsonState();
    private analyzerDir: vscode.Uri = vscode.Uri.file('');
    private specDir: vscode.Uri = vscode.Uri.file('');
    private inputDir: vscode.Uri = vscode.Uri.file('');
    private outputDir: vscode.Uri = vscode.Uri.file('');
    private logDir: vscode.Uri = vscode.Uri.file('');
    private currentTextFile: vscode.Uri = vscode.Uri.file('');
    private currentPassFile: vscode.Uri = vscode.Uri.file('');

	constructor() {
    }

	readState() {
        if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
            var parse = this.jsonState.json.visualText[0];
            if (parse.currentTextFile) {
                var currentFile = parse.currentTextFile;
                if (fs.existsSync(currentFile))
                    this.currentTextFile = vscode.Uri.file(currentFile);
                else
                    this.currentTextFile = vscode.Uri.file(path.join(this.getInputDirectory().path,currentFile));

                if (parse.currentPassFile) {
                    currentFile = parse.currentPassFile;
                    if (fs.existsSync(currentFile))
                        this.currentPassFile = vscode.Uri.file(currentFile);
                    else
                        this.currentPassFile = vscode.Uri.file(path.join(this.getSpecDirectory().path,currentFile));                    
                }

                vscode.commands.executeCommand('status.update');
                this.outputDirectory();               
            }
        }
    }

    hasText(): boolean {
        return this.currentTextFile.path.length ? true : false;
    }

    newAnalyzer(): string {
        if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'newanalyzer', prompt: 'Enter new analyzer name' }).then(newname => {
				if (newname) {
                    this.createNewAnalyzer(newname);
                    return newname;
				}
			});
        }
        return '';
    }

    zeroAnalyzer() {
        this.analyzerDir = vscode.Uri.file('');
        this.specDir = vscode.Uri.file('');
        this. inputDir = vscode.Uri.file('');
        this.outputDir = vscode.Uri.file('');
        this.currentTextFile = vscode.Uri.file('');
    }

    createNewAnalyzer(analyzerName: string): boolean {
        visualText.readState();
        this.analyzerDir = vscode.Uri.file(path.join(visualText.getWorkspaceFolder().path,analyzerName));
        if (fs.existsSync(this.analyzerDir.path)) {
            vscode.window.showWarningMessage('Analyzer folder already exists');
            return false;
        } else if (!visualText.visualTextDirectoryExists()) {
            vscode.window.showWarningMessage('NLP Engine not set. Set in state.json in main directory.');
            return false;
        } else {
            var fromDir = path.join(visualText.getVisualTextDirectory('analyzer'));
            if (!dirfuncs.makeDir(this.analyzerDir.path)) {
                vscode.window.showWarningMessage(`Could not make directory: ${fromDir}`);
                return false;
            }
            if (!dirfuncs.copyDirectory(fromDir,this.analyzerDir.path)) {
                vscode.window.showWarningMessage('Copy directory for new analyzer failed');
                return false;
            }
            this.load(this.analyzerDir);
            vscode.commands.executeCommand('textView.refreshAll');
            vscode.commands.executeCommand('outputView.refreshAll');
            vscode.commands.executeCommand('sequenceView.refreshAll');
            vscode.commands.executeCommand('analyzerView.refreshAll');
            return true; 
        }
    }

    createAnaSequenceFile(content: string=''): boolean {
        var cont = content.length ? content : '#\ntokenize	nil	# Gen:   Convert input to token list.';
        if (this.getSpecDirectory()) {
            var anaFile = path.join(this.getSpecDirectory().path,'analyzer.seq');
            return dirfuncs.writeFile(anaFile,cont);
        }
        return false;
    }

    saveStateFile() {
        if (this.currentPassFile.path.length == 0 || this.currentTextFile.path.length == 0) {
            if (this.jsonState.jsonParse(this.analyzerDir,'state','visualText')) {
                var parse = this.jsonState.json.visualText[0];
                if (parse.currentTextFile && this.currentPassFile.path.length == 0) {
                    var currentFile = parse.currentTextFile;
                    if (fs.existsSync(currentFile))
                        this.currentTextFile = vscode.Uri.file(currentFile);
                    else
                        this.currentTextFile = vscode.Uri.file(path.join(this.getInputDirectory().path,currentFile));           
                }
                if (parse.currentPassFile && this.currentPassFile.path.length == 0) {
                    var currentFile = parse.currentPassFile;
                    if (fs.existsSync(currentFile))
                        this.currentPassFile = vscode.Uri.file(currentFile);
                    else
                        this.currentPassFile = vscode.Uri.file(path.join(this.getSpecDirectory().path,currentFile));           
                }
            }            
        }

        var stateJsonDefault: any = {
            "visualText": [
                {
                    "name": "Analyzer",
                    "type": "state",
                    "currentTextFile": this.currentTextFile.path,
                    "currentPassFile": this.currentPassFile.path
                }
            ]
        }
        this.jsonState.saveFile(this.analyzerDir.path, 'state', stateJsonDefault);  
        this.outputDirectory();
    }

    saveCurrentFile(currentFile: vscode.Uri) {
        this.currentTextFile = currentFile;
        this.saveStateFile();
    }

    saveCurrentPass(passFile: vscode.Uri) {
        this.currentPassFile = passFile;
        this.saveStateFile();
    }

    load(analyzerDir: vscode.Uri) {
        this.setWorkingDir(analyzerDir);
        this.readState();
        vscode.commands.executeCommand('analyzerView.updateTitle',analyzerDir);
        if (this.currentTextFile.path.length)
            vscode.commands.executeCommand('textView.updateTitle',vscode.Uri.file(this.currentTextFile.path));
    }

    outputDirectory() {
        if (this.currentTextFile.path.length) {
            this.outputDir = vscode.Uri.file(this.currentTextFile.path + '_log');
        } else {
            this.outputDir = vscode.Uri.file(path.join(this.analyzerDir.path,'output'));
        }
    }

    clearOutputDirectory() {
        if (fs.lstatSync(this.outputDir.path).isDirectory()) {
            fs.readdir(this.outputDir.path, (err, files) => {
                if (err) throw err;
            
                for (const file of files) {
                    fs.unlink(path.join(this.outputDir.path, file), err => {
                        if (err) throw err;
                    });
                }
            });            
        }
    }

    logFile(name: string): vscode.Uri {
        if (this.logDir.path.length) {
            var pather = path.join(this.logDir.path,name);
            pather = pather.concat('.log');
            return vscode.Uri.file(pather);        
        }
        return vscode.Uri.file('');
    }

    getInputDirectory(): vscode.Uri {
        return this.inputDir;
    }

    getSpecDirectory(): vscode.Uri {
		return this.specDir;
	}

    getOutputDirectory(): vscode.Uri {
        return this.outputDir;
    }
    
    getLogDirectory(): vscode.Uri {
        return this.logDir;
    }

    getTextPath(): vscode.Uri {
        return this.currentTextFile;
    }

    getPassPath(): vscode.Uri {
        return this.currentPassFile;
    }

	setWorkingDir(directory: vscode.Uri) {
		this.analyzerDir = directory;
        this.specDir = vscode.Uri.file(path.join(directory.path,'spec'));
        this.inputDir = vscode.Uri.file(path.join(directory.path,'input'));
        this.logDir = vscode.Uri.file(path.join(directory.path,'logs'));
	}
}