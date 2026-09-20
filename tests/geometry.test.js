const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs
  .readFileSync(path.join(__dirname, "..", "GapGeometry.js"), "utf8")
  .replace(/^\.pragma library\s*/, "");
const context = {};
vm.createContext(context);
vm.runInContext(source, context);

function client(address, at, size, extra = {}) {
  return { lastIpcObject: { address, at, size, floating: false, ...extra } };
}

test("finds a vertical shared gap", () => {
  const rails = context.collect(
    { x: 0, y: 0, width: 1000, height: 900 },
    [client("0xa", [0, 0], [500, 900]), client("0xb", [520, 0], [500, 900])],
    56,
    24,
  );

  assert.equal(rails.length, 1);
  assert.equal(rails[0].orientation, "vertical");
  assert.equal(rails[0].x, 510);
  assert.equal(rails[0].y, 0);
  assert.equal(rails[0].height, 900);
});

test("finds a horizontal shared gap", () => {
  const rails = context.collect(
    { x: 0, y: 0, width: 1000, height: 900 },
    [client("0xc", [0, 0], [1000, 430]), client("0xd", [0, 450], [1000, 430])],
    56,
    24,
  );

  assert.equal(rails.length, 1);
  assert.equal(rails[0].orientation, "horizontal");
  assert.equal(rails[0].y, 440);
  assert.equal(rails[0].x, 0);
  assert.equal(rails[0].width, 1000);
});

test("ignores floating and fullscreen surfaces", () => {
  const rails = context.collect(
    { x: 0, y: 0, width: 1000, height: 900 },
    [
      client("0xe", [0, 0], [500, 900], { floating: true }),
      client("0xf", [520, 0], [500, 900]),
      client("0x10", [0, 0], [500, 900], { fullscreen: 1 }),
    ],
    56,
    24,
  );

  assert.equal(rails.length, 0);
});

test("does not treat touching window edges as a gap", () => {
  const rails = context.collect(
    { x: 0, y: 0, width: 1000, height: 900 },
    [client("0x11", [0, 0], [500, 900]), client("0x12", [500, 0], [500, 900])],
    56,
    24,
    2,
  );

  assert.equal(rails.length, 0);
});

test("limits a rail to the shared corridor between partially overlapping windows", () => {
  const rails = context.collect(
    { x: 0, y: 0 },
    [client("0x13", [0, 100], [500, 400]), client("0x14", [520, 100], [400, 400])],
    56,
    24,
    2,
  );

  assert.equal(rails.length, 1);
  assert.equal(rails[0].x, 510);
  assert.equal(rails[0].y, 100);
  assert.equal(rails[0].width, 20);
  assert.equal(rails[0].height, 400);
});

test("merges a spanning left window across stacked right windows", () => {
  const rails = context.collect(
    { x: 0, y: 0 },
    [
      client("0x15", [0, 0], [500, 900]),
      client("0x16", [520, 0], [480, 440]),
      client("0x17", [520, 460], [480, 440]),
    ],
    56,
    24,
    2,
  );

  const vertical = rails.filter((rail) => rail.orientation === "vertical");
  assert.equal(vertical.length, 1);
  assert.equal(vertical[0].y, 0);
  assert.equal(vertical[0].height, 900);
  assert.equal(vertical[0].resizeAddress, "0x15");
  assert.equal(vertical[0].resizeFactor, 1);
});
