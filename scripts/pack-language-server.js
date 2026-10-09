// Builds the standalone npm package for the NLP++ language server.
//
// The package is the same server bundle the extension ships (dist/server.js),
// published on its own so Neovim, Helix, Emacs, Zed, Sublime and Kate users can
// `npm install -g nlpplus-language-server` without installing VSCode. It has no
// runtime dependencies: webpack has already inlined vscode-languageserver.
//
// Usage: npm run package:server            (builds + `npm pack` -> .tgz)
//        npm run package:server -- --no-pack  (builds the folder only)
//
// The version is stamped from the extension's package.json so the two always
// match; language-server/package.json keeps 0.0.0 in git.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkgDir = path.join(root, "language-server");
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

run("npx webpack --mode production --devtool hidden-source-map --config-name server");

fs.mkdirSync(path.join(pkgDir, "dist"), { recursive: true });
fs.copyFileSync(path.join(root, "dist", "server.js"), path.join(pkgDir, "dist", "server.js"));
fs.copyFileSync(path.join(root, "LICENSE"), path.join(pkgDir, "LICENSE"));

const version = require(path.join(root, "package.json")).version;
const pkgPath = path.join(pkgDir, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = version;
fs.writeFileSync(pkgPath + ".tmp", JSON.stringify(pkg, null, 4) + "\n");

// Pack with the stamped version, then restore 0.0.0 so the working tree stays clean.
const original = fs.readFileSync(pkgPath);
try {
	fs.renameSync(pkgPath + ".tmp", pkgPath);
	if (!process.argv.includes("--no-pack")) run("npm pack", pkgDir);
} finally {
	fs.writeFileSync(pkgPath, original);
}
console.log(`nlpplus-language-server ${version} built in language-server/`);
