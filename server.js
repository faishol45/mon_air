const mqtt = require('mqtt');

// Menghubungkan ke broker HiveMQ via TCP protocol (Standard Node.js)
const client = mqtt.connect("mqtt://broker.hivemq.com:1883", {
    keepalive: 60,
    reconnectPeriod: 2000,
    clean: true,
    clientId: 'iot_backend_node_' + Math.random().toString(16).substr(2, 8)
});

const topicData = "air/monitoring/data_baru";
const topicSet  = "air/monitoring/setting";

// Konfigurasi Default Batas Parameter Kontrol
let setting = {
    phMin: 6.5,
    phMax: 8.5,
    turbMax: 50,
    h1: 10,
    h2: 50
};

// State Status Relay Sistem saat ini
let relay1 = false; // Misal: Pompa filter air kotor
let relay2 = false; // Misal: Pompa pengisian air utama

client.on('connect', () => {
    console.log("🟢 Back-End Service Terkoneksi ke Broker MQTT");
    // Subscribe ke topik pengaturan dari Front-End
    client.subscribe(topicSet, (err) => {
        if (!err) console.log(`Subscribed ke topik: ${topicSet}`);
    });

    // Mulai interval simulasi pembacaan hardware sensor tiap 3 detik
    setInterval(bacaDanProsesSensor, 3000);
});

// Menangani perubahan setingan yang dikirim dari Dashboard Front-End
client.on('message', (topic, message) => {
    if (topic === topicSet) {
        try {
            const newSetting = JSON.parse(message.toString());
            setting = { ...setting, ...newSetting };
            console.log("📥 Batas Parameter Diperbarui dari Front-End:", setting);
        } catch (e) {
            console.error("❌ Gagal parsing data setting:", e.message);
        }
    }
});

function bacaDanProsesSensor() {
    // 1. Simulasi Pembacaan Fluktuasi Sensor Fisik/IoT
    const phSimulasi = parseFloat((6.0 + Math.random() * 3.0).toFixed(2));     // Rentang pH: 6.0 s/d 9.0
    const turbSimulasi = Math.floor(20 + Math.random() * 50);                  // Rentang NTU: 20 s/d 70
    const levelSimulasi = Math.floor(5 + Math.random() * 60);                  // Rentang Level: 5 s/d 65 cm

    // 2. Logika Pemrosesan Otomasi Relay (Back-end Logic)
    
    // Relay 1 Aktif jika pH diluar batas aman ATAU air terlalu keruh (Butuh filtrasi)
    if (phSimulasi < setting.phMin || phSimulasi > setting.phMax || turbSimulasi > setting.turbMax) {
        relay1 = true;
    } else {
        relay1 = false;
    }

    // Relay 2 Aktif jika air berada di bawah batas minimum h1 (Butuh isi ulang tangki)
    // Dan otomatis mati jika air sudah mencapai batas atas h2
    if (levelSimulasi <= setting.h1) {
        relay2 = true; 
    } else if (levelSimulasi >= setting.h2) {
        relay2 = false;
    }

    // 3. Kemas data menjadi payload JSON
    const payload = {
        ph: phSimulasi,
        turb: turbSimulasi,
        level: levelSimulasi,
        r1: relay1,
        r2: relay2,
        timestamp: new Date().toISOString()
    };

    // 4. Publish data hasil pemrosesan ke Front-End
    client.publish(topicData, JSON.stringify(payload), { qos: 0 }, (err) => {
        if (!err) {
            console.log(`📤 Data Sensor Terkirim -> pH: ${payload.ph}, NTU: ${payload.turb}, Lvl: ${payload.level}cm | R1:${payload.r1 ? 'ON':'OFF'} R2:${payload.r2 ? 'ON':'OFF'}`);
        }
    });
}

client.on('error', (err) => {
    console.error("❌ MQTT Error:", err);
});