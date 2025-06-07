# OSM Diff State Finder service with Web UI

A web service to find OpenStreetMap replication state files by timestamp. This service helps you locate the correct state file for a specific point in time, which is useful for setting up replication or finding historical OSM data.

## Usage

### Web Interface

Visit the web interface and fill out the form with:

1. Period (minute/hour/day)
2. Timestamp (ISO 8601 format in UTC)
3. Optional replication URL (defaults to planet.openstreetmap.org)
   - When you enter a custom replication URL, an additional option appears to specify if the URL follows OSM-like structure
   - Toggle "OSM Like" if your URL follows planet.osm.org structure
   - Toggle off "OSM Like" for other sources (e.g., geofabrik)

The results will display:

- State file URL (with a copy button)
- Timestamp and sequence number
- Warning messages if applicable
- State file contents in a collapsible section

### API Usage

The service provides a REST API endpoint that can be queried using tools like `curl` or `wget`.

#### Endpoints

```html
GET /api/find-state?period=<period>&timestamp=<timestamp>[&replicationUrl=<url>][&fetchContent=<bool>][&likeOsm=<bool>]

POST /api/find-state
Content-Type: application/json

GET /health
```

#### Request Parameters for /api/find-state

Parameters can be provided either as query parameters (GET) or in the request body (POST):

Required parameters:

- `period`: The replication period. Must be one of:
  - `minute`: For minute-by-minute diffs
  - `hour`: For hourly diffs
  - `day`: For daily diffs
- `timestamp`: ISO 8601 timestamp (e.g., "2025-05-15T14:30:00Z")

Optional parameters:

- `replicationUrl`: Base URL for replication directory
  - Default: <https://planet.osm.org/replication/>
  - Must include trailing slash
- `likeOsm`: Boolean flag to control URL structure
  - Default: true
  - When true, adds period (minute/hour/day) to URL path (for planet.osm.org style URLs)
  - When false, uses provided URL as-is (for custom replication servers like geofabrik)
- `fetchContent`: Boolean flag to include state file contents in response
  - Default: false
  - When true, the API will fetch and return the contents of the state file

#### Error Handling

The API uses HTTP status codes to indicate the result of the request:

- 200 OK: Request successful
- 400 Bad Request: Client error (invalid parameters)
- 500 Internal Server Error: Server-side error

#### Examples

1. Find minute state file for exact timestamp (GET):

    ```bash
    curl "http://localhost:3000/api/find-state?period=minute&timestamp=2025-05-15T14:30:00Z"
    ```

2. Find hour state file with content (GET):

    ```bash
    curl "http://localhost:3000/api/find-state?period=hour&timestamp=2025-05-15T14:00:00Z&fetchContent=true"
    ```

3. Find state file from custom replication server with OSM-like structure (GET):

    ```bash
    curl "http://localhost:3000/api/find-state?period=day&timestamp=2025-05-15T00:00:00Z&replicationUrl=https://planet.osm.org/replication/&likeOsm=true"
    ```

4. Find state file from Geofabrik updates (non-OSM structure) (GET):

    ```bash
    curl "http://localhost:3000/api/find-state?period=day&timestamp=2025-05-15T00:00:00Z&replicationUrl=https://download.geofabrik.de/europe/germany/berlin-updates/&likeOsm=false"
    ```

5. Using POST:

    ```bash
    curl -X POST "http://localhost:3000/api/find-state" \
      -H "Content-Type: application/json" \
      -d '{
        "period": "minute",
        "timestamp": "2025-05-15T14:30:00Z"
      }'
    ```

6. Find hour state file with content:

    ```bash
    curl -X POST "http://localhost:3000/api/find-state" \
      -H "Content-Type: application/json" \
      -d '{
        "period": "hour",
        "timestamp": "2025-05-15T14:00:00Z",
        "fetchContent": true
      }'
    ```

7. Find state file with custom URL structure (POST):

    ```bash
    curl -X POST "http://localhost:3000/api/find-state" \
      -H "Content-Type: application/json" \
      -d '{
        "period": "day",
        "timestamp": "2025-05-15T00:00:00Z",
        "replicationUrl": "https://download.geofabrik.de/europe/germany/berlin-updates/",
        "likeOsm": false
      }'
    ```

8. Check server health:

    ```bash
    curl http://localhost:3000/health
    ```

Using `wget`:

```bash
wget -qO- --header="Content-Type: application/json" \
  --post-data='{"period":"day","timestamp":"2025-05-15T00:00:00Z"}' \
  http://localhost:3000/api/find-state
```

#### Response Format

Success response (200 OK):

1. Basic response:

    ```json
    {
      "status": 200,
      "url": "https://planet.osm.org/replication/minute/006/600/442.state.txt",
      "timestamp": "2025-05-15T14:27:47Z",
      "sequenceNumber": 6600442
    }
    ```

2. Response with warning:

    ```json
    {
      "status": 404,
      "url": "https://planet.osm.org/replication/minute/006/632/680.state.txt",
      "timestamp": "2025-06-07T11:14:30Z",
      "sequenceNumber": 6632680,
      "error": "State file not found: the requested time 2025-06-07T11:15:21Z is 0 minutes and 51 seconds ahead of the latest available state (2025-06-07T11:14:30Z)",
      "warning": "Using latest available state file (2025-06-07T11:14:30Z)"
    }
    ```

3. Response with content:

    ```json
    {
      "status": 200,
      "url": "https://planet.osm.org/replication/hour/000/111/079.state.txt",
      "sequenceNumber": 111079,
      "timestamp": "2025-05-15T14:00:00Z",
      "contents": "#Thu May 15 14:02:07 UTC 2025\nsequenceNumber=111079\ntimestamp=2025-05-15T14\\:00\\:00Z\n"
    }
    ```

Response fields:

- `url` (string): The URL to the state file
- `timestamp` (string): The timestamp of the found state file in ISO 8601 format
- `warning` (string, optional): Warning message for special cases:
  - Future timestamp: "Requested time {timestamp} is in the future..."
  - Recent minute diff: "Requested time is very recent..."
  - Current period: "Requested time is in the current {period}..."
- `contents` (string, optional): State file contents when fetchContent=true

Error response (400 Bad Request):

```json
{
    "error": "Invalid timestamp format"
}
```

Possible error messages:

- `Invalid timestamp format`: Timestamp not in ISO 8601 format
- `Invalid period. Must be one of: minute, hour, day`
- `Missing required parameters: period and timestamp are required`
- `No suitable state file found for {timestamp}`
- `Failed to get current state`: Could not fetch current state.txt
- `Failed to fetch state file: {status code}`: Network or server error

Health check response (200 OK):

```json
{
  "status": 200,
  "message": "OK"
}
```

<!-- #### Rate Limiting

The API implements rate limiting to prevent abuse:

- Window: 15 minutes (configurable via RATE_LIMIT_WINDOW)
- Max requests: 100 per window (configurable via RATE_LIMIT_MAX)
- Scope: Per IP address

When rate limit is exceeded, the API returns 429 Too Many Requests with:

```json
{
    "error": "Too many requests, please try again later"
}
``` -->

## Development Setup

### Prerequisites

- Node.js >= 18
- npm or yarn
- git

### Install Dependencies

```bash
# Clone the repository
git clone https://github.com/Andygol/osm-diff-state-svc.git
cd osm-diff-state-svc

# Install dependencies
npm install
```

### Environment Configuration

Create a `.env` file in the root directory:

```bash
# Required environment variables
PORT=3000
NODE_ENV=development
VITE_DEFAULT_REPLICATION_URL=https://planet.openstreetmap.org/replication/
```

<!--
```bash
# Required environment variables
PORT=3000
NODE_ENV=development
VITE_DEFAULT_REPLICATION_URL=https://planet.openstreetmap.org/replication/

# Optional rate limiting configuration
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
``` -->

All environment variables:

- `PORT` (required): Server port (default: 3000)
- `NODE_ENV`: Runtime environment, affects static file serving and error reporting
  - `development`: Enables development features
  - `production`: Optimizes for production use
  - Default: development
- `VITE_DEFAULT_REPLICATION_URL`: Default OSM replication server URL
  - Must include trailing slash
  - Default: <https://planet.openstreetmap.org/replication/>
<!-- - `RATE_LIMIT_WINDOW`: Rate limiting window in minutes (default: 15)
- `RATE_LIMIT_MAX`: Maximum requests per window (default: 100) -->

### Development Mode

The project uses Vite for frontend development and nodemon for API development. Both servers can run concurrently:

```bash
# Terminal 1 - Start API server with hot reload
npm run dev:api

# Terminal 2 - Start Vite dev server
npm run dev:frontend

# Or run both with concurrently
npm run dev
```

Development URLs:

- Frontend: <http://localhost:5173>
- API: <http://localhost:3000/api/find-state>
- Health check: <http://localhost:3000/health>

### Production Mode

For production deployment:

```bash
# Install production dependencies only
npm ci --production

# Build frontend assets
npm run build

# Start production server
NODE_ENV=production npm start
```

The production server will be available at <http://localhost:3000>

<!-- ### Docker Deployment

The project includes Docker support for containerized deployment:

1. Using docker build/run:

   ```bash
   # Build the image
   docker build -t osm-diff-state .

   # Run the container
   docker run -d \
    -p 3000:3000 \
    -e NODE_ENV=production \
    -e PORT=3000 \
    --name osm-diff-state \
    osm-diff-state
   ```

2. Using Docker Compose:

   ```bash
   # Start services
   docker-compose up -d

   # View logs
   docker-compose logs -f

   # Stop services
   docker-compose down
   ```

The Docker setup includes:

- Multi-stage build to minimize image size
- Non-root user for security
- Health checks
- Proper signal handling
- Volume for persistent data
- Security best practices -->

### Health Monitoring

The service includes a health check endpoint for monitoring:

```bash
# Using curl
curl http://localhost:3000/health

# Using wget
wget -qO- http://localhost:3000/health

# In a browser
open http://localhost:3000/health
```

Health check features:

- Returns 200 OK when service is healthy
- Checks API server status
- Fast response (no external dependencies)
- Suitable for Docker health checks
