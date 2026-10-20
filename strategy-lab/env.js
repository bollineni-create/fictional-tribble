// Loads strategy-lab/.env (KEY=value lines) before other modules read process.env.
// Import this first. Variables already set in the environment take precedence.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");
if (fs.existsSync(file)) process.loadEnvFile(file);
