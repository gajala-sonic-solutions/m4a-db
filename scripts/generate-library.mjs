import fs from "fs/promises";
import path from "path";
import { Octokit } from "@octokit/rest";

import {
  parseAlbumName,
  parseTrackName,
  createAlbumId,
} from "./parsers.mjs";

const OWNER = "gajala-sonic-solutions";
const REPO = "m4a-db";

const octokit = new Octokit();

async function main() {
  console.log("Fetching releases...");

  const releasesResponse = await octokit.repos.listReleases({
    owner: OWNER,
    repo: REPO,
    per_page: 100,
  });

  const releases = releasesResponse.data;

  const albums = [];

  for (const release of releases) {
    try {
      const { composer, album, year } = parseAlbumName(release.name);

      const albumId = createAlbumId(composer, album, year);

      const coverAsset = release.assets.find(
        (asset) => asset.name === "cover.webp"
      );

      const tracks = release.assets
        .filter((asset) => asset.name.endsWith(".m4a"))
        .map((asset) => {
          const parsed = parseTrackName(asset.name);

          return {
            track: parsed.track,
            title: parsed.title,
            artists: parsed.artists,
            url: asset.browser_download_url,
          };
        })
        .sort((a, b) => a.track - b.track);

      albums.push({
        id: albumId,
        title: album,
        composer,
        year,
        cover: coverAsset
          ? coverAsset.browser_download_url
          : null,
        tracks,
      });

      console.log(`Processed: ${album}`);
    } catch (error) {
      console.error(`Failed release: ${release.name}`);
      console.error(error.message);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    albums,
  };

  await fs.mkdir("generated", { recursive: true });

  await fs.writeFile(
    path.join("generated", "library.json"),
    JSON.stringify(output, null, 2)
  );

  console.log("library.json generated.");
}

main();
