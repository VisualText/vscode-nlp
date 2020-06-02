"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = require("./command");
function activate(ctx) {
    command_1.NLPCommands.attach(ctx);
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map