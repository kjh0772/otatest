/**
 * ota.test.js (node:test)
 * 변경: 기본 동작/유틸 검증용 테스트 추가
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildGithubRawUrl, formatUpdateLog } = require("./ota.js");

test("buildGithubRawUrl builds expected raw github url", () => {
  const url = buildGithubRawUrl({
    owner: "abc",
    repo: "repo",
    branch: "main",
    path: "ota.txt"
  });
  assert.equal(url, "https://raw.githubusercontent.com/abc/repo/main/ota.txt");
});

test("formatUpdateLog formats a readable line", () => {
  const line = formatUpdateLog({ from: "ota v1.1", to: "ota v1.2", at: "2026-01-28T00:00:00.000Z" });
  assert.equal(line, '[ota] updated @ 2026-01-28T00:00:00.000Z: "ota v1.1" -> "ota v1.2"');
});

