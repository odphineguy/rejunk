# Dispatch Geocoding

## Coordinate Source Of Truth

Dispatch job markers represent the primary customer/service location, never a disposal facility and never a driver position.

Coordinate priority:

1. Primary service location `job_stops.latitude` and `job_stops.longitude`
2. Legacy job-level coordinates if they exist
3. Geocoded primary service address
4. Workload-panel only with a visible unmapped reason

## Address Validation

Unmapped jobs are classified with one reason:

- `not_attempted`
- `missing_street`
- `missing_city`
- `missing_state`
- `missing_zip`
- `incomplete_address`
- `geocode_no_results`
- `geocode_denied`
- `geocode_rate_limited`
- `geocode_failed`
- `coordinates_invalid`

The Dispatch Center shows concise labels such as “Missing ZIP,” “Incomplete address,” or “Geocode failed.”

## Geocoding Flow

The Dispatch Center shows a manual “Geocode missing locations” action when the current workload has unmapped service locations. It processes jobs sequentially to avoid avoidable API pressure, saves successful coordinates to the primary service location, and summarizes mapped/incomplete/failed counts.

## Persistence

Successful geocoding is saved to `job_stops.latitude` and `job_stops.longitude` through the dispatch operational helper. The local coordinate cache remains a read-through fallback for development, failure reasons, and immediate UI refresh, but `job_stops` is the durable source of truth.

When Supabase is unavailable, coordinates are saved to local fallback and marked locally. A future sync queue can promote those writes once connectivity returns.

## API Keys

Google Maps continues to use the existing app setup: `VITE_GOOGLE_MAPS_API_KEY` for browser-safe keys or the server `/maps-proxy` backed by `GOOGLE_MAPS_API_KEY`.

## Repairing A Job

Open the job detail page and use the compact “Service location mapping” section to inspect address status, latitude, longitude, source, re-geocode, or clear coordinates. Re-geocoding asks for confirmation if valid coordinates already exist.

## Future GPS Relationship

Job markers stay fixed at service locations. Future driver GPS should use a separate driver-marker layer. Facility markers should remain fixed at disposal facilities.
