// Builds the Even Hub package (.ehpk) for beta testing or submission.
//
// The Even App only lets a packed app reach origins listed in its manifest,
// and those origins are your own T3 Code servers (a LAN IP, a tailnet name).
// They stay out of the committed manifest: pass them at pack time instead.
//
//   T3_GLASSES_ORIGINS="http://192.168.1.20:13773,https://mac.tailnet.ts.net" node scripts/pack.mjs
//
// Output: dist-ehpk/t3code-glasses.ehpk
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const root = NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const origins = (process.env.T3_GLASSES_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

if (origins.length === 0) {
  console.error("Set T3_GLASSES_ORIGINS to the origin(s) of your T3 Code server(s).");
  process.exit(1);
}

const manifest = JSON.parse(NodeFS.readFileSync(NodePath.join(root, "app.json"), "utf8"));
for (const permission of manifest.permissions) {
  if (permission.name === "network") {
    permission.whitelist = origins;
  }
}

const outDir = NodePath.join(root, "dist-ehpk");
NodeFS.mkdirSync(outDir, { recursive: true });
const manifestPath = NodePath.join(outDir, "app.json");
NodeFS.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

NodeChildProcess.execFileSync(
  "evenhub",
  [
    "pack",
    manifestPath,
    NodePath.join(root, "dist"),
    "-o",
    NodePath.join(outDir, "t3code-glasses.ehpk"),
  ],
  { stdio: "inherit" },
);
