/**
 * GitHub Release → Album JSON + Library Generator
 * Supports:
 *  - K._M._Radhakrishnan--Chandamama--2007
 *  - 01--Karthik+Srilekha--Regumullole.m4a
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
    const data = await ghFetch(`/repos/${OWNER}/${REPO_NAME}/releases?per_page=100&page=${page}`);
    if (!data.length) break;
    all.push(...data);
    if (data.length < 100) break;
    page++;
  }

  return all;
}

// ───────────────── PARSERS ─────────────────

// "K._M._Radhakrishnan--Chandamama--2007"
function parseReleaseTitle(title) {
  if (!title) return {};

  const parts = title.split('--').map(s =>
    s.replace(/\./g, ' ').trim()
  );

  return {
    artist: parts[0],
    album: parts[1],
    year: parts[2] ? parseInt(parts[2], 10) : undefined
  };
}

// "01--Karthik+Srilekha--Song.m4a"
function parseSongFilename(filename) {
  const name = filename.replace(/\.[^.]+$/, '');
  const parts = name.split('--');

  if (parts.length === 3) {
    return {
      track: parseInt(parts[0], 10),
      singers: parts[1].split('+').map(s =>
        s.replace(/\./g, ' ').trim()
      ),
      title: parts[2].replace(/\./g, ' ').trim()
    };
  }

  return {
    track: 0,
    title: name,
    singers: []
  };
}

// ───────────────── BUILD ALBUM ─────────────────
function buildAlbum(release, meta, assets, cover) {
  const parsed = parseReleaseTitle(release.name);

  const artist = meta.artist || parsed.artist || "Unknown Artist";
  const album  = parsed.album || release.name;
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

// ───────────────── CLASSIFY ASSETS ─────────────────
function classifyAssets(assets) {
  const audio = [];
  let cover = null;

  for (const a of assets) {
    const name = a.name.toLowerCase();

    if (name.startsWith('cover.')) {
      cover = a.name;
      continue;
    }

    if (/\.(m4a|mp3|flac|wav|aac|ogg|opus)$/i.test(name)) {
      audio.push(a.name);
    }
  }

  return { audio, cover };
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
      if (m[1] === 'year') meta.year = parseInt(m[2]);
    });

    const { audio, cover } = classifyAssets(r.assets);

    if (!audio.length) continue;

    const album = buildAlbum(r, meta, audio, cover);

    const file = path.join(ALBUMS_DIR, `${r.tag_name}.json`);
    write(file, album);

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

  console.log("✅ Library generated");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
