# Gap Resize

Gap Resize adds mouse-first resizing to tiled Omarchy workspaces. Move the
pointer into the actual shared gap between two tiled windows: a small
highlighted rail appears only while the pointer is over that gap, and the
cursor becomes the matching bidirectional horizontal or vertical resize
cursor. Drag with the left mouse button to resize the adjacent tiles.

The plugin gives Quickshell input only for the measured shared-gap corridors.
The highlight uses the exact gap thickness and stops where another window
blocks that corridor. Window borders and the rest of the screen remain
click-through, and the service follows Omarchy's current theme accent color.

## Requirements

- Omarchy Quattro / Hyprland 0.56 or newer
- Omarchy Shell / Quickshell
- A tiled Hyprland layout such as `dwindle` or `master`

## Install

After this repository is public:

```sh
omarchy plugin add https://github.com/HappyLDE/OMARCHY-Gap-Resize.git --enable
```

The service disables these runtime Hyprland options while it starts. On Omarchy
Quattro it uses Hyprland's Lua `hl.config` API; on legacy Hyprland it falls
back to `hyprctl keyword`:

```text
general:resize_on_border = false
general:hover_icon_on_border = false
```

No Hyprland configuration file is modified. The service invokes local
`hyprctl` commands to refresh geometry and apply relative window resizing; it
does not access the network or require elevated privileges.

## Usage

1. Open two or more tiled windows.
2. Move the pointer into the actual space between adjacent windows.
3. When the rail and bidirectional resize cursor appear, drag with the left
   mouse button.

Rails are shown only while hovering a real gap between tiled windows on the
active workspace of each monitor. Window borders do not activate the plugin.
Floating, fullscreen, hidden, and pinned surfaces are ignored.

## Remove

```sh
omarchy plugin disable io.github.leosilver.gap-resize
omarchy plugin remove io.github.leosilver.gap-resize --yes
```

The plugin's runtime border-resize settings are not written to a configuration
file. If you want native border resizing again after removal, restore it for
the current session with:

```sh
hyprctl keyword general:resize_on_border true
hyprctl keyword general:hover_icon_on_border true
```

## Validate locally

```sh
omarchy plugin validate .
qmllint -I /usr/share/omarchy/shell Service.qml
node --test tests/geometry.test.js
```

## License

MIT. See [LICENSE](LICENSE).
