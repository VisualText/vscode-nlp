"use strict";
exports.__esModule = true;
var command_1 = require("./command");
function activate(ctx) {
    command_1.NLPCommands.attach(ctx);
}
exports.activate = activate;
