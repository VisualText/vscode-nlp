"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFile = exports.findFiles = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const textFile_1 = require("./textFile");
const dirfuncs_1 = require("./dirfuncs");
const visualText_1 = require("./visualText");
class FindFile {
    constructor() {
        this.textFile = new textFile_1.TextFile();
        this.finds = [];
        this.dirPath = '';
    }
    getMatches() {
        return this.finds;
    }
    searchSequenceFiles(searchTerm, topFlag) {
        this.finds = [];
        const fileUris = visualText_1.visualText.analyzer.seqFile.getPassFileUris(topFlag);
        const context = 60;
        const escaped = this.escapeRegExp(searchTerm);
        for (const uri of fileUris) {
            this.searchFile(uri, searchTerm, escaped, context, false);
        }
        return false;
    }
    searchFiles(dir, searchTerm, extensions = [], level = 0, functionFlag = false, bracketsFlag = true) {
        if (level == 0)
            this.finds = [];
        const files = dirfuncs_1.dirfuncs.getFiles(dir);
        const context = 60;
        const escaped = this.escapeRegExp(searchTerm);
        for (const file of files) {
            if ((!functionFlag && dirfuncs_1.dirfuncs.directoryIsLog(file.fsPath)) || (functionFlag && file.fsPath.toLowerCase().indexOf('func') < 0))
                continue;
            if (extensions.length) {
                let found = false;
                for (const extension of extensions) {
                    if (file.fsPath.endsWith(extension)) {
                        found = true;
                        break;
                    }
                }
                if (!found)
                    continue;
            }
            const filename = path.basename(file.fsPath);
            const uri = vscode.Uri.file(path.join(dir.fsPath, filename));
            this.searchFile(uri, searchTerm, escaped, context, bracketsFlag);
        }
        const dirs = dirfuncs_1.dirfuncs.getDirectories(dir);
        for (const dir of dirs) {
            if (!dirfuncs_1.dirfuncs.directoryIsLog(dir.fsPath))
                this.searchFiles(dir, searchTerm, extensions, level + 1);
        }
        return this.finds.length ? true : false;
    }
    searchFile(uri, searchTerm, escaped, context, bracketsFlag = true) {
        if (dirfuncs_1.dirfuncs.isDir(uri.fsPath))
            return;
        this.textFile.setFile(uri);
        const filename = path.basename(uri.fsPath);
        const escapedLower = escaped.toLowerCase();
        if (this.textFile.getText().toLowerCase().search(escapedLower) >= 0) {
            let num = 0;
            for (let line of this.textFile.getLines()) {
                const lineLower = line.toLowerCase();
                const pos = lineLower.search(escapedLower);
                if (pos >= 0) {
                    if (line.length + escapedLower.length > context) {
                        const half = context / 2;
                        if (line.length - pos < half) {
                            line = line.substring(line.length - context - 1, context);
                        }
                        else if (pos > half) {
                            line = line.substring(pos - half, context + escapedLower.length);
                        }
                        else {
                            line = line.substring(0, context);
                        }
                    }
                    let text = line;
                    if (bracketsFlag)
                        text = line.replace(searchTerm, ` <<${searchTerm}>> `);
                    const label = `${filename} [${num} ${pos}] ${line}`;
                    this.finds.push({ uri: uri, label: label, line: line, lineNum: num, pos: Number.parseInt(pos), highlighted: text });
                }
                num++;
            }
        }
    }
    escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
exports.FindFile = FindFile;
//# sourceMappingURL=findFile.js.map