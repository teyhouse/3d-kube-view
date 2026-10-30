# Architecture

```
kubectl ─┬─ get pods, services, controllers, policies, routes, Flux (poll 5s, some cached)
         ├─ exec cilium-agent: hubble observe --follow    (one per agent pod)
         └─ exec tetragon:     tetra getevents            (one per agent pod)
                  │
        Node backend (server/, no dependencies)
        normalize, batch every 250 ms, filter per client, SSE /api/events
                  │
        Browser (src/, Vite and three.js)
        topology → rooms · flows → parcels · process events → flashes and alerts
```

## Backend (`server/`)

| File | Purpose |
| --- | --- |
| `config.js` | `NAMESPACES` allowlist (empty means all), `PORT`, `KUBECTL`, `KUBE_CONTEXT` |
| `kubectl.js` | Run commands, supervise streams with backoff, remote watchdog, stop children on exit |
| `topology.js` | Fetch resources, resolve pod to workload, match services, compute districts |
| `policies.js` | Evaluate Cilium and Kubernetes network policies per pod (cached 30s) |
| `entrypoints.js` | Find entry points for the loading dock and their hostnames (cached 60s) |
| `hubble.js` | Normalize endpoints, drop reasons and L7 details, merge flows into batches |
| `tetragon.js` | Normalize process events, classify alerts |
| `hub.js` | SSE clients, stream lifecycle, per client filter, stream restarts on selection changes |
| `api.js` | Middleware shared by the Vite dev server and the production server |
| `index.js` | Production server, serves `dist/` on `127.0.0.1` |

Streams start with the first browser tab and stop 15 seconds after the last one closes. Clients report their hidden namespaces with `POST /api/selection`. The hub then streams the union of what is visible, with a short overlap and `--last 200` so a newly shown namespace has traffic right away.

## Frontend (`src/`)

| Folder | Purpose |
| --- | --- |
| `core/` | `Stage` (renderer, lights, loop), `CameraRig`, `Picker`, `Highlighter`, `LightPool`, `GpuTimer` |
| `theme/` | Palette, cached materials, canvas textures |
| `objects/` | `NamespaceRoom`, `BeltNetwork`, `Conveyor`, `PodStation`, `WorkloadPad`, `ServiceGate`, `Tube`, `Portal`, `LoadingDock`, `DistrictPlate` |
| `scene/` | `ClusterWorld` (layout, transitions, zoom levels, endpoint lookup), `NodeYard` |
| `traffic/` | `TrafficSystem` (routes, tubes, history, heat, tags), `RoutePath`, `PackageSystem`, `ProcessFx`, `AlertSystem`, `FloatingTags` |
| `data/` | `EventStream`, `Selection`, `Views`, `Timeline`, `FlowFilter` |
| `ui/` | `Hud`, `NamespacePanel`, `AlertFeed`, `TimelineBar`, `PerfMeter`, `LoadingScreen` |

## Startup

`LoadingScreen` covers the scene until the backend is connected, the topology has arrived and the first flows came in. It continues after 8 seconds without traffic for quiet clusters, right after the topology when no namespace is visible, and shows backend and `kubectl` errors while waiting.

## How a flow becomes a parcel

1. Hubble emits a JSON line, which reaches the backend through `kubectl exec`.
2. `hubble.js` normalizes it and merges it into the current 250 ms batch.
3. `hub.js` filters by the client's hidden namespaces and sends it over SSE.
4. `Timeline` records the batch. While live it passes straight on, otherwise it waits for replay.
5. `TrafficSystem` finds or builds the route: legs in room local coordinates, plus tubes between anchors.
6. `PackageSystem` spawns an instanced parcel that follows the legs.

## Why toggling keeps traffic

Room legs are relative to their room, so moving a room moves its belts and parcels with it. On a change, only routes that touch an affected namespace are rebuilt, and `remapProgress` keeps a parcel's position through the shared start and end of the old and new route. Tubes morph to their new endpoints with a GPU morph target and interpolated curve points, using the same progress as the room movement.

## Performance measures

- Parcels and rollers are instanced, gate and pad parts are batched per room.
- Far rooms hide their detail, and parcels on hidden belts or outside the camera are not drawn.
- A fixed pool of four lamps follows the camera, so the shader light count never changes.
- The shadow frustum follows the camera target.
- Parcel transit is capped at 6 seconds and spawning is limited per route.
