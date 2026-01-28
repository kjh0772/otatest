/**
 * ota.js
 * - GitHub의 특정 파일 내용을 폴링해서 변경 시 자동 반영
 * - 간이 웹서버로 현재 OTA 텍스트 노출
 *
 * 변경: 최초 프로젝트 생성 (내장 모듈 기반, 외부 의존성 없음)
 */

"use strict";

const http = require("node:http");
const { setTimeout: delay } = require("node:timers/promises");

/**
 * @typedef {{ text: string, etag?: string, lastCheckedAt?: string, lastUpdatedAt?: string, lastError?: string }} OtaState
 */

function env(name, fallback) {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function buildGithubRawUrl({ owner, repo, branch, path }) {
  // 변경: raw URL로 단순화 (리포 내 파일을 그대로 가져오기)
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

function buildRequestHeaders(etag) {
  /** @type {Record<string,string>} */
  const headers = {
    "User-Agent": "ota-test-node",
    "Accept": "text/plain, */*"
  };
  if (etag) headers["If-None-Match"] = etag; // 변경: ETag 기반으로 변경 감지/트래픽 절감
  const token = env("OTA_GH_TOKEN", "");
  if (token) headers["Authorization"] = `Bearer ${token}`; // 변경: private/rate limit 대비
  return headers;
}

async function fetchTextWithEtag(url, etag) {
  const res = await fetch(url, { headers: buildRequestHeaders(etag) });
  if (res.status === 304) {
    return { status: 304, text: null, etag };
  }
  if (!res.ok) {
    const body = await safeReadText(res);
    throw new Error(`GitHub fetch 실패: ${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`);
  }

  const newEtag = res.headers.get("etag") || undefined;
  const text = await res.text();
  return { status: 200, text, etag: newEtag };
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function htmlPage({ title, body }) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, sans-serif; background: #0b1220; color: #e5e7eb; }
      .wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
      .card { background: #0f172a; border: 1px solid #1f2a44; border-radius: 12px; padding: 16px; }
      .title { font-size: 18px; font-weight: 700; margin: 0 0 12px; }
      .muted { color: #9ca3af; font-size: 13px; }
      pre { white-space: pre-wrap; word-break: break-word; background: #0b1220; border: 1px solid #1f2a44; padding: 12px; border-radius: 10px; }
      a { color: #93c5fd; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
      @media (min-width: 840px) { .grid { grid-template-columns: 1fr 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      ${body}
    </div>
  </body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nowIso() {
  return new Date().toISOString();
}

function createDefaultState() {
  /** @type {OtaState} */
  return {
    text: "ota v1.0", // 변경: 기본값 (GitHub 설정 전에도 테스트 가능)
    etag: undefined,
    lastCheckedAt: undefined,
    lastUpdatedAt: undefined,
    lastError: undefined
  };
}

function createConfig() {
  const port = toInt(env("OTA_PORT", "3000"), 3000);
  const pollMs = toInt(env("OTA_POLL_MS", "5000"), 5000);

  const owner = env("OTA_GH_OWNER", "");
  const repo = env("OTA_GH_REPO", "");
  const branch = env("OTA_GH_BRANCH", "main");
  const path = env("OTA_GH_PATH", "");

  const enabled = Boolean(owner && repo && path);
  const url = enabled ? buildGithubRawUrl({ owner, repo, branch, path }) : null;

  return { port, pollMs, enabled, owner, repo, branch, path, url };
}

async function pollGithubForever(state, config) {
  if (!config.enabled || !config.url) return;

  // 변경: 최초 즉시 체크 후, 주기적으로 반복
  for (;;) {
    state.lastCheckedAt = nowIso();
    try {
      const { status, text, etag } = await fetchTextWithEtag(config.url, state.etag);
      if (status === 200 && text != null) {
        const trimmed = text.replace(/\r\n/g, "\n").trimEnd();
        if (trimmed !== state.text) {
          state.text = trimmed;
          state.lastUpdatedAt = nowIso();
        }
        state.etag = etag;
      }
      state.lastError = undefined;
    } catch (e) {
      state.lastError = e instanceof Error ? e.message : String(e);
    }

    await delay(config.pollMs);
  }
}

function startServer(state, config) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }, null, 2));
      return;
    }

    if (url.pathname === "/version") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(state.text);
      return;
    }

    if (url.pathname === "/status") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            text: state.text,
            lastCheckedAt: state.lastCheckedAt,
            lastUpdatedAt: state.lastUpdatedAt,
            lastError: state.lastError,
            github: config.enabled
              ? { owner: config.owner, repo: config.repo, branch: config.branch, path: config.path, url: config.url }
              : { enabled: false }
          },
          null,
          2
        )
      );
      return;
    }

    // 기본 페이지
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      htmlPage({
        title: "OTA 테스트",
        body: `
          <div class="card">
            <p class="title">OTA 테스트 웹서버</p>
            <p class="muted">
              GitHub 파일 변경을 감지하면 아래 텍스트가 자동으로 업데이트됩니다.
              (엔드포인트: <a href="/version">/version</a>, 상태: <a href="/status">/status</a>)
            </p>
          </div>
          <div style="height:12px"></div>
          <div class="grid">
            <div class="card">
              <p class="title">현재 OTA 텍스트</p>
              <pre>${escapeHtml(state.text)}</pre>
            </div>
            <div class="card">
              <p class="title">상태</p>
              <pre>${escapeHtml(
                JSON.stringify(
                  {
                    lastCheckedAt: state.lastCheckedAt,
                    lastUpdatedAt: state.lastUpdatedAt,
                    lastError: state.lastError,
                    githubTracking: config.enabled ? "enabled" : "disabled"
                  },
                  null,
                  2
                )
              )}</pre>
            </div>
          </div>
        `
      })
    );
  });

  server.listen(config.port, () => {
    // 변경: 콘솔 안내는 짧게 유지
    console.log(`[ota] server listening: http://localhost:${config.port}`);
    if (!config.enabled) {
      console.log("[ota] GitHub tracking disabled. Set OTA_GH_OWNER/OTA_GH_REPO/OTA_GH_PATH to enable.");
    } else {
      console.log(`[ota] tracking: ${config.url}`);
      console.log(`[ota] poll interval: ${config.pollMs}ms`);
    }
  });
}

async function main() {
  const state = createDefaultState();
  const config = createConfig();

  startServer(state, config);
  // 변경: 서버는 즉시 띄우고, 폴링은 백그라운드로 지속 수행
  pollGithubForever(state, config).catch((e) => console.error("[ota] poll loop crashed", e));
}

// 변경: 테스트/모듈 import 시 자동 실행 방지 (직접 실행일 때만 main 실행)
if (require.main === module) {
  main().catch((e) => {
    console.error("[ota] fatal", e);
    process.exitCode = 1;
  });
}

module.exports = {
  // 변경: 테스트용 export
  buildGithubRawUrl,
  createConfig,
  createDefaultState,
  fetchTextWithEtag
};

