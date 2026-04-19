import { defineConfig } from "vite";
import { resolve } from "path";
import * as fs from "fs";
import * as path from "path";

const HUDKIT_PREBONK_DIR = resolve(__dirname, "../local/resourcepack/hudkit-prebonk");
const HUDKIT_PREBONK_MOUNT = "/hudkit-prebonk-pack";
const TESTS_DIR = resolve(__dirname, "../tests");

function serveStaticDir(mount: string, dir: string) {
  return {
    name: `serve-${mount.replace(/\//g, "-")}`,
    configureServer(server: any) {
      server.middlewares.use(mount, (req: any, res: any, next: any) => {
        const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const filePath = path.join(dir, urlPath);
        if (!filePath.startsWith(dir)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) {
            next();
            return;
          }
          fs.createReadStream(filePath).pipe(res);
        });
      });
    },
  };
}

export default defineConfig({
  appType: "mpa",
  resolve: {
    alias: {
      libmojangles: resolve(__dirname, "../src"),
    },
  },
  publicDir: resolve(__dirname, "../local/resourcepack/default"),
  server: {
    port: 3000,
    open: true,
  },
  plugins: [
    serveStaticDir(HUDKIT_PREBONK_MOUNT, HUDKIT_PREBONK_DIR),
    serveStaticDir("/test-assets", TESTS_DIR),
  ],
});
