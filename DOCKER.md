# Docker Commands Summary

This project uses **Docker** and **Docker Compose** for local development and testing.

## Common Commands

### Build & Start Containers
> Builds images (if needed) and starts all services defined in docker-compose.yml.

```bash
docker compose up --build
```

### Start without rebuilding
> Starts existing containers without rebuilding images.

```bash
docker compose up
```

### Stop the Containers
> Stops and removes all running containers, networks, and temporary volumes (not persistent data).

```bash
docker compose down
```

### Rebuild a specific service
> Rebuilds only the specified service image.

```bash
docker compose build <service_name>
```

### View Logs
```bash
docker compose logs -f
```

### Run commands in a container
> Opens a shell in a running container for debugging or direct command execution.

```bash
docker compose exec <service_name> sh
```

### Check container status
> Lists all running services and their current status.

```bash
docker compose ps

# or

docker ps
```

### How to seed the database
```bash
docker compose exec backend sh
```

Then from inside the container
```bash
cd prisma

python seed.py
```

