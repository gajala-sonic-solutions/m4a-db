/**
 * GitHub Release → Album JSON + Library Generator
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ───────────────── CONFIG ─────────────────
const REPO = process.env.GITHUB_REPOSITORY;
const GH_TOKEN = process.env.GH_TOKEN;

const [OWNER, REPO_NAME] = REPO.split('/');

const ALBUMS_DIR = path.join(__dirname, '../../albums');
const LIBRARY_FILE = path.join(__dirname, '../../library.json');

// ───────────────── TEXT NORMALIZER (FIX CORE BUG) ─────────────────
function normalizeText(str = "") {
  return str
    .replace(/[_\.]+/g, ' ')   // underscores + dots → space
    .replace(/\s+/g, ' ')      // collapse spaces
    .trim();
}

// ───────────────── GitHub API ─────────────────
function ghFetch(endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: endpoint,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'music-vault-generator',
      },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(body);
        resolve(JSON.parse(body));
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function fetchAllReleases() {
  const all = [];
  let page = 1;

  while (true) {
    const data = await ghFetch(
      `/repos/${OWNER}/${REPO_NAME}/releases?per_page=100&page=${page}`
    );

    if (!data.length) break;

    all.push(...data);

    if (data.length < 100) break;
    page++;
  }

  return all;
}

// ───────────────── PARSE RELEASE TITLE ─────────────────
/**
 * K._M._Radhakrishnan--Chandamama--2007
 */
function parseReleaseTitle(title = "") {
  const parts = title.split('--').map(normalizeText);

  return {
    artist: parts[0] || "Unknown Artist",
    album: parts[1] || "Unknown Album",
    year: parts[2] ? parseInt(parts[2], 10) : undefined
  };
}

// ───────────────── PARSE SONG FILE ─────────────────
/**
 * 01--Karthik+Srilekha--Regumullole.m4a
 */
function parseSongFilename(filename = "") {
  const name = filename.replace(/\.[^.]+$/, '');
  const parts = name.split('--');

  if (parts.length === 3) {
    return {
      track: parseInt(parts[0], 10) || 0,
      singers: parts[1]
        .split('+')
        .map(normalizeText)
        .filter(Boolean),
      title: normalizeText(parts[2])
    };
  }

  return {
    track: 0,
    title: normalizeText(name),
    singers: []
  };
}

// ───────────────── CLASSIFY ASSETS ─────────────────
function classifyAssets(assets) {
  const audio = [];
  let cover = null;

  for (const a of assets) {
    const name = a.name;

    if (/^cover\.(jpg|jpeg|png|webp)$/i.test(name)) {
      cover = name;
      continue;
    }

    if (/\.(m4a|mp3|flac|wav|aac|ogg|opus)$/i.test(name)) {
      audio.push(name);
    }
  }

  return { audio, cover };
}

// ───────────────── BUILD ALBUM ─────────────────
function buildAlbum(release, meta, assets, cover) {
  const parsed = parseReleaseTitle(release.name);

  const artist = normalizeText(meta.artist || parsed.artist);
  const album  = normalizeText(parsed.album);
  const year   = meta.year || parsed.year || new Date().getFullYear();

  const tracks = assets
    .map(file => {
      const p = parseSongFilename(file);
      return {
        track: p.track,
        file,
        title: p.title,
        singers: p.singers
      };
    })
    .sort((a, b) => a.track - b.track);

  return {
    artist,
    album,
    year,
    cover: cover || null,
    tracks
  };
}

// ───────────────── WRITE HELPERS ─────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ───────────────── MAIN ─────────────────
async function main() {
  ensureDir(ALBUMS_DIR);

  const releases = await fetchAllReleases();
  const published = releases.filter(r => !r.draft);

  const library = [];

  for (const r of published) {
    const meta = {};
    (r.body || '').split('\n').forEach(line => {
      const m = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (!m) return;

      if (m[1] === 'artist') meta.artist = m[2];
      if (m[1] === 'year') meta.year = parseInt(m[2], 10);
    });

    const { audio, cover } = classifyAssets(r.assets);
    if (!audio.length) continue;

    const album = buildAlbum(r, meta, audio, cover);

    const filePath = path.join(ALBUMS_DIR, `${r.tag_name}.json`);
    write(filePath, album);

    library.push({
      id: r.tag_name,
      artist: album.artist,
      title: album.album,
      year: album.year,
      cover: album.cover
        ? `https://github.com/${OWNER}/${REPO_NAME}/releases/download/${r.tag_name}/${album.cover}`
        : null,
      tracksFile: `albums/${r.tag_name}.json`
    });
  }

  library.sort((a, b) => (b.year || 0) - (a.year || 0));

  write(LIBRARY_FILE, { albums: library });

  console.log("✅ Library generated successfully");
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
