const mqtt = require('mqtt');
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware wajib hosting
app.use(cors());
app.use(express.json());

// 1. KONEKSI POSTGRESQL DATABASE
// Saat di-hosting (Render/Railway), isi DATABASE_URL di Environment Variable cloud Anda
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:password_anda@localhost:5432/db_water_monitoring",
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // Wajib true jika menggunakan Supabase/Neon Cloud
});

// 2. KONEKSI MQTT BROKER
const mqttClient = mqtt.connect(process.env.MQTT_URL || "mqtt://broker.hivemq.com:1883");
const topicData = "air/monitoring/data_baru";
const topicSet  = "air/monitoring/setting";

let setting = { phMin: 6.5, phMax: 8.5, turbMax: 50, h1: 10, h2: 50 };
let relay1 = false, relay2 = false;

let terakhirSimpanDb = 0;
const JEDA_SIMPAN = 10 * 60 * 1000; // Simpan ke database tiap 10 menit sekali

mqttClient.on('connect', () => {
    console.log("🟢 Terhubung ke Broker MQTT Cloud");
    mqttClient.subscribe(topicSet);
    
    // Mulai simulasi interval alat IoT
    setInterval(bacaDanProsesSensor, 3000);
});

mqttClient.on('message', (topic, message) => {
    if (topic === topicSet) {
        try {
            setting = { ...setting, ...JSON.parse(message.toString()) };
            console.log("📥 Setingan parameter diperbarui:", setting);
        } catch (e) { console.error("Gagal update setting", e.message); }
    }
});

function bacaDanProsesSensor() {
    const phSimulasi = parseFloat((6.0 + Math.random() * 3.0).toFixed(2));
    const turbSimulasi = Math.floor(20 + Math.random() * 50);
    const levelSimulasi = Math.floor(5 + Math.random() * 60);

    relay1 = (phSimulasi < setting.phMin || phSimulasi > setting.phMax || turbSimulasi > setting.turbMax);
    if (levelSimulasi <= setting.h1) relay2 = true;
    else if (levelSimulasi >= setting.h2) relay2 = false;

    const payload = { ph: phSimulasi, turb: turbSimulasi, level: levelSimulasi, r1: relay1, r2: relay2 };
    
    // Publish data real-time ke MQTT agar ditangkap card Front-End
    mqttClient.publish(topicData, JSON.stringify(payload));

    // Throttling: Masukkan ke database log hanya setiap 10 menit sekali
    const sekarang = Date.now();
    if (sekarang - terakhirSimpanDb >= JEDA_SIMPAN) {
        const queryText = `
            INSERT INTO riwayat_air (ph, kekeruhan, level_air, relay1, relay2, waktu) 
            VALUES ($1, $2, $3, $4, $5, NOW())
        `;
        const values = [payload.ph, payload.turb, payload.level, payload.r1, payload.r2];

        pool.query(queryText, values)
            .then(() => {
                console.log("💾 Log data sensor berhasil dicatat ke PostgreSQL Cloud.");
                terakhirSimpanDb = sekarang;
            })
            .catch(err => console.error("❌ Gagal simpan ke DB:", err.stack));
    }
}

/* ===== REST API ENDPOINT: UTK DIAMBIL FRONT-END ===== */
app.get('/api/riwayat', async (req, res) => {
    const { tanggal } = req.query; // Format yang diterima: YYYY-MM-DD
    if (!tanggal) return res.status(400).json({ error: "Parameter tanggal dibutuhkan" });

    try {
        // Query menyaring data berdasarkan tanggal lokal GMT+7 / WIB
        const queryText = `
            SELECT * FROM riwayat_air 
            WHERE waktu::date = $1 
            ORDER BY waktu DESC
        `;
        const result = await pool.query(queryText, [tanggal]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error DB" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Web Server API Backend berjalan di port ${PORT}`);
});
