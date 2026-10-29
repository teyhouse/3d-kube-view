# 3D Kube View

A live, explorable 3D diorama of a Kubernetes cluster built with three.js. Namespaces are rooms, pods are machines, and real network flows from Cilium Hubble travel as parcels on conveyor belts. Tetragon process events light up the machines as they happen.

![Cluster overview](assets/overview.png)

![Namespace close-up](assets/room.png)

## How it maps

| Cluster | Scene |
| --- | --- |
| Namespace | Diorama room with its number and name on the wall |
| Workload | Hazard striped pad with a name sign |
| Pod | Machine with a lamp, color shows status |
| Service | Gate arch |
| Flow | Parcel on a belt (inside a room) or through a tube (between rooms) |
| Internet, node/host, hidden namespace | Floating portals |
| Tetragon exec / kprobe | Lamp flash and floating process name |

Parcel colors: TCP lime, UDP blue, HTTP pink, ICMP peach, dropped red (falls off the belt).

## Requirements

- Node.js 20+
- `kubectl` with a working context
- Cilium with Hubble enabled, Tetragon (optional, process events)

All data comes from `kubectl`: `get` for topology, `exec` into the Cilium agents for `hubble observe` and into the Tetragon pods for `tetra getevents`. Nothing is installed into the cluster.

## Run

```bash
./start.sh                                   # build and serve on http://127.0.0.1:8080
./start.sh dev                               # Vite with hot reload on http://127.0.0.1:5173
NAMESPACES=auth,whoami ./start.sh            # optional allowlist, default is all namespaces
KUBE_CONTEXT=my-ctx PORT=9000 ./start.sh
```

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows | Pan |
| `Q` / `E` | Rotate |
| `R` / `F`, mouse wheel | Zoom |
| `Shift` | Faster |
| Left / right drag | Orbit / pan |
| Click | Show details |
| Double click, `1`-`9` | Fly to object or namespace |
| `N` | Toggle namespace panel |
| `Esc` | Back to overview |

The namespace panel lets you show all namespaces or toggle a selection (presets, search, live activity dots). The selection is stored in the browser.

## Project layout

```
server/   Node backend (no dependencies): kubectl wrappers, topology, Hubble and Tetragon streams, SSE hub
src/      three.js frontend
  core/     renderer, camera rig, picking, light pool
  objects/  rooms, pods, gates, belts, tubes, portals
  scene/    campus layout and endpoint resolution
  traffic/  parcels, routing, Tetragon effects
  ui/       HUD and namespace panel
  theme/    palette, materials, canvas textures
scripts/  headless browser setup and screenshots
```

## Screenshots

A local headless Chromium (in `.browser/`, gitignored) renders the app for visual checks:

```bash
npm run setup:browser
npm run screenshot -- http://127.0.0.1:8080/
```

## Roadmap

See [plan.md](plan.md) for the design, current status and next phases.
