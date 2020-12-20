"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceFile = exports.PassItem = exports.moveDirection = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const textFile_1 = require("./textFile");
const visualText_1 = require("./visualText");
const dirfuncs_1 = require("./dirfuncs");
const logfile_1 = require("./logfile");
var moveDirection;
(function (moveDirection) {
    moveDirection[moveDirection["UP"] = 0] = "UP";
    moveDirection[moveDirection["DOWN"] = 1] = "DOWN";
})(moveDirection = exports.moveDirection || (exports.moveDirection = {}));
class PassItem {
    constructor() {
        this.uri = vscode.Uri.file('');
        this.text = '';
        this.name = '';
        this.comment = '';
        this.passNum = 0;
        this.order = 0;
        this.typeStr = '';
        this.inFolder = false;
        this.empty = true;
    }
    isRuleFile() {
        return this.typeStr.localeCompare('pat') == 0 || this.typeStr.localeCompare('rec') == 0;
    }
    isFolder() {
        return this.typeStr.localeCompare('folder') == 0;
    }
    isStub() {
        return this.typeStr.localeCompare('stub') == 0;
    }
    isEnd(name) {
        return this.typeStr.localeCompare('end') == 0 && this.name.localeCompare(name) == 0;
    }
    fileExists() {
        return fs.existsSync(this.uri.path) ? true : false;
    }
    exists() {
        return this.empty ? false : true;
    }
    isEmpty() {
        return this.empty;
    }
    clear() {
        this.uri = vscode.Uri.file('');
        this.text = '';
        this.name = '';
        this.comment = '';
        this.passNum = 0;
        this.order = 0;
        this.typeStr = '';
        this.inFolder = false;
        this.empty = true;
    }
}
exports.PassItem = PassItem;
class SequenceFile extends textFile_1.TextFile {
    constructor() {
        super();
        this.specDir = vscode.Uri.file('');
        this.seqFileName = 'analyzer.seq';
        this.passItems = new Array();
        this.cleanpasses = new Array();
        this.newcontent = '';
    }
    init() {
        if (visualText_1.visualText.analyzer.isLoaded()) {
            this.specDir = visualText_1.visualText.analyzer.getSpecDirectory();
            super.setFile(vscode.Uri.file(path.join(this.specDir.path, this.seqFileName)), true);
            let passNum = 1;
            this.passItems = [];
            var folder = '';
            var order = 0;
            for (let passStr of this.getLines()) {
                var passItem = this.setPass(passStr, passNum);
                if (passItem.typeStr == 'folder' || passItem.typeStr == 'stub') {
                    folder = passItem.name;
                }
                else if (folder.length) {
                    if (passItem.typeStr == 'end' && passItem.name.localeCompare(folder) == 0) {
                        folder = '';
                    }
                    else {
                        passItem.inFolder = true;
                        passNum++;
                    }
                }
                else if (passItem.exists())
                    passNum++;
                if (passItem.text.length) {
                    passItem.order = order++;
                    this.passItems.push(passItem);
                }
            }
        }
    }
    isOrphan(nlpFileName) {
        for (let passItem of this.passItems) {
            if (passItem.name.localeCompare(nlpFileName) == 0)
                return false;
        }
        return true;
    }
    setPass(passStr, passNum) {
        const passItem = new PassItem();
        var tokens = passStr.split(/[\t\s]/);
        if (tokens.length >= 3) {
            passItem.text = passStr;
            passItem.passNum = passNum;
            if (tokens[0].localeCompare('#') == 0) {
                passItem.comment = this.tokenStr(tokens, 2);
                passItem.typeStr = '#';
            }
            else {
                passItem.typeStr = tokens[0];
                passItem.name = tokens[1];
                if (tokens[0].localeCompare('pat') == 0 || tokens[0].localeCompare('rec') == 0) {
                    passItem.uri = vscode.Uri.file(path.join(this.specDir.path, this.passFileName(passItem.name)));
                }
                passItem.comment = this.tokenStr(tokens, 2);
            }
            passItem.empty = false;
        }
        return passItem;
    }
    tokenStr(tokens, start) {
        var tokenStr = '';
        let i = 0;
        let end = tokens.length;
        for (i = start; i < end; i++) {
            var tok = tokens[i];
            if (tokenStr.length)
                tokenStr = tokenStr + ' ';
            tokenStr = tokenStr + tok;
        }
        return tokenStr;
    }
    passString(passItem) {
        return passItem.typeStr + '\t' + passItem.name + '\t' + passItem.comment;
    }
    base(passname) {
        var basename = path.basename(passname, '.pat');
        basename = path.basename(basename, '.nlp');
        return basename;
    }
    getPassByNumber(passNumber) {
        for (let passItem of this.passItems) {
            if (passItem.passNum == passNumber)
                return passItem;
        }
        return new PassItem();
    }
    getUriByPassNumber(passNumber) {
        var passItem = this.getPassByNumber(passNumber);
        if (!passItem.isEmpty())
            return passItem.uri;
        return vscode.Uri.file('');
    }
    passCount() {
        return this.passItems.length;
    }
    atBottom(passItem) {
        let passes = this.getFolderPasses(passItem.typeStr, passItem.name, true);
        return passes.length + passItem.order == this.passCount();
    }
    insertFolder(passafter) {
        if (passafter.path.length > 1) {
            this.saveFile();
        }
    }
    cleanPasses() {
        this.cleanpasses = [];
        let passNum = 1;
        for (let passItem of this.passItems) {
            this.cleanpasses.push(this.passString(passItem));
        }
    }
    renamePass(seqItem, newPassName) {
        if (this.passItems.length) {
            var passItem = this.passItems[seqItem.passNum - 1];
            if (seqItem.type.localeCompare('folder') == 0) {
                var passes = this.getFolderPasses(seqItem.type, seqItem.name, true);
                passes[passes.length - 1].name = newPassName;
            }
            passItem.name = newPassName;
            this.saveFile();
        }
    }
    insertPass(seqItem, newpass) {
        if (this.passItems.length) {
            var row = seqItem.passNum;
            if (row >= 0) {
                var passes = new Array();
                passes.push(newpass);
                var copy = false;
                var specDir = visualText_1.visualText.analyzer.getSpecDirectory().path;
                if (specDir.localeCompare(path.dirname(newpass.path))) {
                    if (dirfuncs_1.dirfuncs.isDir(newpass.path)) {
                        passes = [];
                        passes = dirfuncs_1.dirfuncs.getFiles(newpass);
                    }
                    copy = true;
                }
                for (let pass of passes) {
                    if (copy) {
                        var herepass = path.join(specDir, path.basename(pass.path));
                        fs.copyFileSync(pass.path, herepass);
                    }
                    var passItem = this.createPassItemFromFile(pass.path);
                    this.passItems.splice(row, 0, passItem);
                    row++;
                }
                this.saveFile();
            }
        }
    }
    insertNewPass(seqItem, newPass) {
        if (this.passItems.length && newPass.length) {
            var foundItem = this.findPass(seqItem.type, seqItem.name);
            if (foundItem) {
                var newfile = this.createNewPassFile(newPass);
                var passItem = this.createPassItemFromFile(newfile);
                this.passItems.splice(foundItem.order + 1, 0, passItem);
                this.saveFile();
            }
        }
    }
    insertNewPassEnd(newpass) {
        if (this.passItems.length && newpass.length) {
            var newfile = this.createNewPassFile(newpass);
            var passItem = this.createPassItemFromFile(newfile);
            this.passItems.push(passItem);
            this.saveFile();
        }
    }
    insertNewFolder(seqItem, newFolder) {
        if (this.passItems.length && newFolder.length) {
            var foundItem = this.findPass(seqItem.type, seqItem.name);
            if (foundItem) {
                var passItem = this.createPassItemFolder('end', newFolder);
                this.passItems.splice(foundItem.order, 0, passItem);
                passItem = this.createPassItemFolder('folder', newFolder);
                this.passItems.splice(foundItem.order, 0, passItem);
                this.saveFile();
            }
        }
    }
    insertNewFolderEnd(newFolder) {
        if (this.passItems.length && newFolder.length) {
            var passItem = this.createPassItemFolder('folder', newFolder);
            this.passItems.push(passItem);
            passItem = this.createPassItemFolder('end', newFolder);
            this.passItems.push(passItem);
            this.saveFile();
        }
    }
    createPassItemFolder(type, name) {
        var passItem = new PassItem();
        passItem.typeStr = type;
        passItem.name = name;
        passItem.comment = '# new folder';
        return passItem;
    }
    deletePass(seqItem) {
        let passItem = this.findPass(seqItem.type, seqItem.name);
        if (passItem.isFolder()) {
            this.deleteFolder(passItem);
        }
        else
            this.deletePassInSeqFile(passItem.typeStr, passItem.name);
        this.saveFile();
    }
    deleteFolder(passItem) {
        let passes = this.getFolderPasses(passItem.typeStr, passItem.name, true);
        this.passItems.splice(passes[0].order, passes.length);
    }
    deletePassInSeqFile(type, name) {
        var passItem = this.findPass(type, name);
        if (passItem) {
            this.passItems.splice(passItem.order, 1);
        }
    }
    createNewPassFile(filename) {
        var newfilepath = path.join(visualText_1.visualText.analyzer.getSpecDirectory().path, filename.concat('.pat'));
        fs.writeFileSync(newfilepath, this.newPassContent(filename), { flag: 'w+' });
        return newfilepath;
    }
    todayDate() {
        var today = new Date();
        var date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
        var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
        return date + ' ' + time;
    }
    newPassContent(filename) {
        var newpass = '###############################################\n';
        newpass = newpass.concat('# FILE: ', filename, '\n');
        newpass = newpass.concat('# SUBJ: comment\n');
        newpass = newpass.concat('# AUTH: Your Name\n');
        newpass = newpass.concat('# CREATED: ', this.todayDate(), '\n');
        newpass = newpass.concat('# MODIFIED:\n');
        newpass = newpass.concat('###############################################\n\n');
        newpass = newpass.concat('@CODE\n');
        newpass = newpass.concat('L("hello") = 0;\n');
        newpass = newpass.concat('@@CODE\n\n');
        newpass = newpass.concat('@NODES _ROOT\n\n');
        newpass = newpass.concat('@RULES\n');
        newpass = newpass.concat('_xNIL <-\n');
        newpass = newpass.concat('	_xNIL	### (1)\n');
        newpass = newpass.concat('	@@\n');
        return newpass;
    }
    createPassItemFromFile(filePath) {
        const passItem = new PassItem();
        passItem.uri = vscode.Uri.file(filePath);
        passItem.name = this.base(filePath);
        passItem.typeStr = path.extname(filePath).substr(1);
        passItem.comment = '# comment';
        passItem.text = this.passString(passItem);
        passItem.empty = false;
        return passItem;
    }
    passFileName(passName) {
        return passName.concat('.pat');
    }
    getFolderPasses(type, name, includeStubs = false) {
        var passes = Array();
        var collect = '';
        for (let pass of this.getPasses()) {
            if (collect.length == 0 && pass.typeStr.localeCompare(type) == 0 && pass.name.localeCompare(name) == 0) {
                collect = pass.name;
                if (includeStubs)
                    passes.push(pass);
            }
            else if (collect.length) {
                if (pass.typeStr.localeCompare('end') == 0 && pass.name.localeCompare(collect) == 0) {
                    if (includeStubs)
                        passes.push(pass);
                    break;
                }
                else {
                    passes.push(pass);
                }
            }
        }
        return passes;
    }
    getPasses() {
        if (this.passItems.length == 0) {
            this.init();
        }
        return this.passItems;
    }
    getSequenceFile() {
        var uri = visualText_1.visualText.analyzer.getSpecDirectory();
        if (uri.path.length)
            uri = vscode.Uri.file(path.join(visualText_1.visualText.analyzer.getSpecDirectory().path, this.seqFileName));
        return uri;
    }
    getLibraryDirectory() {
        return vscode.Uri.file(visualText_1.visualText.getVisualTextDirectory('spec'));
    }
    getSpecDirectory() {
        return visualText_1.visualText.analyzer.getSpecDirectory();
    }
    saveType(passNum, type) {
        var passItem = this.getPassByNumber(passNum);
        if (passItem.exists()) {
            passItem.typeStr = type;
            this.saveFile();
        }
    }
    saveActive(passNum, active) {
        var passItem = this.getPassByNumber(passNum);
        if (passItem.exists()) {
            var type = passItem.typeStr.replace('/', '');
            passItem.typeStr = active + type;
            this.saveFile();
        }
    }
    saveFile() {
        this.newcontent = '';
        for (let passItem of this.passItems) {
            if (this.newcontent.length)
                this.newcontent = this.newcontent.concat('\n');
            this.newcontent = this.newcontent.concat(this.passString(passItem));
        }
        fs.writeFileSync(path.join(this.specDir.path, this.seqFileName), this.newcontent, { flag: 'w+' });
    }
    movePass(seqItem, direction) {
        let passItem = this.findPass(seqItem.type, seqItem.name);
        let order = passItem.order;
        if (passItem.isRuleFile()) {
            if (direction == moveDirection.UP) {
                let prev = this.passItems[order - 1];
                this.swapItems(passItem, prev);
            }
            else {
                let next = this.passItems[order + 1];
                this.swapItems(passItem, next);
            }
        }
        else {
            let nextTop = this.nextTop(passItem);
            let prevTop = this.prevTop(passItem);
            if (direction == moveDirection.DOWN && nextTop.isFolder()) {
                let passesOne = this.getFolderPasses(seqItem.type, seqItem.name, true);
                let passesTwo = this.getFolderPasses(nextTop.typeStr, nextTop.name, true);
                let totalPassCount = passesOne.length + passesTwo.length - 1;
                let i = 0;
                let top = passesOne[0].order;
                for (i = 0; i < passesOne.length; i++) {
                    let pass = this.passItems[top];
                    this.moveCount(pass, totalPassCount);
                }
            }
            else if (direction == moveDirection.UP && prevTop.isFolder()) {
                let passesOne = this.getFolderPasses(prevTop.typeStr, prevTop.name, true);
                let passesTwo = this.getFolderPasses(seqItem.type, seqItem.name, true);
                let totalPassCount = passesOne.length + passesTwo.length - 1;
                let i = 0;
                let top = passesOne[0].order;
                for (i = 0; i < passesOne.length; i++) {
                    let pass = this.passItems[top];
                    this.moveCount(pass, totalPassCount);
                }
            }
            else {
                let passes = this.getFolderPasses(seqItem.type, seqItem.name, true);
                order = direction == moveDirection.UP ? order - 1 : order + 1;
                let other = this.passItems[order];
                for (let pass of passes) {
                    this.swapItems(other, pass);
                    if (direction == moveDirection.UP)
                        other = pass;
                }
            }
        }
    }
    moveCount(passItem, count) {
        let i = 0;
        let pass = passItem;
        let next = passItem;
        for (i = passItem.order; i < count + passItem.order; i++) {
            next = this.passItems[i + 1];
            this.swapItems(pass, next);
            pass = next;
        }
        this.passItems;
    }
    prevTop(passItem) {
        let order = passItem.order;
        let prev = this.passItems[--order];
        while (prev.inFolder || prev.typeStr.localeCompare('end') == 0) {
            prev = this.passItems[--order];
        }
        return prev;
    }
    nextTop(passItem) {
        let order = passItem.order;
        let next = this.passItems[++order];
        while (next.inFolder) {
            next = this.passItems[++order];
        }
        if (next.typeStr.localeCompare('end') == 0)
            next = this.passItems[++order];
        return next;
    }
    swapItems(itemOne, itemTwo) {
        var hold = new PassItem();
        this.copyItem(hold, itemOne);
        this.copyItem(itemOne, itemTwo);
        this.copyItem(itemTwo, hold);
        this.swapAuxFiles(itemOne, itemTwo, textFile_1.nlpFileType.TXXT);
        this.swapAuxFiles(itemOne, itemTwo, textFile_1.nlpFileType.KBB);
    }
    copyItem(toItem, fromItem) {
        toItem.text = fromItem.text;
        toItem.name = fromItem.name;
        toItem.passNum = fromItem.passNum;
        toItem.order = fromItem.order;
        toItem.typeStr = fromItem.typeStr;
        toItem.inFolder = fromItem.inFolder;
        toItem.uri = fromItem.uri;
        toItem.comment = fromItem.comment;
    }
    swapAuxFiles(itemOne, itemTwo, type) {
        var logFile = new logfile_1.LogFile();
        var oneFile = logFile.anaFile(itemOne.passNum, type).path;
        var swapFile = oneFile + ".swap";
        var twoFile = logFile.anaFile(itemTwo.passNum, type).path;
        var oneExists = fs.existsSync(oneFile);
        var twoExists = fs.existsSync(twoFile);
        if (oneExists && twoExists) {
            fs.copyFileSync(oneFile, swapFile);
            fs.copyFileSync(twoFile, oneFile);
            fs.copyFileSync(swapFile, twoFile);
            dirfuncs_1.dirfuncs.delFile(swapFile);
        }
        else if (oneExists) {
            dirfuncs_1.dirfuncs.renameFile(oneFile, twoFile);
        }
        else if (twoExists) {
            dirfuncs_1.dirfuncs.renameFile(twoFile, oneFile);
        }
    }
    findPass(type, name) {
        var row = 1;
        var found = false;
        for (let passItem of this.passItems) {
            if (type.localeCompare(passItem.typeStr) == 0 && name.localeCompare(passItem.name) == 0) {
                return passItem;
            }
        }
        return new PassItem();
    }
}
exports.SequenceFile = SequenceFile;
//# sourceMappingURL=sequence.js.map