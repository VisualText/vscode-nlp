"use strict";
exports.__esModule = true;
var vscode = require("vscode");
var NLPCommands = /** @class */ (function () {
    function NLPCommands(ctx) {
        this._ctx = ctx;
        ctx.subscriptions.push(vscode.commands.registerCommand("nlp.analyze", this.analyze));
    }
    NLPCommands.attach = function (ctx) {
        if (!exports.nlpCommands) {
            exports.nlpCommands = new NLPCommands(ctx);
        }
        return exports.nlpCommands;
    };
    NLPCommands.prototype.analyze = function () {
        console.log("NLP Analyzing!!!");
        var testFolder = "${workspaceFolder}";
        var fs = require('fs');
        fs.readdir(testFolder, function (err, files) {
            files.forEach(function (file) {
                console.log(file);
            });
        });
    };
    return NLPCommands;
}());
exports.NLPCommands = NLPCommands;
