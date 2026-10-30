# Design

## Visual direction

An isometric factory diorama: solid rounded primitives, a small harmonious palette, soft shadows and warm lamp glow.

- Palette: deep purple void, lavender floors and walls, dark violet accents, coral rollers, yellow and dark hazard stripes, pastel parcels, peach for the loading dock. Colors live in `src/theme/palette.js`.
- Materials: `MeshStandardMaterial` with high roughness and no metalness. Light comes from a hemisphere light, one shadow casting sun, a soft `RoomEnvironment` and warm lamps near the camera.
- Geometry: `RoundedBoxGeometry` nearly everywhere. Text is drawn into canvas textures with the bundled Fredoka font.
- Camera: perspective with a narrow 32 degree field of view, which looks nearly isometric but still allows free flight.

## Mapping

| Cluster | Scene |
| --- | --- |
| Cluster | Floating campus in a purple void |
| Top level Flux path | District plate on the ground |
| Namespace | Diorama room with floor, two walls, number and name, and a hatch in the back wall |
| Workload | Hazard striped pad with a tilted name sign |
| Network policy | Fence around the pad: green restricts both directions, blue ingress only, peach egress only, none means not fully restricted |
| Pod | Machine with a lamp, height by container count, color by status |
| Service | Tall gate arch near the front of the room, service traffic rides through it |
| Entry point (LoadBalancer, NodePort, Gateway, tunnel) | Bay of the loading dock with a sign |
| Node | Plate in the node yard with one block per pod, colored by namespace |
| Flow inside a room | Parcel on the belt network |
| Flow between rooms | Parcel leaves through the hatch and rides a translucent tube |
| Flow between the Internet and an entry point | Parcel passes through the bay of the loading dock |
| Internet, node or host | Floating globe, floating server rack |
| Hidden namespace | Small ghost diorama, only if a visible room talks to it |

### Traffic

| Signal | Scene |
| --- | --- |
| Protocol | Parcel color: TCP lime, UDP light blue, HTTP pink, DNS blue, ICMP peach |
| Dropped flow | Red parcel falls off the belt, sign with the drop reason |
| Reply | Smaller parcel in the opposite direction, can be hidden in the legend |
| DNS query, HTTP request | Floating tag, red when it failed |
| Throughput | Belts glow, tubes warm up and get more opaque (log scale) |
| Tetragon exec or kprobe | Lamp flash and floating name |
| TracingPolicy event | Red beacon, entry in the alert feed |
| Exec with `CAP_SYS_ADMIN` | Yellow beacon, entry in the alert feed |

## Zoom levels

1. **Cluster (far):** a room shows one block per pod and a name tag. Traffic is aggregated into one fat parcel per route per second, and replies are skipped.
2. **Namespace (near):** machines, belts, gates and all parcels are visible. The level depends on the projected room size, with hysteresis.
3. **Pod (selected):** the side panel shows live connections, recent DNS and HTTP, recent processes and policies.

## Belt network

Each room has a trunk along the back wall, columns in the aisles between machines and a lane behind the gates. Lanes grow on demand and disappear after two idle minutes. Belts run in the aisles so lamps and labels stay visible. Pillars avoid machines, signs and gates.
