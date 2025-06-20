
# Interfast Media Backend

Backend API untuk sistem manajemen MikroTik Interfast Media.

## Fitur

### 1. Manajemen Koneksi
- **Test Connection**: Tes koneksi ke MikroTik router
- **System Identity**: Mendapatkan identitas sistem MikroTik
- **System Resource**: Monitoring resource sistem
- **System Clock**: Informasi waktu sistem

### 2. Manajemen User
- **Update User Status**: Mengubah status user (Active/Inactive/Terminate)
- **Regenerate Credentials**: Membuat ulang username dan password
- **Create PPP Secret**: Membuat secret PPP baru
- **Remove User**: Menghapus user dan koneksi aktifnya

### 3. Manajemen Interface
- **Get Interfaces**: Mendapatkan daftar semua interface
- **Interface Details**: Detail interface spesifik
- **Enable/Disable Interface**: Mengaktifkan/menonaktifkan interface

### 4. Manajemen PPP
- **PPP Secrets**: Manajemen secret PPP
- **Active Connections**: Monitoring koneksi aktif
- **PPP Profiles**: Manajemen profil PPP
- **CRUD Operations**: Create, Read, Update, Delete secret PPP

### 5. Manajemen Wireless
- **Wireless Interfaces**: Daftar interface wireless
- **Security Profiles**: Profil keamanan wireless
- **Registration Table**: Tabel registrasi wireless
- **Wireless Scan**: Scanning jaringan wireless

### 6. Manajemen IP
- **IP Addresses**: Manajemen alamat IP
- **Routes**: Manajemen routing
- **DNS Settings**: Pengaturan DNS
- **DHCP Servers**: Manajemen server DHCP
- **Firewall Rules**: Aturan firewall

### 7. Manajemen Queue
- **Simple Queues**: Manajemen simple queue
- **Queue Tree**: Manajemen queue tree
- **CRUD Operations**: Create, Read, Update, Delete queue

### 8. Monitoring
- **Interface Traffic**: Monitoring traffic interface
- **System Resource**: Monitoring resource sistem
- **System Log**: Log sistem MikroTik

## Instalasi

1. Clone repository:
```bash
git clone <repository-url>
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Setup environment variables:
```bash
cp .env.example .env
```

4. Edit file `.env` dengan konfigurasi MikroTik Anda:
```env
MIKROTIK_IP=103.160.69.149
MIKROTIK_PORT=172
MIKROTIK_USERNAME=admin-remote
MIKROTIK_PASSWORD=@AdminInterfast69
```

5. Jalankan server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Connection & System
- `GET /api/mikrotik/test-connection` - Test koneksi MikroTik
- `GET /api/mikrotik/system/identity` - System identity
- `GET /api/mikrotik/system/resource` - System resource
- `GET /api/mikrotik/system/clock` - System clock

### User Management
- `POST /api/mikrotik/user/update-status` - Update status user
- `POST /api/mikrotik/user/regenerate-credentials` - Regenerate credentials
- `POST /api/mikrotik/user/create-secret` - Create PPP secret
- `DELETE /api/mikrotik/user/:username` - Remove user

### Interface Management
- `GET /api/mikrotik/interfaces` - Daftar interface
- `GET /api/mikrotik/interfaces/:name` - Detail interface
- `POST /api/mikrotik/interfaces/:name/enable` - Enable interface
- `POST /api/mikrotik/interfaces/:name/disable` - Disable interface

### PPP Management
- `GET /api/mikrotik/ppp/secrets` - Daftar PPP secrets
- `GET /api/mikrotik/ppp/active` - Koneksi PPP aktif
- `GET /api/mikrotik/ppp/profiles` - PPP profiles
- `POST /api/mikrotik/ppp/secret` - Create PPP secret
- `PUT /api/mikrotik/ppp/secret/:name` - Update PPP secret
- `DELETE /api/mikrotik/ppp/secret/:name` - Delete PPP secret
- `POST /api/mikrotik/ppp/active/:id/remove` - Remove active connection

### Wireless Management
- `GET /api/mikrotik/wireless/interfaces` - Wireless interfaces
- `GET /api/mikrotik/wireless/security-profiles` - Security profiles
- `GET /api/mikrotik/wireless/registration-table` - Registration table
- `POST /api/mikrotik/wireless/scan/:interface` - Wireless scan

### IP Management
- `GET /api/mikrotik/ip/addresses` - IP addresses
- `GET /api/mikrotik/ip/routes` - Routes
- `GET /api/mikrotik/ip/dns` - DNS settings
- `GET /api/mikrotik/ip/dhcp-server` - DHCP servers
- `GET /api/mikrotik/ip/firewall/rules` - Firewall rules

### Queue Management
- `GET /api/mikrotik/queue/simple` - Simple queues
- `GET /api/mikrotik/queue/tree` - Queue tree
- `POST /api/mikrotik/queue/simple` - Create simple queue
- `PUT /api/mikrotik/queue/simple/:id` - Update simple queue
- `DELETE /api/mikrotik/queue/simple/:id` - Delete simple queue

### Monitoring
- `GET /api/mikrotik/monitor/traffic/:interface` - Monitor interface traffic
- `GET /api/mikrotik/monitor/resource` - Monitor system resource
- `GET /api/mikrotik/log` - System log

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Pembatasan request per IP
- **Input Validation**: Validasi input dengan Joi
- **Error Handling**: Penanganan error yang komprehensif
- **Logging**: Logging aktivitas dan error

## Environment Variables

```env
# Server Configuration
NODE_ENV=development
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# MikroTik Configuration
MIKROTIK_IP=103.160.69.149
MIKROTIK_PORT=172
MIKROTIK_USERNAME=admin-remote
MIKROTIK_PASSWORD=@AdminInterfast69

# Security
API_SECRET_KEY=your-secret-key-here

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Struktur Project

```
server/
├── controllers/         # Controller untuk handling request
├── services/           # Business logic dan MikroTik API
├── routes/             # Route definitions
├── middleware/         # Custom middleware
├── schemas/            # Validation schemas
├── utils/              # Utility functions
├── logs/               # Log files
├── .env.example        # Environment variables template
├── server.js           # Main server file
└── package.json        # Dependencies
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Check logs
tail -f logs/combined.log
```

## Production Deployment

1. Set environment ke production:
```env
NODE_ENV=production
```

2. Install PM2 untuk process management:
```bash
npm install -g pm2
```

3. Start dengan PM2:
```bash
pm2 start server.js --name "interfast-backend"
pm2 save
pm2 startup
```

## Troubleshooting

### Koneksi MikroTik Gagal
- Pastikan IP, username, dan password benar
- Cek koneksi jaringan ke MikroTik
- Pastikan API service aktif di MikroTik
- Cek port yang digunakan (default 8728)

### Error Authentication
- Verifikasi username dan password MikroTik
- Pastikan user memiliki permission API

### High Memory Usage
- Monitor dengan `pm2 monit`
- Restart jika diperlukan: `pm2 restart interfast-backend`

## Monitoring

- Health check: `GET /health`
- Logs: `tail -f logs/combined.log`
- PM2 monitoring: `pm2 monit`
- System resource: `GET /api/mikrotik/monitor/resource`
