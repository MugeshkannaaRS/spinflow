# SpinFlow ERP — Deployment Guide

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Nginx     │────▶│   Frontend   │     │  PostgreSQL  │
│  (SSL/443)  │     │  (React+Serve)│     │             │
│             │     │   :4173      │     │   :5432     │
└─────────────┘     └──────────────┘     └─────────────┘
       │                                        ▲
       │                                        │
       ▼                                        │
┌─────────────┐     ┌──────────────┐            │
│   FastAPI   │────▶│    Redis     │────────────┘
│  :8000      │     │  :6379       │
└─────────────┘     └──────────────┘
```

## Prerequisites

- Docker & Docker Compose v2
- Ubuntu 22.04+ server (or any Linux server)
- Domain name pointing to server IP
- SSL certificate (Let's Encrypt or commercial)

---

## Quick Start (Development)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/spinflow-erp.git
cd spinflow-erp

# 2. Start services
docker compose up -d --build

# 3. Verify
curl http://localhost:8000/api/health

# 4. Access
# Frontend: http://localhost:4173
# API Docs: http://localhost:8000/api/docs
```

---

## Production Deployment (Ubuntu)

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt install docker-compose-plugin -y
```

### Step 2: Clone & Configure

```bash
git clone https://github.com/your-org/spinflow-erp.git /opt/spinflow
cd /opt/spinflow

# Set secure secrets
export SECRET_KEY=$(openssl rand -hex 64)
echo "SECRET_KEY=$SECRET_KEY" >> .env
```

### Step 3: SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com

# Copy certificates for Nginx
sudo mkdir -p ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/key.pem
```

### Step 4: Update Configuration

Edit `docker-compose.yml`:
- Update `SECRET_KEY` environment variable
- Set `CORS_ORIGINS` to your domain
- Update domain in `nginx.conf`

### Step 5: Deploy

```bash
# Build and start all services
docker compose up -d --build

# Check logs
docker compose logs -f

# Verify health
curl https://your-domain.com/api/health
```

### Step 6: SSL Auto-Renewal

```bash
# Add to crontab (sudo crontab -e)
echo "0 3 * * * certbot renew --quiet && docker compose restart nginx" | sudo crontab -
```

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@spinflow.in | demo |
| Mill Owner | owner@spinflow.in | demo |
| General Manager | gm@spinflow.in | demo |
| Production Manager | production@spinflow.in | demo |
| Quality Manager | quality@spinflow.in | demo |
| Dispatch Manager | dispatch@spinflow.in | demo |
| Supervisor | supervisor@spinflow.in | demo |
| Machine Operator | operator@spinflow.in | demo |

---

## Database Backup

```bash
# Manual backup
docker exec spinflow-postgres pg_dump -U spinflow spinflow_db > backup_$(date +%Y%m%d).sql

# Restore
cat backup.sql | docker exec -i spinflow-postgres psql -U spinflow spinflow_db

# Automated daily backup (add to crontab)
0 2 * * * docker exec spinflow-postgres pg_dump -U spinflow spinflow_db > /opt/backups/spinflow_$(date +\%Y\%m\%d).sql && find /opt/backups -name "*.sql" -mtime +30 -delete
```

---

## Monitoring

```bash
# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Check resource usage
docker stats

# PostgreSQL monitoring
docker exec -it spinflow-postgres psql -U spinflow -d spinflow_db -c "SELECT count(*) FROM information_schema.tables;"
```

---

## Scaling

For high-traffic production:

```bash
# Scale backend workers
docker compose up -d --scale backend=3

# Add Redis cluster for sessions
# Add PostgreSQL replication for HA
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Backend can't connect to DB | Check `docker compose logs postgres` |
| CORS errors | Verify `CORS_ORIGINS` in backend env |
| File upload too large | Increase `client_max_body_size` in nginx.conf |
| WebSocket not connecting | Check Nginx WS proxy config |
| SSL expired | Run `certbot renew` and restart nginx |
