import "dotenv/config";
import { auth } from "../src/firebase.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  throw new Error("Usage: npm run set-admin -w backend -- user@example.com");
}

async function grantAdmin() {
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role: "admin" });
  console.log(`Granted admin role to ${email}. Have the user sign out and back in to refresh the ID token.`);
}

void grantAdmin().catch((error: unknown) => {
  console.error("Could not grant administrator access:", error);
  process.exitCode = 1;
});
