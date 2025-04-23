// src/scripts/postBuild.js

const fs = require('fs');
const { execSync, exec } = require('child_process');
const path = require('path');

const MEDUSA_SERVER_PATH = path.join(process.cwd(), '.medusa', 'server');

// Check if .medusa/server exists
if (!fs.existsSync(MEDUSA_SERVER_PATH)) {
  throw new Error('.medusa/server directory not found. This indicates the Medusa build process failed. Please check for build errors.');
}

// Copy pnpm-lock.yaml
fs.copyFileSync(
  path.join(process.cwd(), 'pnpm-lock.yaml'),
  path.join(MEDUSA_SERVER_PATH, 'pnpm-lock.yaml')
);

// Copy .env if it exists
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  fs.copyFileSync(
    envPath,
    path.join(MEDUSA_SERVER_PATH, '.env')
  );
}

// Install dependencies
console.log('Installing dependencies in .medusa/server...');
execSync('pnpm i --prod --frozen-lockfile', { 
  cwd: MEDUSA_SERVER_PATH,
  stdio: 'inherit'
});

// Run image migration
const migrateScriptPath = path.join(process.cwd(), 'scripts', 'migrate-images.js');

if (fs.existsSync(migrateScriptPath)) {
  console.log('› Running image migration script...');
  exec(`node ${migrateScriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Migration error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Migration stderr: ${stderr}`);
      return;
    }
    console.log(`Migration stdout:\n${stdout}`);
  });
} else {
  console.warn('› Migration script not found at scripts/migrate-images.js. Skipping migration.');
}
