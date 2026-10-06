const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

test("Quickshell updates the input mask when workspace gaps disappear or move", () => {
  // Exercise the service's own function with real Quickshell Region objects.
  // Destroying a child Region alone does not emit the parent's changed signal.
  const source = fs.readFileSync(path.join(__dirname, "..", "Service.qml"), "utf8");
  const start = source.indexOf("function rebuildInputRegions()");
  const end = source.indexOf("function isDragging()", start);
  assert.ok(start >= 0 && end > start, "input region rebuild function exists");

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gap-resize-regions-"));
  const runtime = path.join(directory, "runtime");
  fs.mkdirSync(runtime, { mode: 0o700 });

  try {
    fs.writeFileSync(path.join(directory, "shell.qml"), `
import QtQuick
import Quickshell

Scope {
    id: root
    property var gaps: []
    property var inputRegions: []
    property int changes: 0
    property bool failed: false

    Region { id: inputRegion; onChanged: root.changes += 1 }
    Component { id: gapRegionComponent; Region {} }

    ${source.slice(start, end)}

    function check(condition, message) {
        if (!condition) {
            failed = true;
            console.log("FAIL: " + message);
        }
    }

    function replaceGaps(nextGaps) {
        changes = 0;
        gaps = nextGaps;
        rebuildInputRegions();
        check(changes > 0, "mask change must be signaled, including an empty workspace");
        check(inputRegion.regions.length === nextGaps.length,
              "old corridors must be removed immediately, before deferred destruction");
    }

    Timer {
        interval: 20
        running: true
        onTriggered: {
            // Alternate a two-window workspace with a one-window workspace.
            for (var i = 0; i < 10; ++i) {
                replaceGaps([{orientation: "vertical", x: 510, y: 30, width: 10, height: 600}]);
                check(inputRegion.regions[0].x === 505, "vertical gap position is preserved");
                check(inputRegion.regions[0].width === 10, "vertical gap thickness is preserved");
                replaceGaps([]);
            }

            // Switching between tiled workspaces must replace, not union, their gaps.
            replaceGaps([{orientation: "horizontal", x: 30, y: 440, width: 900, height: 8}]);
            check(inputRegion.regions[0].y === 436, "horizontal gap position is preserved");
            check(inputRegion.regions[0].height === 8, "horizontal gap thickness is preserved");
            replaceGaps([{orientation: "vertical", x: 710, y: 30, width: 6, height: 600}]);
            check(inputRegion.regions[0].x === 707, "only the new workspace corridor remains");

            Qt.callLater(function() {
                check(inputRegion.regions.length === 1, "deferred destruction preserves the new corridor");
                console.log(root.failed ? "REGIONS_FAILED" : "REGIONS_PASSED");
                Qt.quit();
            });
        }
    }
}
`);

    const result = spawnSync("quickshell", ["--path", directory, "--no-color"], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        XDG_RUNTIME_DIR: runtime,
        QT_QPA_PLATFORM: "offscreen",
        QT_QPA_PLATFORMTHEME: "generic",
        WAYLAND_DISPLAY: "",
      },
    });
    assert.ifError(result.error);
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 0, output);
    assert.match(output, /REGIONS_PASSED/, output);
    assert.doesNotMatch(output, /FAIL:|REGIONS_FAILED/, output);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
