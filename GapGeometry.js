.pragma library

function finite(value) {
    return typeof value === "number" && isFinite(value);
}

function windowGeometry(toplevel) {
    var data = toplevel && toplevel.lastIpcObject ? toplevel.lastIpcObject : toplevel;
    if (!data || data.mapped === false || data.hidden === true) {
        return null;
    }

    // Floating, fullscreen, and pinned surfaces are not part of a tiled split.
    if (data.floating === true || data.pinned === true || (data.fullscreen && data.fullscreen !== 0)) {
        return null;
    }

    var at = data.at || data.position;
    var size = data.size;
    if (!at || !size || at.length < 2 || size.length < 2) {
        return null;
    }

    var x = Number(at[0]);
    var y = Number(at[1]);
    var width = Number(size[0]);
    var height = Number(size[1]);
    if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width <= 0 || height <= 0) {
        return null;
    }

    return {
        address: data.address || "",
        x: x,
        y: y,
        width: width,
        height: height,
        right: x + width,
        bottom: y + height
    };
}

function overlapStart(a, b) {
    return Math.max(a, b);
}

function overlapEnd(a, b) {
    return Math.min(a, b);
}

function sameCoordinate(a, b) {
    return Math.abs(a - b) < 0.5;
}

function mergeVerticalSegments(segments) {
    var components = [];

    for (var i = 0; i < segments.length; ++i) {
        var segment = segments[i];
        var matching = [];

        for (var c = 0; c < components.length; ++c) {
            var component = components[c];
            var connected = false;
            for (var j = 0; j < component.length; ++j) {
                var existing = component[j];
                if (sameCoordinate(existing.x, segment.x) &&
                    sameCoordinate(existing.width, segment.width) &&
                    (existing.firstAddress === segment.firstAddress ||
                     existing.secondAddress === segment.secondAddress)) {
                    connected = true;
                    break;
                }
            }
            if (connected) {
                matching.push(c);
            }
        }

        if (matching.length === 0) {
            components.push([segment]);
            continue;
        }

        var merged = [segment];
        for (var m = matching.length - 1; m >= 0; --m) {
            merged = merged.concat(components[matching[m]]);
            components.splice(matching[m], 1);
        }
        components.push(merged);
    }

    var result = [];
    for (var componentIndex = 0; componentIndex < components.length; ++componentIndex) {
        var group = components[componentIndex];
        var base = group[0];
        var start = base.y;
        var end = base.y + base.height;
        var first = base.firstAddress;
        var second = base.secondAddress;
        var commonFirst = true;
        var commonSecond = true;

        for (var k = 1; k < group.length; ++k) {
            var item = group[k];
            start = Math.min(start, item.y);
            end = Math.max(end, item.y + item.height);
            commonFirst = commonFirst && item.firstAddress === first;
            commonSecond = commonSecond && item.secondAddress === second;
        }

        var resizeAddress = commonFirst ? first : (commonSecond ? second : first);
        var resizeFactor = commonFirst ? 1 : (commonSecond ? -1 : 1);
        result.push({
            orientation: "vertical",
            x: base.x,
            y: start,
            width: base.width,
            height: end - start,
            firstAddress: first,
            secondAddress: second,
            resizeAddress: resizeAddress,
            resizeFactor: resizeFactor
        });
    }

    return result;
}

function collect(monitor, toplevels, maxGap, minOverlap, minGap) {
    if (!monitor || !toplevels) {
        return [];
    }

    var windows = [];
    for (var i = 0; i < toplevels.length; ++i) {
        var geometry = windowGeometry(toplevels[i]);
        if (geometry && geometry.address) {
            windows.push(geometry);
        }
    }

    var result = [];
    var gapLimit = Math.max(0, Number(maxGap) || 0);
    var overlapLimit = Math.max(1, Number(minOverlap) || 1);
    var gapMinimum = Math.max(1, Number(minGap) || 1);
    var monitorX = Number(monitor.x) || 0;
    var monitorY = Number(monitor.y) || 0;

    for (var leftIndex = 0; leftIndex < windows.length; ++leftIndex) {
        for (var rightIndex = leftIndex + 1; rightIndex < windows.length; ++rightIndex) {
            var a = windows[leftIndex];
            var b = windows[rightIndex];

            // A vertical splitter: one window ends before the other begins.
            var left = a.x <= b.x ? a : b;
            var right = a.x <= b.x ? b : a;
            var verticalGap = right.x - left.right;
            var verticalStart = overlapStart(left.y, right.y);
            var verticalEnd = overlapEnd(left.bottom, right.bottom);
            if (verticalGap >= gapMinimum && verticalGap <= gapLimit && verticalEnd - verticalStart >= overlapLimit) {
                result.push({
                    orientation: "vertical",
                    x: left.right + verticalGap / 2 - monitorX,
                    y: verticalStart - monitorY,
                    width: Math.max(0, verticalGap),
                    height: verticalEnd - verticalStart,
                    firstAddress: left.address,
                    secondAddress: right.address,
                    resizeAddress: left.address,
                    resizeFactor: 1
                });
            }

            // A horizontal splitter: one window ends above the other begins.
            var top = a.y <= b.y ? a : b;
            var bottom = a.y <= b.y ? b : a;
            var horizontalGap = bottom.y - top.bottom;
            var horizontalStart = overlapStart(top.x, bottom.x);
            var horizontalEnd = overlapEnd(top.right, bottom.right);
            if (horizontalGap >= gapMinimum && horizontalGap <= gapLimit && horizontalEnd - horizontalStart >= overlapLimit) {
                result.push({
                    orientation: "horizontal",
                    x: horizontalStart - monitorX,
                    y: top.bottom + horizontalGap / 2 - monitorY,
                    width: horizontalEnd - horizontalStart,
                    height: Math.max(0, horizontalGap),
                    firstAddress: top.address,
                    secondAddress: bottom.address,
                    resizeAddress: top.address,
                    resizeFactor: 1
                });
            }
        }
    }

    var verticalSegments = [];
    var nonVerticalSegments = [];
    for (var resultIndex = 0; resultIndex < result.length; ++resultIndex) {
        if (result[resultIndex].orientation === "vertical") {
            verticalSegments.push(result[resultIndex]);
        } else {
            nonVerticalSegments.push(result[resultIndex]);
        }
    }

    return mergeVerticalSegments(verticalSegments).concat(nonVerticalSegments);
}
