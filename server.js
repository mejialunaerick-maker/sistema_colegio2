const express = require('express');
const { Pool } = require('pg');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const path = require('path');

const app = express();
// Render asigna el puerto automáticamente, si no usa el 3000
const port = process.env.PORT || 3000;

app.use(express.json()); 
app.use(express.static('.'));

// 1. Configuración de Mercado Pago
// Usamos variable de entorno o el token de prueba que proporcionaste
const MP_TOKEN = process.env.MP_ACCESS_TOKEN || 'TEST-6065754762822201-032000-e92159ace10fe55d58cbb9b8958a8303-442058643';
const clientMP = new MercadoPagoConfig({ accessToken: MP_TOKEN });

// 2. Configuración de PostgreSQL (Adaptada para Render)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- FUNCIÓN DE AUTO-INSTALACIÓN (OPCIÓN B) ---
async function inicializarBaseDeDatos() {
    try {
        console.log("🛠️ Verificando tablas en la base de datos de Render...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS estudiantes (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                matricula VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100)
            );

            CREATE TABLE IF NOT EXISTS conceptos (
                id SERIAL PRIMARY KEY,
                nombre_concepto VARCHAR(100) NOT NULL,
                monto_sugerido DECIMAL(10, 2) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pagos (
                pago_id SERIAL PRIMARY KEY,
                estudiante_id INTEGER REFERENCES estudiantes(id),
                concepto_id INTEGER REFERENCES conceptos(id),
                monto_pagado DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                estado_pago VARCHAR(20) DEFAULT 'pendiente',
                fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            INSERT INTO conceptos (nombre_concepto, monto_sugerido)
            SELECT 'Colegiatura UTAC', 20.00
            WHERE NOT EXISTS (SELECT 1 FROM conceptos);
        `);
        console.log("✅ Base de Datos inicializada correctamente.");
    } catch (err) {
        console.error("❌ Error al inicializar tablas:", err.message);
    }
}

inicializarBaseDeDatos();

// URL BASE: Render te asigna una automáticamente, la detectamos
const URL_BASE = process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";

// --- RUTA: REGISTRAR NUEVO ESTUDIANTE ---
app.post('/api/registrar_estudiante', async (req, res) => {
    const { nombre, matricula, email } = req.body; 
    try {
        const resEst = await pool.query(
            'INSERT INTO estudiantes (nombre, matricula, email) VALUES ($1, $2, $3) RETURNING id',
            [nombre, matricula, email]
        );
        const estudianteId = resEst.rows[0].id;

        await pool.query(
            "INSERT INTO pagos (estudiante_id, concepto_id, estado_pago, monto_pagado) VALUES ($1, 1, 'pendiente', 0.00)",
            [estudianteId]
        );

        res.json({ success: true, id: estudianteId });
    } catch (err) {
        console.error("❌ Error registro:", err.message);
        res.status(500).json({ error: "Error en la DB", detalle: err.message });
    }
});

// --- RUTA: CONSULTA POR MATRÍCULA ---
app.get('/api/consulta/:matricula', async (req, res) => {
    const { matricula } = req.params;
    try {
        const query = `
            SELECT e.nombre, c.nombre_concepto, p.estado_pago, p.pago_id
            FROM estudiantes e
            JOIN pagos p ON e.id = p.estudiante_id
            JOIN conceptos c ON p.concepto_id = c.id
            WHERE e.matricula = $1
        `;
        const result = await pool.query(query, [matricula]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send("Error en la consulta");
    }
});

// --- RUTA: CREAR PREFERENCIA MERCADO PAGO ---
app.post("/api/create_preference", async (req, res) => {
    try {
        const preference = new Preference(clientMP);
        const body = {
            items: [{
                title: req.body.description || "Pago Colegiatura UTAC",
                quantity: 1,
                unit_price: Number(req.body.price),
                currency_id: "MXN"
            }],
            back_urls: {
                success: `${URL_BASE}/consulta.html`,
                failure: `${URL_BASE}/consulta.html`,
                pending: `${URL_BASE}/consulta.html`
            },
            auto_return: "approved",
            notification_url: `${URL_BASE}/webhook`,
            external_reference: String(req.body.pago_id)
        };

        const response = await preference.create({ body });
        res.json({ id: response.id });
    } catch (error) {
        console.error("❌ Error MP:", error.message);
        res.status(400).json({ error: error.message });
    }
});

// --- WEBHOOK: CONFIRMACIÓN DE PAGO ---
app.post("/webhook", async (req, res) => {
    const paymentId = req.query['data.id'] || req.query.id;

    if (paymentId) {
        try {
            const responseMP = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
            });
            const data = await responseMP.json();

            if (data.status === "approved") {
                const pagoIdDB = data.external_reference;
                if (pagoIdDB) {
                    await pool.query("UPDATE pagos SET estado_pago = 'pagado' WHERE pago_id = $1", [pagoIdDB]);
                    console.log(`⭐ PAGO CONFIRMADO: ID ${pagoIdDB}`);
                }
            }
        } catch (e) { 
            console.error("❌ Error Webhook:", e.message); 
        }
    }
    res.status(200).send("OK");
});

app.listen(port, () => {
    console.log(`🚀 Servidor UTAC en línea: ${URL_BASE}`);
});