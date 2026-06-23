const mqtt = require('mqtt');
const { Client } = require('pg'); // Library PostgreSQL

// 1. KONEKSI DATABASE (Disarankan menggunakan Environment Variable di Cloud Hosting)
const db = new Client({
    connectionString: process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/dbname"
});
db.connect()
  .then(() => console.log("💾 Terhubung ke Database Cloud PostgreSQL"))
  .catch(err => console.error("❌ Gagal koneksi database:", err));

// 2. KONEKSI MQTT BROKER
const client = mqtt.connect(process.env.MQTT_URL || "mqtt://broker.hivemq.com:1883");
const topicData = "air/monitoring/data_baru";
const topicSet  = "air/monitoring/setting";

let setting = { phMin: 6.5, phMax: 8.5, turbMax: 50, h1: 10, h2: 50 };
let relay1 = false, relay2 = false;

client.on('connect', () => {
    console.log("🟢 Back-End Cloud Aktif");
    client.subscribe(topicSet);
    setInterval(bacaDanProsesSensor, 3000);
});

// Menerima setingan baru dan menyimpannya di database (opsional)
client.on('message', (topic, message) => {
    if (topic === topicSet) {
        try {
            setting = { ...setting, ...JSON.parse(message.toString()) };
            console.log("📥 Batas Parameter Diperbarui:", setting);
        } catch (e) { console.error(e.message); }
    }
});

function bacaDanProsesSensor() {
    const phSimulasi = parseFloat((6.0 + Math.random() * 3.0).toFixed(2));
    const turbSimulasi = Math.floor(20 + Math.random() * 50);
    const levelSimulasi = Math.floor(5 + Math.random() * 60);

    // Logika kontrol relay
    relay1 = (phSimulasi < setting.phMin || phSimulasi > setting.phMax || turbSimulasi > setting.turbMax);
    if (levelSimulasi <= setting.h1) relay2 = true;
    else if (levelSimulasi >= setting.h2) relay2 = false;

    const payload = { ph: phSimulasi, turb: turbSimulasi, level: levelSimulasi, r1: relay1, r2: relay2 };

    // 3. QUERY SIMPAN KE DATABASE (Tabel: riwayat_air)
    const query = `INSERT INTO riwayat_air (ph, kekeruhan, level_air, relay1, relay2, waktu) VALUES ($1, $2, $3, $4, $5, NOW())`;
    const values = [payload.ph, payload.turb, payload.level, payload.r1, payload.r2];
    
    db.query(query, values)
      .catch(err => console.error("❌ Gagal simpan ke DB:", err));

    client.publish(topicData, JSON.stringify(payload));
}
