/**
 * repo-updater.js
 * - GitHub 최신 커밋(브랜치 HEAD)을 폴링해서 변경 시 로컬 리포를 git pull로 갱신
 * - 변경 감지/업데이트 로그를 콘솔에 출력
 *
 * 사용 의도(라즈베리파이 등):
 * - systemd/pm2 같은 프로세스 매니저가 이 프로세스를 항상 실행
 * - 새 커밋 감지 → git pull 성공 → 프로세스 종료(재시작 유도) 또는 훅 실행
 *
 * 변경: "커밋된 전체 내용 OTA" 지원을 위한 파일 추가
 */

"use strict";

const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

function env(name, fallback) {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function buildGithubCommitApiUrl({ owner, repo, branch }) {
  // 변경: 브랜치 HEAD 커밋 SHA를 가져오기 위한 API
  return `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
}

function buildHeaders() {
  /** @type {Record<string,string>} */
  const headers = {
    "User-Agent": "ota-test-node",
    "Accept": "application/vnd.github+json"
  };
  const token = env("OTA_GH_TOKEN", "");
  if (token) headers["Authorization"] = `Bearer ${token}`; // 변경: rate limit / private 대비
  return headers;
}

async function getRemoteHeadSha({ owner, repo, branch }) {
  const url = buildGithubCommitApiUrl({ owner, repo, branch });
  const res = await fetch(url, { headers: buildHeaders(), cache: "no-store" });
  if (!res.ok) {
    const t = await safeReadText(res);
    throw new Error(`GitHub commit API 실패: ${res.status} ${res.statusText}${t ? ` - ${t}` : ""}`);
  }
  const json = await res.json();
  if (!json || typeof json.sha !== "string") throw new Error("GitHub commit API 응답에 sha가 없습니다.");
  return json.sha;
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function runGit(args) {
  // 변경: git pull/fetch 실행 (출력은 그대로 콘솔로)
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(" ")} 실패 (exit=${code})`));
    });
  });
}

function runPostUpdateCmd(cmd) {
  // 변경: 업데이트 직후 서버 재시작 등 후처리 훅(선택)
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`post-update cmd 실패 (exit=${code})`));
    });
  });
}

async function updateWorkingTree(strategy, branch) {
  if (strategy === "reset") {
    // 변경: 로컬 변경이 없다는 전제에서 가장 확실하게 원격과 동일화
    await runGit(["fetch", "origin", branch]);
    await runGit(["reset", "--hard", `origin/${branch}`]);
    return;
  }

  // 기본: ff-only pull (안전)
  await runGit(["pull", "--ff-only", "origin", branch]);
}

async function main() {
  const owner = env("OTA_GH_OWNER", "");
  const repo = env("OTA_GH_REPO", "");
  const branch = env("OTA_GH_BRANCH", "main");
  const pollMs = toInt(env("OTA_REPO_POLL_MS", env("OTA_POLL_MS", "5000")), 5000);
  const strategy = env("OTA_REPO_UPDATE_STRATEGY", "pull"); // pull | reset
  const exitOnUpdate = env("OTA_REPO_EXIT_ON_UPDATE", "1") !== "0";
  const postUpdateCmd = env("OTA_REPO_POST_UPDATE_CMD", "");

  if (!owner || !repo) {
    console.error("[repo-updater] OTA_GH_OWNER / OTA_GH_REPO 가 필요합니다.");
    process.exitCode = 1;
    return;
  }

  console.log(`[repo-updater] started @ ${nowIso()}`);
  console.log(`[repo-updater] tracking repo: ${owner}/${repo} (${branch})`);
  console.log(`[repo-updater] poll interval: ${pollMs}ms`);
  console.log(`[repo-updater] update strategy: ${strategy}`);
  if (postUpdateCmd) console.log(`[repo-updater] post-update cmd: ${postUpdateCmd}`);

  let lastSha = null;

  for (;;) {
    try {
      const sha = await getRemoteHeadSha({ owner, repo, branch });
      if (!lastSha) {
        lastSha = sha;
        console.log(`[repo-updater] initial sha: ${sha}`);
      } else if (sha !== lastSha) {
        console.log(`[repo-updater] change detected @ ${nowIso()}: ${lastSha} -> ${sha}`);
        console.log("[repo-updater] updating working tree...");
        await updateWorkingTree(strategy, branch);
        console.log(`[repo-updater] update complete @ ${nowIso()}`);
        lastSha = sha;

        if (postUpdateCmd) {
          console.log("[repo-updater] running post-update cmd...");
          await runPostUpdateCmd(postUpdateCmd);
          console.log(`[repo-updater] post-update cmd complete @ ${nowIso()}`);
        }

        if (exitOnUpdate) {
          console.log("[repo-updater] exiting to allow supervisor restart. (exit=42)");
          process.exit(42); // 변경: systemd/pm2가 자동 재시작하도록 유도
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[repo-updater] error @ ${nowIso()}: ${msg}`);
    }

    await delay(pollMs);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("[repo-updater] fatal", e);
    process.exitCode = 1;
  });
}

module.exports = {
  // 변경: 테스트용 export
  buildGithubCommitApiUrl
};

