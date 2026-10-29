# 3D Kube View: Plan

A live, explorable 3D diorama of a Kubernetes cluster, rendered with three.js and fed by `kubectl`, Cilium Hubble (network flows) and Tetragon (runtime/process events).

## Visual Direction

Inspired by isometric "factory diorama" scenes: solid, rounded primitives, a small harmonious palette, soft shadows and warm lamp glow.

- Palette: deep purple void, lavender floors and walls, dark violet accents, coral rollers, hazard stripes (yellow/dark), pastel parcels (lime, pink, baby blue, peach).
- Materials: `MeshStandardMaterial`, high roughness, no metalness, lit by a hemisphere light, one shadow casting sun, a soft `RoomEnvironment` for subtle reflections, and one warm point light per room.
- Geometry: `RoundedBoxGeometry` everywhere, cylinders for rollers, icosahedron for the internet globe. Text is rendered into canvas textures (Fredoka font, bundled locally).
- Perspective camera with a narrow FOV (32°) to get a near isometric look while still allowing free flight.

## Metaphor (Abstraction)

| Kubernetes / Cilium concept | 3D representation |
| --- | --- |
| Cluster | A floating campus of dioramas in a purple void |
| Namespace | A diorama room: thick floor slab, two walls, big index number and name painted on the wall, a hatch in the back wall |
| Workload (Deployment, StatefulSet, DaemonSet, Job, bare Pod) | A hazard striped pad with a tilted name sign (like the "APPLICATION" crate pen) |
| Pod | A machine/station standing on its workload pad, body height by container count, color by status, lamp on top |
| Service | A gate arch near the front of the room |
| Flow inside a namespace | A parcel riding a conveyor belt (red rollers on pillars) between two stations |
| Flow leaving/entering a namespace | Parcel rides a belt to the back wall hatch, then a translucent tube to another room or portal |
| `reserved:world` | Floating low poly globe ("Internet") |
| `reserved:host`, kube-apiserver, remote nodes | Floating server rack ("Node / Host") |
| Namespace that is not rendered in detail | Mini ghost diorama portal |
| Parcel color | Protocol: TCP lime, UDP baby blue, HTTP pink, DNS blue, ICMP peach |
| Dropped flow (policy deny) | Red parcel that falls off the belt halfway |
| Reply traffic | Smaller parcel travelling back on the same belt |
| Tetragon process exec / kprobe | Station lamp flashes, binary name floats up as a label |
| Tetragon process exit | Short dim lamp flash |

### Zoom levels

Zoom is the core interaction. The plan is a semantic zoom with three levels:

1. **Cluster** (far): rooms are compact blocks with large wall labels, traffic shows as tube activity between rooms and portals. Later: aggregate parcels per edge, hide belts and pod labels.
2. **Namespace** (mid, the PoC focus): workloads, pods, services, belts and parcels are all visible.
3. **Pod** (close): station details, containers as stacked modules, live Tetragon process list, per pod connection list in the side panel.

Navigation: click to select, double click or number keys to fly into a room or station, `Esc` to fly back to the overview, bottom pill to step through namespaces.

## Architecture

```
kubectl ──┬─ get pods,svc,deploy,... (poll 5s) ──┐
          ├─ exec cilium-agent: hubble observe ──┤   Node backend (server/)
          └─ exec tetragon: tetra getevents ─────┘   normalize, batch (250ms), SSE /api/events
                                                         │
                                                         ▼
                                     Browser (src/) three.js scene + HUD
```

### Backend (`server/`, plain Node, zero dependencies)

- `config.js`: optional namespace allowlist (`NAMESPACES`, empty means all), port, kubectl binary and context via env vars.
- `kubectl.js`: run commands, stream lines, supervise long running streams with backoff restart.
- `topology.js`: one `kubectl get ... -A` call plus `kubectl get namespaces`, grouped per namespace, resolve pod to workload via owner references, match service selectors.
- `hubble.js`: one `hubble observe --follow -o json` per cilium agent pod (multi node ready), `--all-namespaces` or per namespace filters, normalize endpoints (pod, namespace, world, host), coalesce into batches keyed by src/dst/proto/port/verdict.
- `tetragon.js`: one `tetra getevents -o json` per tetragon pod, normalize exec/exit/kprobe events, batch.
- `hub.js`: SSE client registry, starts streams on first client, stops them after an idle grace period, sends a snapshot (config, topology, status) to new clients.
- `api.js`: HTTP middleware shared by the Vite dev server (plugin) and the production server.
- `index.js`: production server serving `dist/` plus the API on `127.0.0.1`.

### Frontend (`src/`, Vite + three.js)

- `core/`: `Stage` (renderer, lights, camera following shadow map, loop), `CameraRig` (orbit + WASD/QE/RF flight + animated focus), `Picker` (hover/click/double click raycasting), `LightPool` (fixed set of warm room lamps that follow the camera, so the shader light count stays constant).
- `theme/`: palette, cached materials, canvas textures (labels, hazard stripes).
- `objects/`: reusable primitives and scene props: `NamespaceRoom`, `WorkloadPad`, `PodStation`, `ServiceGate`, `Conveyor`, `Tube`, `Portal`.
- `scene/ClusterWorld`: incremental room updates (only changed namespaces rebuild), grid campus layout, portal slots, resolves flow endpoints to 3D anchors, describes picked objects.
- `traffic/`: `PackageSystem` (pooled parcels moving along curve paths), `TrafficSystem` (routes flows to belts and tubes, lazily builds and garbage collects them), `ProcessFx` (Tetragon effects).
- `data/`: `EventStream` (SSE client), `Selection` (visible namespaces, persisted in localStorage as a hidden list so new namespaces show up by default).
- `ui/`: `Hud` (status chips, live stats, event log, details panel, tooltip, namespace pill), `NamespacePanel` (toggle list, presets, search, activity dots).

## Phase 1: PoC

- [x] Project setup (Vite, three.js, Node backend, single `npm run dev`)
- [x] Two namespaces (`cloudflared`, `cloudflare-www`), configurable via `NAMESPACES`
- [x] Topology polling, Hubble and Tetragon streaming via `kubectl`
- [x] Diorama rooms, workload pads, pod stations, service gates
- [x] Parcels on conveyor belts and tubes, portals for world/host/other namespaces
- [x] Tetragon lamp flashes and floating process labels
- [x] Mouse + keyboard navigation, focus flights, selection details

## Phase 1.5: All namespaces + selection (this iteration)

- [x] Discover all namespaces by default, `NAMESPACES` becomes an optional allowlist
- [x] Single `-A` topology fetch, Hubble `--all-namespaces`, Tetragon unfiltered
- [x] Grid campus layout (rows of `ceil(sqrt(n))` rooms, back walls aligned), stable room numbers from the sorted namespace list
- [x] Namespace panel: per namespace toggle, presets (All, With pods, None), search filter, pod count, live activity dot, double click to fly there, `N` to collapse
- [x] Selection persisted in localStorage, overview re-frames to the visible rooms
- [x] Hidden namespaces collapse into ghost portals only when a visible room talks to them; traffic between two hidden namespaces is ignored
- [x] Incremental topology updates: unchanged rooms are kept, a changed room only drops its own belts and routes
- [x] Constant cost lighting: 4 pooled point lights near the camera, shadow frustum follows the camera target

## Status (TL;DR)

**Works today:** all 30 namespaces / 65 pods of the cluster as a live campus, real Hubble flows as parcels on belts and tubes, Tetragon exec/kprobe events as lamp flashes and labels, namespace toggling with persistence, fly/orbit navigation, details on click, headless screenshot tooling.

**Missing / rough:**

- Performance headroom: at ~600 flows/s the parcel pool (700) saturates; every block is its own mesh (~1000+ draw calls). Needs instancing and per edge aggregation.
- No semantic zoom yet: full detail is rendered at every distance.
- Tubes and belts are straight/arc geometry without collision avoidance: belts clip machines, tubes pass through rooms in front rows, walls can block the camera.
- Services are decorative: traffic does not route through the gate yet.
- No grouping of namespaces (labels, Flux kustomization), order is alphabetical.
- Server streams everything to the browser; selection is client side only.
- No policies, no L7 details, no alerts, no pause/replay.
- Multi node untested (streams are per agent pod, but there is no node layer).

## Phase 2: Make it feel alive

- Animated rollers / belt texture scroll, parcels bunching at the hatch, small bounce on arrival.
- Route flows to Services through the gate using Hubble `destination_service`.
- Belt routing that avoids stations (orthogonal belts with corner pieces, multiple belt heights).
- Hover highlighting (outline or emissive lift), selection ring.
- Fade or cut away walls that block the camera.
- Pod lifecycle animations: stations rising out of the floor on create, sinking on delete, shaking on restart.

## Phase 3: Scale and structure

- Group rooms into districts by label or Flux kustomization, district labels on the ground.
- Semantic zoom/LOD: aggregate traffic at cluster level (one fat parcel per edge per second), detail only for rooms near the camera.
- `InstancedMesh` for parcels, rollers and repeated machine parts, pooled labels, frustum based throttling.
- Server side selection: the client sends its visible namespaces, the hub only forwards relevant flows and restarts Hubble with matching filters.
- Saved views (named selections + camera bookmarks) in addition to the presets.
- Nodes as a lower layer ("basement") showing pod placement for multi node clusters.

## Phase 4: Insight features

- Cilium NetworkPolicies as walls/fences on the room, drops shown with a "reason" sign (Hubble `drop_reason_desc`).
- L7 visibility: HTTP method/status as parcel stickers, DNS queries as floating tags.
- Tetragon TracingPolicies: file access, network connect, privileged exec as alert beacons, with an alert feed.
- Search and filters (namespace, pod, protocol, verdict), pause and time scrub (ring buffer replay).
- Edge metrics: throughput heat on belts, latency from Hubble L7 flows.

## Open Questions

- Should rooms be grouped by team/app (labels) or by Flux kustomization?
- How to visualize ingress (envoy-gateway, cloudflared tunnel) as a dedicated "loading dock" entry point?
- Reply traffic: show it, merge it, or make it a toggle?
- Should the app run in cluster later (ServiceAccount + Hubble Relay gRPC) instead of using `kubectl exec`?

## Running

```bash
./start.sh
./start.sh dev
NAMESPACES=auth,homer,whoami ./start.sh   # optional allowlist, default is all namespaces
KUBE_CONTEXT=my-context PORT=9000 ./start.sh
```

`./start.sh` checks kubectl and cluster reachability, installs dependencies if needed, builds and serves on http://127.0.0.1:8080. `./start.sh dev` runs Vite with hot reload on http://127.0.0.1:5173.

### Visual checks

A headless Chromium lives in `.browser/` (gitignored, including the missing system libs, so no root is needed).

```bash
npm run setup:browser
npm run screenshot
npm run screenshot -- http://127.0.0.1:8080/
```

Screenshots of the overview and every room land in `screenshots/`.

Controls: `WASD`/arrows pan, `Q`/`E` rotate, `R`/`F` or mouse wheel zoom, `Shift` faster, left drag orbit, right drag pan, click select, double click focus, `1`-`9` jump to the n-th visible namespace, `N` toggle namespace panel, `Esc` overview.
