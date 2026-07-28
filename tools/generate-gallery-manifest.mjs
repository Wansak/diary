import { readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolsDir, "..");
const outputFile = path.join(projectRoot, "starter-gallery.js");

const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const MONTHS = [
  ["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"],
  ["05", "May"], ["06", "June"], ["07", "July"], ["08", "August"],
  ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"]
];
const MONTH_LOOKUP = new Map(MONTHS.flatMap(([number, name]) => [
  [number, { month: number, label: name }],
  [String(Number(number)), { month: number, label: name }],
  [name.toLowerCase(), { month: number, label: name }],
  [name.slice(0, 3).toLowerCase(), { month: number, label: name }]
]));

const albums = [
  { type: "photo", folder: "photos/with-friends", album: "with-friends", label: "With friends", extensions: PHOTO_EXTENSIONS },
  { type: "photo", folder: "photos/psalm", album: "psalm", label: "Psalm", extensions: PHOTO_EXTENSIONS },
  { type: "photo", folder: "photos/juan", album: "juan", label: "Juan", extensions: PHOTO_EXTENSIONS },
  { type: "photo", folder: "photos/pets", album: "pets", label: "Pets", extensions: PHOTO_EXTENSIONS },
  { type: "photo", folder: "photos/foods", album: "foods", label: "Foods", extensions: PHOTO_EXTENSIONS },
  { type: "photo", folder: "photos/us-together", album: "us-together", label: "Us Together", extensions: PHOTO_EXTENSIONS, recursive: true }
];

const naturalCompare = new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare;
const items = [];
let order = 0;

function normalizeRelative(value = "") {
  return String(value).split(path.sep).join("/").replace(/^\/+|\/+$/g, "");
}

async function collectMediaFiles(rootPath, extensions, recursive = false) {
  const output = [];

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory() && recursive) {
        await walk(fullPath);
      } else if (entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase())) {
        const relativeFile = normalizeRelative(path.relative(rootPath, fullPath));
        output.push({
          filename: entry.name,
          relativeFile,
          folderPath: normalizeRelative(path.dirname(relativeFile) === "." ? "" : path.dirname(relativeFile))
        });
      }
    }
  }

  await walk(rootPath);
  return output.sort((a, b) => naturalCompare(a.relativeFile, b.relativeFile));
}

function monthFromToken(token = "") {
  const clean = String(token).trim().toLowerCase().replace(/^[0-9]{1,2}[-_ ]+/, "");
  return MONTH_LOOKUP.get(clean) || MONTH_LOOKUP.get(String(Number(token))) || null;
}

function inferUsTogetherPeriod(folderPath = "") {
  const normalized = normalizeRelative(folderPath);
  if (!normalized) return {};
  const segments = normalized.split("/");
  const last = segments.at(-1) || "";
  const previous = segments.at(-2) || "";

  let match = last.match(/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[-_ ]+(20\d{2})$/i);
  if (match) {
    const found = monthFromToken(match[1]);
    return found ? { month: found.month, year: Number(match[2]) } : {};
  }

  match = last.match(/^(20\d{2})[-_ ]+(0?[1-9]|1[0-2])(?:[-_ ].*)?$/i);
  if (match) return { month: String(Number(match[2])).padStart(2, "0"), year: Number(match[1]) };

  match = last.match(/^(0?[1-9]|1[0-2])[-_ ]+(20\d{2})$/i);
  if (match) return { month: String(Number(match[1])).padStart(2, "0"), year: Number(match[2]) };

  if (/^20\d{2}$/.test(previous)) {
    const found = monthFromToken(last);
    if (found) return { month: found.month, year: Number(previous) };
  }

  if (/^20\d{2}$/.test(last)) {
    const found = monthFromToken(previous);
    if (found) return { month: found.month, year: Number(last) };
  }

  return {};
}

function periodLabel(month, year) {
  const found = MONTHS.find(([number]) => number === month);
  return found && year ? `${found[1]} ${year}` : "";
}

for (const config of albums) {
  const folderPath = path.join(projectRoot, "assets", "gallery", ...config.folder.split("/"));
  await mkdir(folderPath, { recursive: true });
  const files = await collectMediaFiles(folderPath, config.extensions, Boolean(config.recursive));

  for (const file of files) {
    order += 1;
    const basename = path.basename(file.filename, path.extname(file.filename));
    const relativeIdentity = file.relativeFile.toLowerCase();
    const rawId = `starter-${config.type}-${config.album}-${relativeIdentity}`;
    const id = rawId.replace(/[^a-z0-9_-]/g, "-");
    const period = config.album === "us-together" ? inferUsTogetherPeriod(file.folderPath) : {};
    const label = periodLabel(period.month, period.year);

    const item = {
      id,
      type: config.type,
      album: config.album,
      filename: file.filename,
      title: label ? `${config.label} · ${label} · ${basename}` : `${config.label} ${basename}`,
      date: label ? `${period.year}-${period.month}-01` : "",
      description: "",
      authorId: "starter",
      authorName: "Starter gallery",
      createdAt: order,
      updatedAt: order
    };

    if (config.album === "us-together" && file.folderPath) item.folderPath = file.folderPath;
    if (period.month) item.month = period.month;
    if (period.year) item.year = period.year;
    items.push(item);
  }
}

const content = `// Auto-generated file. Do not edit manually.\n// Generated from starter photos inside assets/gallery. Videos are stored in Google Drive.\nexport const STARTER_GALLERY = ${JSON.stringify(items, null, 2)};\n`;
await writeFile(outputFile, content, "utf8");

console.log("\nStarter gallery generated successfully.");
console.log(`Total starter photos found: ${items.length}`);
for (const config of albums) {
  const count = items.filter((item) => item.type === config.type && item.album === config.album).length;
  console.log(`- ${config.label}: ${count}`);
}
console.log("\nUs Together supports month-and-year folders such as:");
console.log("- assets/gallery/photos/us-together/July 2026/1.jpg");
console.log("- assets/gallery/photos/us-together/2026/July/1.jpg");
console.log("\nVideos are intentionally excluded because deployed videos now live in Google Drive.");
console.log("Output: starter-gallery.js");
