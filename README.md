# FacturaMail AI - Gestor Inteligente de Facturas Gmail

Sistema integral para buscar, extraer y gestionar facturas desde cuentas de Gmail (propias y de terceros), con análisis contable mediante IA (Gemini 2.5 Flash), detección de enlaces a portales de clientes ("Ver factura en portal") y descargas directas en PDF, ZIP y Excel.

---

## 🚀 Características Principales

1. **Soporte Multicuenta (Gmail OAuth 2.0)**:
   - Conecta buzones propios o de clientes/terceros de forma segura sin pedir contraseñas.
   - Sincronización automática de emails que contienen facturas.

2. **Detección de Facturas en Portales de Clientes (Sin adjunto)**:
   - Identifica emails donde la factura **no viene adjunta** pero incluye botones o enlaces como *"Ver factura en el portal de clientes"*, *"Entra a tu área privada para descargarla"*, *"Acceso a facturación"*, etc.
   - Registra una **Alerta** con el enlace directo al portal y el contexto del correo para que no se te escape ningún gasto.

3. **Extracción Contable Inteligente con IA (Gemini 2.5 Flash)**:
   - Analiza los PDFs e imágenes adjuntas y extrae con precisión:
     - **Proveedor / Razón Social**
     - **CIF / NIF / VAT**
     - **Número de Factura**
     - **Fecha de Emisión**
     - **Base Imponible**
     - **% Tipo de IVA**
     - **Cuota de IVA (€)**
     - **Total Factura (€)**
     - **Moneda**

4. **Descargas y Exportación para Gestoría**:
   - **Descarga individual en 1 clic** del PDF original.
   - **Descarga masiva en archivo ZIP** (por trimestre o año) con nombres organizados (`2026-03-15_Proveedor_NumFactura.pdf`).
   - **Exportación a Excel / CSV** del libro contable de facturas recibidas (con codificación UTF-8 compatible con acentos y símbolos en Excel).

---

## 🛠️ Configuración Inicial en 3 Pasos

### 1. Clonar o acceder a la carpeta del proyecto
```bash
cd gestor-facturas-gmail
npm install
```

### 2. Configurar Credenciales de Google Cloud (OAuth 2.0)
Para poder conectar cuentas de Gmail:
1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto (o usa uno existente) y ve a **APIs y Servicios > Biblioteca**.
3. Activa la **Gmail API**.
4. Ve a **Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: *Externo* (o *Interno* si es Google Workspace corporativo).
   - Añade el ámbito (scope): `.../auth/gmail.readonly` y `.../auth/userinfo.email`.
   - En *Usuarios de prueba* (Test users), añade tu correo de Gmail y los que quieras probar.
5. Ve a **Credenciales > Crear credenciales > ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - URI de redirección autorizada: `http://localhost:3000/auth/google/callback`.
6. Copia el **Client ID** y el **Client Secret**.

### 3. Obtener clave de Gemini API (Gratis)
1. Ve a [Google AI Studio](https://aistudio.google.com/) y genera una API Key gratuita.

### 4. Crear el archivo `.env`
Copia `.env.example` como `.env` e introduce tus claves:
```env
PORT=3000
GOOGLE_CLIENT_ID=tu_cliente_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_cliente_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GEMINI_API_KEY=tu_gemini_api_key
```

---

## ▶️ Ejecución

Para iniciar el servidor:
```bash
npm start
```
Abre en tu navegador:
👉 **http://localhost:3000**

---

## 📂 Estructura del Proyecto

```
gestor-facturas-gmail/
├── src/
│   ├── config.js              # Variables de entorno y rutas
│   ├── database.js            # Base de datos SQLite nativa (node:sqlite)
│   ├── server.js              # Servidor Express y APIs
│   ├── services/
│   │   ├── gmailService.js    # Conexión OAuth2 y consultas a Gmail API
│   │   ├── invoiceExtractor.js# Extractor contable con Gemini 2.5 Flash
│   │   ├── linkDetector.js    # Detector de enlaces a portales ("Ver factura en portal")
│   │   └── syncService.js     # Orquestador del flujo de sincronización
│   └── routes/
│       ├── auth.js            # Login Google OAuth
│       ├── accounts.js        # Gestión y sincronización de cuentas
│       ├── invoices.js        # Listado, filtros, descarga PDF, ZIP y CSV
│       └── alerts.js          # Gestión de alertas de facturas en portales
├── public/                    # Panel web visual interactivo
│   ├── index.html             # Interfaz moderna con Tailwind CSS
│   └── app.js                 # Lógica cliente y llamadas AJAX
├── storage/                   # Almacenamiento organizado de PDFs descargados
│   └── invoices/
└── data/                      # Base de datos SQLite persistente (facturas.db)
```
