/**
 * ota.test.js (node:test)
 * 변경: 기본 동작/유틸 검증용 테스트 추가
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildGithubRawUrl } = require("./ota.js");

test("buildGithubRawUrl builds expected raw github url", () => {
  const url = buildGithubRawUrl({
    owner: "abc",
    repo: "repo",
    branch: "main",
    path: "ota.txt"
  });
  assert.equal(url, "https://raw.githubusercontent.com/abc/repo/main/ota.txt");
});

