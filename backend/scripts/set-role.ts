import "dotenv/config";
import { auth } from "../src/firebase.js";

const email = process.argv[2]?.trim().toLowerCase();
const role = process.argv[3];
const roles = ["admin", "manager", "teacher", "accountant", "receptionist"] as const;

if (!email || !roles.includes(role as typeof roles[number])) {
  throw new Error("Usage: npm run set-role -w backend -- user@example.com admin|manager|teacher|accountant|receptionist");
}

async function setRole() {
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role });
  console.log(`Set ${email} role to ${role}. Have the user sign out and back in to refresh the ID token.`);
}

void setRole().catch((error: unknown) => {
  console.error("Could not set staff role:", error);
  process.exitCode = 1;
});
