const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const templatePath = path.resolve(process.cwd(), 'src', 'firebase-messaging-sw.js.template');
const outputPath = path.resolve(process.cwd(), 'public', 'firebase-messaging-sw.js');

let templateContent = fs.readFileSync(templatePath, 'utf8');

const replacements = {
  __API_KEY__: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  __AUTH_DOMAIN__: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  __PROJECT_ID__: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  __STORAGE_BUCKET__: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  __MESSAGING_SENDER_ID__: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  __APP_ID__: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

for (const placeholder in replacements) {
  const value = replacements[placeholder];
  if (!value) {
    throw new Error(`Missing environment variable for ${placeholder}`);
  }
  templateContent = templateContent.replace(new RegExp(placeholder, 'g'), value);
}

fs.writeFileSync(outputPath, templateContent);

console.log('Successfully built firebase-messaging-sw.js');
