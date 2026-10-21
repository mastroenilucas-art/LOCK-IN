// Copies the app's name, bundle ID, version, build number, icon and splash
// into the iPhone project. Codemagic runs this before every build:
//   node scripts/prepare-ios.mjs --bundle-id com.yourbusiness.coach --build-number 20261021.1530
// Safe to run more than once.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? acc.concat([[a.slice(2), all[i + 1]]]) : acc), []),
);
const fail = (msg) => { console.error('\n✗ ' + msg + '\n'); process.exit(1); };

const cfg = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appName = String(cfg.appName || 'Coach').trim();
const bundleId = String(args['bundle-id'] || process.env.BUNDLE_ID || '').trim();
const buildNumber = String(args['build-number'] || '1').trim();
const version = String(pkg.version || '1.0.0').trim();

if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(bundleId)) fail(`Bundle ID "${bundleId}" isn’t valid. Use reverse-domain style, like com.yourbusiness.coach (set BUNDLE_ID in codemagic.yaml).`);
if (bundleId.startsWith('com.yourbusiness.')) fail('Change BUNDLE_ID in codemagic.yaml from com.yourbusiness.coach to your own (the one you registered with Apple).');
if (!/^\d+(\.\d+){0,2}$/.test(buildNumber)) fail(`Build number "${buildNumber}" must be numbers and dots.`);
if (!/^\d+(\.\d+){0,2}$/.test(version)) fail(`"version" in package.json ("${version}") must look like 1.0.0.`);
if (/YOUR-PROJECT-ID|PASTE-YOUR-KEY/.test(JSON.stringify(cfg))) fail('app.config.json still has placeholder Supabase values. Paste your Project URL and Publishable key first.');

// ---------- Xcode project settings ----------
const pbx = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
if (!fs.existsSync(pbx)) fail('ios/App/App.xcodeproj is missing. Run "npx cap add ios" once, or restore the ios folder from the project zip.');
let p = fs.readFileSync(pbx, 'utf8');
p = p.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`)
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`)
  .replace(/TARGETED_DEVICE_FAMILY = [^;]+;/g, 'TARGETED_DEVICE_FAMILY = 1;');
fs.writeFileSync(pbx, p);

// ---------- Info.plist: display name ----------
const plistPath = path.join(root, 'ios/App/App/Info.plist');
let plist = fs.readFileSync(plistPath, 'utf8');
const xmlName = appName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
plist = plist.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${xmlName}$2`);
fs.writeFileSync(plistPath, plist);

// ---------- icon and splash ----------
function pngInfo(file) {
  const b = fs.readFileSync(file);
  if (b.length < 26 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}
const hasSips = process.platform === 'darwin';
function prepareImage(src, dest, size, label) {
  if (!fs.existsSync(src)) fail(`${label} ${path.relative(root, src)} is missing.`);
  const info = pngInfo(src);
  if (!info) fail(`${label} ${path.relative(root, src)} must be a PNG file.`);
  const hasAlpha = info.colorType === 4 || info.colorType === 6;
  if (info.width === size && info.height === size && !hasAlpha) {
    fs.copyFileSync(src, dest);
    return;
  }
  if (!hasSips) fail(`${label} must be a ${size}×${size} PNG with no transparency (it is ${info.width}×${info.height}${hasAlpha ? ', with transparency' : ''}).`);
  // On a Mac build machine: resize and flatten (Apple rejects icons with transparency).
  const tmp = dest + '.tmp.jpg';
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '100', '-z', String(size), String(size), src, '--out', tmp], { stdio: 'ignore' });
  execFileSync('sips', ['-s', 'format', 'png', tmp, '--out', dest], { stdio: 'ignore' });
  fs.rmSync(tmp, { force: true });
}
const assets = path.join(root, 'ios/App/App/Assets.xcassets');
prepareImage(path.join(root, 'resources/icon.png'), path.join(assets, 'AppIcon.appiconset/AppIcon-512@2x.png'), 1024, 'App icon');

const splashDir = path.join(assets, 'Splash.imageset');
for (const f of fs.readdirSync(splashDir)) if (f.endsWith('.png')) fs.rmSync(path.join(splashDir, f));
prepareImage(path.join(root, 'resources/splash.png'), path.join(splashDir, 'splash.png'), 2732, 'Splash image');
prepareImage(path.join(root, 'resources/splash-dark.png'), path.join(splashDir, 'splash-dark.png'), 2732, 'Dark splash image');
fs.writeFileSync(path.join(splashDir, 'Contents.json'), JSON.stringify({
  images: [
    { idiom: 'universal', filename: 'splash.png', scale: '1x' },
    { idiom: 'universal', filename: 'splash-dark.png', scale: '1x', appearances: [{ appearance: 'luminosity', value: 'dark' }] },
  ],
  info: { author: 'xcode', version: 1 },
}, null, 2) + '\n');

console.log(`✓ iPhone project ready: "${appName}" · ${bundleId} · version ${version} (${buildNumber})`);
