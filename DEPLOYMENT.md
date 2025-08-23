# FaxSign Deployment Guide

This guide will help you deploy the FaxSign application on your company's local server.

## Quick Start (Windows)

### Option 1: Using Installation Script (Recommended)
1. Download all files to your server
2. Double-click `install.bat`
3. Wait for installation to complete
4. Double-click `start.bat` to start the application
5. Access at `http://your-server-ip:3000`

### Option 2: Manual Installation
1. Install Node.js from https://nodejs.org/
2. Open Command Prompt in the project folder
3. Run: `npm install`
4. Run: `npm start`
5. Access at `http://your-server-ip:3000`

## Quick Start (Linux/Mac)

### Option 1: Using Installation Script
1. Download all files to your server
2. Make script executable: `chmod +x install.sh`
3. Run: `./install.sh`
4. Run: `npm start`
5. Access at `http://your-server-ip:3000`

### Option 2: Manual Installation
1. Install Node.js: `sudo apt install nodejs npm` (Ubuntu/Debian)
2. Open terminal in the project folder
3. Run: `npm install`
4. Run: `npm start`
5. Access at `http://your-server-ip:3000`

## Server Configuration

### Port Configuration
- Default port: 3000
- To change port, edit `config.js` or set environment variable:
  ```bash
  export PORT=8080
  npm start
  ```

### Database Location
- Database file: `faxsign.db` (created automatically)
- Upload directory: `uploads/` (created automatically)
- Both are stored in the project root directory

### Security Settings
- JWT Secret: Change in `config.js` for production
- Default admin: admin/admin123 (change after first login)

## Network Access

### Local Network Access
- Other computers on the same network can access via:
  `http://your-server-ip:3000`

### Firewall Configuration
- Windows: Allow Node.js through Windows Firewall
- Linux: Open port 3000: `sudo ufw allow 3000`

### Production Considerations
1. Use HTTPS (SSL certificates)
2. Change default admin password
3. Use a process manager (PM2)
4. Set up regular database backups
5. Configure reverse proxy (nginx)

## Process Management

### Using PM2 (Recommended for Production)
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name "faxsign"

# Auto-start on boot
pm2 startup
pm2 save

# Monitor
pm2 status
pm2 logs faxsign
```

### Using Systemd (Linux)
Create `/etc/systemd/system/faxsign.service`:
```ini
[Unit]
Description=FaxSign Application
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/faxsign
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable faxsign
sudo systemctl start faxsign
sudo systemctl status faxsign
```

## Backup and Maintenance

### Database Backup
```bash
# Backup database
cp faxsign.db faxsign_backup_$(date +%Y%m%d).db

# Backup uploads
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz uploads/
```

### Automated Backup Script
Create `backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp faxsign.db $BACKUP_DIR/faxsign_$DATE.db

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz uploads/

# Keep only last 7 days
find $BACKUP_DIR -name "faxsign_*.db" -mtime +7 -delete
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Log Rotation
Add to `/etc/logrotate.d/faxsign`:
```
/path/to/faxsign/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    create 644 your-user your-group
}
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port 3000
   netstat -ano | findstr :3000
   # Kill process
   taskkill /PID <process_id> /F
   ```

2. **Permission Denied**
   ```bash
   # Linux/Mac
   chmod +x install.sh
   chmod +x start.sh
   ```

3. **Database Locked**
   ```bash
   # Stop application
   npm stop
   # Wait a few seconds
   npm start
   ```

4. **Upload Directory Issues**
   ```bash
   # Create uploads directory manually
   mkdir uploads
   chmod 755 uploads
   ```

### Logs
- Application logs appear in the terminal
- Check browser console for frontend errors
- Database errors are logged to console

### Performance
- For high usage, consider:
  - Using a reverse proxy (nginx)
  - Implementing caching
  - Using a more robust database (PostgreSQL)
  - Load balancing for multiple instances

## Support

For issues:
1. Check the troubleshooting section
2. Review application logs
3. Check browser console for errors
4. Ensure all dependencies are installed
5. Verify network connectivity

## Security Checklist

- [ ] Change default admin password
- [ ] Update JWT secret in config.js
- [ ] Configure firewall rules
- [ ] Use HTTPS in production
- [ ] Regular security updates
- [ ] Database backups
- [ ] Access logging
- [ ] Input validation (already implemented)
- [ ] File upload restrictions (already implemented)
