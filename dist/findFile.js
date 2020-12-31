"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFile = exports.findFiles = void 0;
const vscode = require("vscode");
const path = require("path");
const textFile_1 = require("./textFile");
const dirfuncs_1 = require("./dirfuncs");
class FindFile {
    constructor() {
        this.textFile = new textFile_1.TextFile();
        this.finds = [];
        this.dirPath = '';
    }
    getMatches() {
        return this.finds;
    }
    searchFiles(dir, searchTerm, endswith = '', level = 0) {
        if (level == 0)
            this.finds = [];
        const files = dirfuncs_1.dirfuncs.getFiles(dir);
        var context = 60;
        var escaped = this.escapeRegExp(searchTerm);
        for (let file of files) {
            if (endswith.length && !file.path.endsWith(endswith))
                continue;
            this.textFile.setFile(file);
            if (this.textFile.getText().search(escaped) >= 0) {
                let num = 0;
                for (let line of this.textFile.getLines()) {
                    var pos = line.search(escaped);
                    if (pos >= 0) {
                        var filename = path.basename(file.path);
                        var uri = vscode.Uri.file(path.join(dir.path, filename));
                        if (line.length + escaped.length > context) {
                            let half = context / 2;
                            if (line.length - pos < half) {
                                line = line.substr(line.length - context - 1, context);
                            }
                            else if (pos > half) {
                                line = line.substr(pos - half, context + escaped.length);
                            }
                            else {
                                line = line.substr(0, context);
                            }
                        }
                        line = line.replace(searchTerm, ` <<${searchTerm}>> `);
                        var label = `${filename} [${num} ${pos}] ${line}`;
                        this.finds.push({ uri: uri, label: label, line: num, pos: Number.parseInt(pos), text: line });
                    }
                    num++;
                }
            }
        }
        const dirs = dirfuncs_1.dirfuncs.getDirectories(dir);
        for (let dir of dirs) {
            this.searchFiles(dir, searchTerm, endswith, level + 1);
        }
        return this.finds.length ? true : false;
    }
    escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
exports.FindFile = FindFile;
//# sourceMappingURL=findFile.js.map