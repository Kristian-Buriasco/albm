#!/usr/bin/env node
// Usage: node scripts/hash-password.mjs 'mypassword'
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs 'mypassword'");
  process.exit(1);
}

console.log(bcrypt.hashSync(password, 12));
