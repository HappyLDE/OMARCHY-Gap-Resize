import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import qs.Commons
import "GapGeometry.js" as GapGeometry

Item {
    id: root

    readonly property int maxGap: 56
    readonly property int minOverlap: 24
    // Ignore touching edges and compositor rounding noise. Omarchy's usual
    // three-pixel inner gap is still large enough to be interactive.
    readonly property int minGap: 2
    readonly property color railColor: Color.accent
    property int refreshTick: 0

    function refreshLayout() {
        Hyprland.refreshMonitors();
        Hyprland.refreshWorkspaces();
        Hyprland.refreshToplevels();
        refreshTick += 1;
    }

    function disableNativeBorderResize() {
        // The plugin owns the exact gap-sized input regions. Disable
        // Hyprland's broader border interaction while it is active so the
        // resize cursor cannot appear when the pointer is on a window edge.
        // Try the Lua API first. On legacy Hyprland this command is rejected,
        // and the keyword fallback below supplies the equivalent settings.
        Quickshell.execDetached([
            "hyprctl",
            "eval",
            "hl.config({ general = { resize_on_border = false, hover_icon_on_border = false } })"
        ]);

        if (!Hyprland.usingLua) {
            Quickshell.execDetached(["hyprctl", "keyword", "general:resize_on_border", "false"]);
            Quickshell.execDetached(["hyprctl", "keyword", "general:hover_icon_on_border", "false"]);
        }
    }

    function gapsFor(monitor, tick) {
        // Referencing tick makes this binding refresh after compositor events
        // whose geometry is exposed through lastIpcObject.
        var ignored = tick;
        if (!monitor || !monitor.activeWorkspace) {
            return [];
        }
        return GapGeometry.collect(
            monitor,
            monitor.activeWorkspace.toplevels.values,
            maxGap,
            minOverlap,
            minGap
        );
    }

    function resizeWindow(address, dx, dy) {
        if (!address || (!dx && !dy)) {
            return;
        }

        // Omarchy's Lua parser exposes the window resize dispatcher through
        // hl.dsp.window.resize(). Keep the legacy dispatcher as a fallback
        // for older Hyprland installations.
        Quickshell.execDetached([
            "hyprctl",
            "eval",
            `hl.dispatch(hl.dsp.window.resize({ x = ${dx}, y = ${dy}, relative = true, window = "address:${address}" }))`
        ]);

        if (Hyprland.usingLua) {
            return;
        }

        Quickshell.execDetached([
            "hyprctl",
            "dispatch",
            "resizewindowpixel",
            `${dx} ${dy},address:${address}`
        ]);
    }

    Component.onCompleted: {
        disableNativeBorderResize();
        refreshLayout();
    }

    Connections {
        target: Hyprland
        function onRawEvent(event) {
            // Refresh immediately for layout-changing events; the timer below
            // is a fallback for compositor state that has no matching event.
            var name = event && event.name ? event.name : "";
            if (name === "workspace" || name === "focusedmon" || name === "openwindow" ||
                name === "closewindow" || name === "movewindow" || name === "openlayer" ||
                name === "closelayer" || name === "changefloatingmode" || name === "activewindow") {
                refreshLayout();
            }
        }
    }

    Timer {
        interval: 180
        repeat: true
        running: true
        onTriggered: refreshLayout()
    }

    Variants {
        model: Quickshell.screens

        delegate: Component {
            PanelWindow {
                id: railWindow
                required property var modelData

                readonly property var monitor: Hyprland.monitorFor(modelData)
                property var gaps: []
                property string gapsSignature: ""
                property var inputRegions: []

                screen: modelData
                color: "transparent"
                aboveWindows: true
                focusable: false
                // Use the full output as the coordinate space. The mask below
                // still limits input to the measured gap corridors.
                exclusiveZone: -1
                exclusionMode: ExclusionMode.Ignore
                anchors {
                    left: true
                    right: true
                    top: true
                    bottom: true
                }

                // Only the actual gap rectangles are input regions. Window
                // borders and the rest of the screen remain click-through.
                Region {
                    id: inputRegion
                }

                Component {
                    id: gapRegionComponent
                    Region {}
                }

                function rebuildInputRegions() {
                    for (var i = 0; i < inputRegions.length; ++i) {
                        if (inputRegions[i]) {
                            inputRegions[i].destroy();
                        }
                    }

                    var nextRegions = [];
                    for (var j = 0; j < gaps.length; ++j) {
                        var gap = gaps[j];
                        var region = gapRegionComponent.createObject(null, {
                            x: gap.orientation === "vertical" ? gap.x - gap.width / 2 : gap.x,
                            y: gap.orientation === "horizontal" ? gap.y - gap.height / 2 : gap.y,
                            width: gap.width,
                            height: gap.height
                        });
                        if (region) {
                            inputRegion.regions.push(region);
                            nextRegions.push(region);
                        }
                    }
                    inputRegions = nextRegions;
                }

                function isDragging() {
                    for (var i = 0; i < gapRepeater.count; ++i) {
                        var item = gapRepeater.itemAt(i);
                        if (item && item.dragging) {
                            return true;
                        }
                    }
                    return false;
                }

                function refreshGaps() {
                    if (isDragging()) {
                        return;
                    }

                    // The full-output layer keeps monitor-local gap
                    // coordinates aligned with the visible surface, even
                    // when the bar reserves space in other layer-shell modes.
                    var nextGaps = root.gapsFor(monitor, root.refreshTick);
                    var nextSignature = JSON.stringify(nextGaps);
                    if (nextSignature === gapsSignature) {
                        return;
                    }

                    gapsSignature = nextSignature;
                    gaps = nextGaps;
                }

                mask: inputRegion
                WlrLayershell.layer: WlrLayer.Overlay
                WlrLayershell.namespace: "io.github.leosilver.gap-resize"

                onGapsChanged: rebuildInputRegions()
                Component.onCompleted: {
                    refreshGaps();
                    Qt.callLater(rebuildInputRegions);
                }

                Connections {
                    target: root
                    function onRefreshTickChanged() {
                        railWindow.refreshGaps();
                    }
                }

                Repeater {
                    id: gapRepeater
                    model: railWindow.gaps

                    delegate: Item {
                        required property var modelData

                        x: modelData.orientation === "vertical"
                           ? modelData.x - modelData.width / 2
                           : modelData.x
                        y: modelData.orientation === "horizontal"
                           ? modelData.y - modelData.height / 2
                           : modelData.y
                        width: modelData.orientation === "vertical"
                               ? modelData.width
                               : modelData.width
                        height: modelData.orientation === "horizontal"
                                ? modelData.height
                                : modelData.height
                        property bool dragging: false

                        Rectangle {
                            id: rail
                            anchors.centerIn: parent
                            width: parent.width
                            height: parent.height
                            radius: 0
                            color: root.railColor
                            opacity: parent.dragging
                                     ? 0.5
                                     : mouseArea.containsMouse ? 0.82 : 0

                            Behavior on opacity {
                                NumberAnimation { duration: 80 }
                            }

                        }

                        MouseArea {
                            id: mouseArea
                            anchors.fill: parent
                            hoverEnabled: true
                            acceptedButtons: Qt.LeftButton
                            cursorShape: modelData.orientation === "vertical"
                                         ? Qt.SizeHorCursor
                                         : Qt.SizeVerCursor
                            property real lastX: 0
                            property real lastY: 0

                            onPressed: function(mouse) {
                                parent.dragging = true;
                                lastX = mouse.x;
                                lastY = mouse.y;
                            }

                            onPositionChanged: function(mouse) {
                                if (!parent.dragging) {
                                    return;
                                }

                                var dx = modelData.orientation === "vertical"
                                         ? Math.round(mouse.x - lastX)
                                         : 0;
                                var dy = modelData.orientation === "horizontal"
                                         ? Math.round(mouse.y - lastY)
                                         : 0;
                                lastX = mouse.x;
                                lastY = mouse.y;
                                var factor = modelData.resizeFactor || 1;
                                root.resizeWindow(
                                    modelData.resizeAddress || modelData.firstAddress,
                                    dx * factor,
                                    dy * factor
                                );
                            }

                            onReleased: parent.dragging = false;
                            onCanceled: parent.dragging = false;
                        }
                    }
                }
            }
        }
    }
}
