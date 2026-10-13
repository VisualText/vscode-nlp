// Fail if the Marketplace would reject the extension's icon.
//
// WHY THIS EXISTS. The Marketplace refuses an icon larger than 1024 x 1024
// pixels, and it only says so at `vsce publish` -- after the GitHub release is
// already made. resources/NLPppLogo.png was 2066 x 2066 and had been fine; once
// the Marketplace started enforcing the limit, 4.3.5 through 4.3.10 were each
// released on GitHub and rejected by the Marketplace, while CI stayed green,
// because neither CI nor `vsce package` checks it.
//
// So read the icon named in package.json and check its PNG header here, where
// a pull request sees it.

const fs = require("fs");
const path = require("path");

const MAX = 1024;
const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

if (!pkg.icon) {
	console.log("  No icon in package.json; nothing to check.");
	process.exit(0);
}

const file = path.join(root, pkg.icon);
const fail = (msg) => {
	console.error(`  Icon check FAILED: ${msg}`);
	process.exit(1);
};

if (!fs.existsSync(file)) fail(`${pkg.icon} does not exist`);
const buf = fs.readFileSync(file);
// PNG signature, then the IHDR chunk: width and height are big-endian at 16 and 20.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG)) fail(`${pkg.icon} is not a PNG (the Marketplace requires one)`);
const width = buf.readUInt32BE(16);
const height = buf.readUInt32BE(20);
if (width > MAX || height > MAX) {
	fail(`${pkg.icon} is ${width} x ${height}; the Marketplace allows at most ${MAX} x ${MAX}`);
}
console.log(`  Icon check passed (${pkg.icon}, ${width} x ${height}).`);
