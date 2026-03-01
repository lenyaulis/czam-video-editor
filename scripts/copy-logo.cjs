const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(
  root,
  "assets",
  "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_8953fc12c0c17e204e0cbdb2777443d8_images_c-zam_logo_white-3713928a-030c-4757-8bb1-52db7a6bd25d.png"
);
const dst = path.join(root, "public", "favicon.png");

if (!fs.existsSync(src)) {
  console.error("Logo not found at:", src);
  console.error("Save your C-zam logo as public/favicon.png manually.");
  process.exit(1);
}
fs.copyFileSync(src, dst);
console.log("Copied logo to public/favicon.png");
