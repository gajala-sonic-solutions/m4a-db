function cleanText(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAlbumName(releaseName) {
  const parts = releaseName.split("--");

  if (parts.length < 3) {
    throw new Error(`Invalid release name: ${releaseName}`);
  }

  const composer = cleanText(parts[0]);
  const album = cleanText(parts[1]);
  const year = Number(parts[2]);

  return {
    composer,
    album,
    year,
  };
}

export function parseTrackName(filename) {
  const clean = filename.replace(".m4a", "");

  const parts = clean.split("--");

  if (parts.length < 3) {
    throw new Error(`Invalid track filename: ${filename}`);
  }

  const track = Number(parts[0]);

  const artists = parts[1]
    .split("+")
    .map((artist) => cleanText(artist));

  const title = cleanText(parts[2]);

  return {
    track,
    artists,
    title,
  };
}

export function createAlbumId(composer, album, year) {
  return `${composer}-${album}-${year}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
