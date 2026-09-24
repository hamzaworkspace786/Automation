import fs from "fs";
import path from "path";
import { cleanProfileBloat } from "../src/lib/browser/browser";

const profilesDir = process.env.AUTOMATION_PROFILES_DIR ?? path.join(process.cwd(), "profiles");

function cleanAllProfiles() {
  if (!fs.existsSync(profilesDir)) {
    console.log(`Profiles directory not found at: ${profilesDir}`);
    return;
  }

  const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
  let cleanedCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const profilePath = path.join(profilesDir, entry.name);
      console.log(`Cleaning profile: ${entry.name}`);
      cleanProfileBloat(profilePath);
      cleanedCount++;
    }
  }

  console.log(`Successfully cleaned ${cleanedCount} profiles.`);
}

cleanAllProfiles();
