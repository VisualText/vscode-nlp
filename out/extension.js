"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const command_1 = require("./command");
const analyzerSequence_1 = require("./analyzerSequence");
function activate(ctx) {
    command_1.NLPCommands.attach(ctx);
    new analyzerSequence_1.AnalyzerSequence(ctx);
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map