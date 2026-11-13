/**
 * Vite plugin for the portfolio:
 *  - dev:   serves a fresh /instruments.json on every request and reloads the page
 *           when anything in instruments/ or portfolio.json changes;
 *  - build: writes instruments.json and copies instruments/**, portfolio.json and
 *           the profile photo (portfolio.json → avatar) into the output, so the
 *           site works from any sub-path (GitHub Pages).
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { buildManifest } from '../player/meta/manifest';
import { findInstruments, formatProblem, INSTRUMENTS_DIR } from './instrumentFiles';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * The profile photo's path inside the repository, when portfolio.json's `avatar`
 * names a local file ("profile.png", "images/me.jpg"); null for a web address or
 * a path outside the project. The build copies that file next to portfolio.json.
 */
export function localAvatarPath(avatar: unknown): string | null {
  if (typeof avatar !== 'string') return null;
  const path = avatar.trim().replace(/^\.\//, '');
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/') || path.startsWith('\\')) return null;
  const parts = path.split(/[\\/]/);
  if (parts.some((p) => p === '..' || p === '')) return null;
  return parts.join('/');
}

/** Reads the photo, refusing a file that resolves outside the project (e.g. a symlink). */
function readInside(root: string, path: string): Buffer {
  const real = realpathSync(join(root, path));
  const rel = relative(realpathSync(root), real);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('outside the project');
  return readFileSync(real);
}

/** Files the build writes itself; a photo path naming one of them is ignored. */
const OWN_FILES = new Set(['portfolio.json', 'instruments.json', 'index.html', 'play.html']);

function readAvatar(root: string): string | null {
  try {
    return localAvatarPath((JSON.parse(readFileSync(join(root, 'portfolio.json'), 'utf8')) as { avatar?: unknown }).avatar);
  } catch {
    return null;
  }
}

export function portfolio(): Plugin {
  let root = process.cwd();
  const manifestJson = () => {
    const found = findInstruments(root);
    const { manifest, problems } = buildManifest(found.sources);
    return { json: JSON.stringify(manifest, null, 2) + '\n', problems: [...found.problems, ...problems] };
  };

  return {
    name: 'portfolio',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.watcher.add([join(root, INSTRUMENTS_DIR), join(root, 'portfolio.json')]);
      const avatar = readAvatar(root);
      if (avatar) server.watcher.add(join(root, avatar));
      const reload = (file: string) => {
        const rel = relative(root, file).split(sep).join('/');
        // A changed photo reloads too (the <img> would otherwise keep the old one).
        if (rel === 'portfolio.json' || rel === readAvatar(root) || rel.startsWith(INSTRUMENTS_DIR + '/')) server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload);
      server.watcher.on('change', reload);
      server.watcher.on('unlink', reload);
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/instruments.json') return next();
        const { json, problems } = manifestJson();
        for (const p of problems) server.config.logger.warn(formatProblem(p));
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(json);
      });
    },
    generateBundle() {
      const { json, problems } = manifestJson();
      for (const p of problems) this.warn(formatProblem(p));
      this.emitFile({ type: 'asset', fileName: 'instruments.json', source: json });
      this.emitFile({ type: 'asset', fileName: 'portfolio.json', source: readFileSync(join(root, 'portfolio.json')) });
      const dir = join(root, INSTRUMENTS_DIR);
      try {
        for (const file of listFiles(dir)) {
          this.emitFile({ type: 'asset', fileName: relative(root, file).split(sep).join('/'), source: readFileSync(file) });
        }
      } catch {
        /* no instruments folder yet */
      }
      // The profile photo (instruments/ is already copied above).
      const avatar = readAvatar(root);
      if (avatar && !avatar.startsWith(INSTRUMENTS_DIR + '/') && !OWN_FILES.has(avatar)) {
        try {
          this.emitFile({ type: 'asset', fileName: avatar, source: readInside(root, avatar) });
        } catch {
          this.warn(`portfolio.json: the photo "${avatar}" was not found in the project, so the site shows your initials instead.`);
        }
      }
    },
  };
}
