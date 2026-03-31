# REDi — Bot Backend

Backend del sistema REDi: chatbot de WhatsApp potenciado con IA para gestión de recargas móviles. Procesa cientos de solicitudes diarias en producción, integrando la API de Meta (WhatsApp), OCR con Google Gemini Vision, autenticación JWT, Redis para estados conversacionales y comunicación en tiempo real con Socket.IO.

## Arquitectura general

```
WhatsApp (usuario)
    │
    ▼
Meta Webhook ──► Express API
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       Redis      MySQL    Gemini Vision
   (sesiones)   (datos)     (OCR)
          │
          ▼
      Socket.IO ──► Dashboard (redi-dashboard-frontend)
```

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22+ (ESM) |
| Framework | Express 4 |
| Tiempo real | Socket.IO 4 |
| Caché / sesiones | Redis (ioredis) |
| Base de datos | MySQL 2 |
| IA / OCR | Google Gemini Vision (`@google/generative-ai`) |
| Autenticación | JWT (`jsonwebtoken`) + bcrypt |
| Proceso productivo | PM2 (`ecosystem.config.cjs`) |

## Estructura del proyecto

```
redi-bot-backend/
├── src/
│   ├── routes/          # Definición de endpoints REST y webhooks
│   ├── controllers/     # Lógica de negocio por módulo
│   ├── middlewares/     # Auth JWT, validaciones, manejo de errores
│   └── ...
├── index.js             # Entry point: Express + Socket.IO
├── ecosystem.config.cjs # Configuración PM2 para producción
├── package.json
└── .env                 # Variables de entorno (ver sección abajo)
```

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
PORT=3000

# Base de datos
DB_HOST=localhost
DB_USER=root
DB_PASS=tu_password
DB_NAME=nombre_bd

# WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN=tu_access_token
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_VERIFY_TOKEN=tu_verify_token
WHATSAPP_BUSINESS_ACCOUNT_ID=tu_business_account_id

# Google Gemini Vision
GEMINI_ENABLED=true
GEMINI_API_KEY=tu_api_key

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# API interna RED Comunicación Móvil
CLIENT_API_URL_GET_DATA_CHIP=http://127.0.0.1:8000/api/getDataChip
CLIENT_API_URL_UPDATE_CHIP=http://127.0.0.1:8000/api/updateRecharge
CHIP_API_REVERT_DATA_SIM=http://127.0.0.1:8000/api/revertDataSim
CLIENT_API_URL_VALIDATE_MAYORISTA=http://127.0.0.1:8000/api/mayoristas/validateChip
CLIENT_API_URL_MAYORISTA_BUSCAR_CLIENTES=http://127.0.0.1:8000/api/mayoristas/buscarClientes
CLIENT_API_URL_MAYORISTA_ASIGNAR_VENDEDOR=http://127.0.0.1:8000/api/mayoristas/asignarVendedor
CHIP_API_TOKEN=tu_chip_api_token

# Autenticación
JWT_SECRET=tu_jwt_secret
JWT_EXPIRES=24h
```

## Instalación y ejecución

```bash
# Clonar el repositorio
git clone https://github.com/EdgarIsmael435/redi-bot-backend.git
cd redi-bot-backend

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Desarrollo
npm run dev

# Producción con PM2
pm2 start ecosystem.config.cjs
pm2 save
```

## Requisitos previos

- Node.js 22+
- MySQL 8+
- Redis 6+
- Cuenta de Meta Developer con app de WhatsApp Business configurada
- API Key de Google Gemini

## Flujo principal

1. Meta envía eventos al webhook (`POST /webhook`) al recibir mensajes de WhatsApp.
2. El controlador identifica el tipo de mensaje (texto, imagen, quick replies) y recupera o crea el estado de sesión desde Redis.
3. Si el mensaje contiene una imagen, se extrae mediante OCR con Gemini Vision (ICCID, DN, monto).
4. El flujo conversacional avanza según el estado y se persiste en Redis.
5. Los datos validados se almacenan en MySQL y se emite un evento Socket.IO al dashboard en tiempo real.

## Producción

El proyecto incluye `ecosystem.config.cjs` para gestión con PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 logs redi-bot
pm2 monit
pm2 restart redi-bot
```

## Repositorio relacionado

- **Dashboard de operadores:** [redi-dashboard-frontend](https://github.com/EdgarIsmael435/redi-dashboard-frontend)
