#!/usr/bin/env node
// Generate a bcrypt hash for a single user.
//
// Usage:
//   node scripts/hash-password.mjs Andrew "MyPassword123"
//
// Output (paste the line into your USERS_JSON env var):
//   {"name":"Andrew","passwordHash":"$2b$10$..."}
//
// To build the full USERS_JSON array, run this script once per user and
// combine the lines inside square brackets, separated by commas. Example:
//
//   USERS_JSON='[
//     {"name":"Andrew","passwordHash":"$2b$10$..."},
//     {"name":"David","passwordHash":"$2b$10$..."},
//     {"name":"Stephen","passwordHash":"$2b$10$..."},
//     {"name":"Paul","passwordHash":"$2b$10$..."}
//   ]'

import bcrypt from "bcryptjs";

const [, , name, password] = process.argv;
if (!name || !password) {
  console.error("Usage: node scripts/hash-password.mjs <Name> <Password>");
  console.error('Example: node scripts/hash-password.mjs Andrew "secret"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
console.log(JSON.stringify({ name, passwordHash: hash }));
