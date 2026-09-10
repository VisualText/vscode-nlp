const path = require('path');

// Shared across every bundle below. They differ only in entry/output and in
// whether 'vscode' has to be treated as an external.
const common = {
    target: 'node', // VS Code extensions run in Node.js context
    mode: 'none', // Leave source code as close as possible to original (when packaging we set this to 'production')
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: "log", // enables logging required for problem matchers
    },
    // vscode-languageserver-types ships a UMD wrapper whose require() call
    // webpack cannot resolve statically. The CommonJS branch is what actually
    // runs and it resolves fine; without this the LSP client and server bundles
    // each emit an alarming "Critical dependency" warning on every build.
    ignoreWarnings: [
        {
            module: /node_modules[\\/]vscode-languageserver-types[\\/]/,
            message: /Critical dependency: require function is used/,
        },
    ],
};

const outputTo = (filename) => ({
    path: path.resolve(__dirname, 'dist'),
    filename,
    libraryTarget: 'commonjs2'
});

module.exports = [
    // The extension host bundle: tree views, analyzer commands, the LSP client
    // and the debug-adapter factory.
    {
        ...common,
        name: 'extension',
        entry: './src/extension.ts',
        output: outputTo('extension.js'),
        externals: {
            vscode: 'commonjs vscode' // The vscode-module is created on-the-fly and must be excluded
        },
    },
    // The language server. A separate Node process, so 'vscode' is not merely
    // external here -- it is genuinely unavailable. Anything that reaches for it
    // will fail the build rather than at runtime, which is the point.
    {
        ...common,
        name: 'server',
        entry: './src/server/server.ts',
        output: outputTo('server.js'),
    },
    // The debug adapter. Also its own process (DebugAdapterExecutable), and also
    // free of any 'vscode' dependency.
    {
        ...common,
        name: 'debugAdapter',
        entry: './src/debug/debugAdapter.ts',
        output: outputTo('debugAdapter.js'),
    },
];
