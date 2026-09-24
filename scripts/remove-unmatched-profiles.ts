import fs from "fs";
import path from "path";

const profilesDir = path.join(process.cwd(), "profiles");

const foldersToDelete = [
  "adsfxc2%40gmail.com",
  "alexahines54%40gmail.com",
  "bucklj665%40gmail.com",
  "bvdygv63%40gmail.com",
  "dfasutse%40gmail.com",
  "dfwrgcxb%40gmail.com",
  "dominicksoto764677%40gmail.com",
  "dsss66017%40gmail.com",
  "fd3768110%40gmail.com",
  "fdfgfd19%40gmail.com",
  "fgb936604%40gmail.com",
  "fgh412362%40gmail.com",
  "fgjhdjghsg%40gmail.com",
  "fgjhjghj3%40gmail.com",
  "fgsdf6744%40gmail.com",
  "fjdghjdhgh%40gmail.com",
  "fsd0068%40gmail.com",
  "gdf92647%40gmail.com",
  "gdfghj064%40gmail.com",
  "gff118782%40gmail.com",
  "gjkhkhgjghj%40gmail.com",
  "gtfb72076%40gmail.com",
  "japitnqamm%40gmail.com",
  "jghjghdfdghs%40gmail.com",
  "jkhjfdhg%40gmail.com",
  "jkhjkhjk47%40gmail.com",
  "joidsadikol%40gmail.com",
  "kahahihaga%40gmail.com",
  "loogjokes%40gmail.com",
  "mahsolfased%40gmail.com",
  "mariapater207%40gmail.com",
  "nancychan5353%40gmail.com",
  "reghhfjjf%40gmail.com",
  "richardroberts6656%40gmail.com",
  "rightdmca8k%40gmail.com",
  "royw2498%40gmail.com",
  "samonehoijerk%40gmail.com",
  "sdfs6505%40gmail.com",
  "sedamodari7%40gmail.com",
  "sgfhfghrdg%40gmail.com",
  "stgsd55%40gmaip.com",
  "sxz991261%40gmail.com",
  "t55316531%40gmail.com",
  "trhdgghdj%40gmail.com",
];

let deletedCount = 0;

for (const folder of foldersToDelete) {
  const targetPath = path.join(profilesDir, folder);
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    console.log(`Deleted profile folder: ${folder}`);
    deletedCount++;
  } else {
    console.log(`Folder not found: ${folder}`);
  }
}

console.log(`Finished deleting ${deletedCount} folders.`);
