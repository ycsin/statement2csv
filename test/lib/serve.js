// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Allowlist-only static server for the one-origin storage test (docs/TESTING.md). It binds to
// 127.0.0.1 on an ephemeral port and serves exactly the files of `allowlist`
// ({"/url/path": "/absolute/file"}). The decoded request path is compared with the allowlist
// keys exactly; no file-system path is ever built from a request. Every other path, and any
// path containing "..", an encoded dot, slash or backslash, a backslash or a NUL, gets 404.
// Only GET and HEAD are answered (anything else gets 405). Every response carries
// Cache-Control: no-store. close() stops it, open connections included.
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function serve(allowlist) {
  if (!allowlist || typeof allowlist !== "object" || Array.isArray(allowlist)) return Promise.reject(new TypeError("serve: allowlist must be an object"));
  const table = new Map();
  for (const [urlPath, file] of Object.entries(allowlist)) {
    if (typeof urlPath !== "string" || !urlPath.startsWith("/") || urlPath.includes("..") || urlPath.includes("\\")) {
      return Promise.reject(new TypeError(`serve: bad allowlist key ${JSON.stringify(urlPath)}`));
    }
    if (typeof file !== "string" || !path.isAbsolute(file)) return Promise.reject(new TypeError(`serve: the file for ${urlPath} must be an absolute path`));
    table.set(urlPath, file);
  }
  const server = http.createServer((req, res) => {
    const deny = (code) => {
      res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end(code === 404 ? "not found\n" : "method not allowed\n");
    };
    if (req.method !== "GET" && req.method !== "HEAD") return deny(405);
    const raw = String(req.url || "").split("?")[0];
    if (!raw.startsWith("/") || raw.includes("\\") || /%(2e|2f|5c|00)/i.test(raw)) return deny(404);
    let decoded;
    try {
      decoded = decodeURIComponent(raw);
    } catch (e) {
      return deny(404);
    }
    if (decoded.includes("..") || decoded.includes("\\") || decoded.includes("\u0000")) return deny(404);
    const file = table.get(decoded);
    if (file === undefined) return deny(404);
    fs.readFile(file, (err, data) => {
      if (err) return deny(404);
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": data.length,
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : data);
      return undefined;
    });
    return undefined;
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const { port } = server.address();
      let closing = null;
      const close = () => {
        if (!closing) {
          closing = new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections();
          });
        }
        return closing;
      };
      resolve({ origin: `http://127.0.0.1:${port}`, close });
    });
  });
}

module.exports = serve;
serve.serve = serve;
