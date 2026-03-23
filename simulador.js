const axios = require('axios');

const API_URL = 'http://localhost:3000/api/event';

const enviarEvento = async (estadoPuerta, lat, lng, descripcion) => {
    console.log(`\n🚚 [Simulador] Enviando evento: ${descripcion}...`);

    const data = {
        deviceId: "TRAILER-01-AGS",
        payload: {
            doorStatus: estadoPuerta, // "CLOSED", "OPEN_FORCED", "OPEN_AUTHORIZED"
            location: { lat, lng },
            speed: estadoPuerta === "CLOSED" ? 80 : 0,
            alert: estadoPuerta === "OPEN_FORCED"
        }
    };

    try {
        const res = await axios.post(API_URL, data);
        console.log(`✅ Registro exitoso en DB y Solana.`);
        console.log(`🔗 ID del evento: ${res.data._id}`);
        console.log(`🛡️ Hash generado: ${res.data.hash}`);
    } catch (err) {
        console.error("❌ Error conectando al servidor. ¿Está encendido node server.js?");
    }
};

// --- FLUJO DE PRUEBA ---
const iniciarPrueba = async () => {
    // 1. El camión va normal por la salida a México
    await enviarEvento("CLOSED", 21.8486, -102.2805, "Camión en ruta normal");

    // 2. Simulamos el robo después de 3 segundos
    setTimeout(async () => {
        await enviarEvento("OPEN_FORCED", 21.8200, -102.2500, "¡ROBO DETECTADO! Puerta forzada en carretera");
        console.log("\n🚀 Prueba terminada. Ahora puedes revisar tu base de datos o Solana Explorer.");
    }, 3000);
};

iniciarPrueba();