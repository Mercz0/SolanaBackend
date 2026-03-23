const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { generateHash } = require('./utils/security');
const Event = require('./models/Event');
const {
    updateTruckOnChain,
    createTruckAccount,
    getTruckStateFromSolana,
    getTruckHistory
} = require('./utils/solana');

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect('mongodb://127.0.0.1:27017/iot-guard')
    .then(() => console.log("✅ MongoDB Conectado"))
    .catch(err => console.error("❌ Error Mongo:", err));

// Registro inicial del camión y creación de cuenta en Solana
app.post('/api/fleet/register', async (req, res) => {
    try {
        const { truckId, driver, route } = req.body;
        const truckPubkey = await createTruckAccount();
        const payload = {
            status: "READY",
            location: { lat: 21.8823, lng: -102.2825 },
            doorStatus: "CLOSED",
            driver,
            routeName: route,
            blockchainAddress: truckPubkey
        };
        const timestamp = Date.now();
        const hash = generateHash({ deviceId: truckId, payload, timestamp });

        const signature = await updateTruckOnChain(truckPubkey, "CLOSED", hash);
        const newReg = new Event({ deviceId: truckId, payload, timestamp, hash, solanaSignature: signature, status: 'verified' });

        await newReg.save();
        res.status(201).json(newReg);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Registro de eventos estándar (Ubicación, Sensores)
app.post('/api/event', async (req, res) => {
    try {
        const { deviceId, payload, truckPubkey } = req.body;
        const timestamp = Date.now();
        const hash = generateHash({ deviceId, payload, timestamp });
        const signature = await updateTruckOnChain(truckPubkey, payload.doorStatus, hash);

        const newEvent = new Event({ deviceId, payload, timestamp, hash, solanaSignature: signature, status: 'verified' });
        await newEvent.save();
        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// RUTA DE LLEGADA DE CAMION
app.post('/api/arrival', async (req, res) => {
    try {
        const { deviceId, truckPubkey } = req.body;

        const previousEvent = await Event.findOne({ deviceId }).sort({ timestamp: -1 });
        if (!previousEvent) {
            return res.status(404).json({ message: "No se encontró un evento previo para este camión." });
        }

        const payload = {
            ...previousEvent.payload,
            status: "DELIVERED",
            location: { lat: 19.4326, lng: -99.1332 },
            doorStatus: "CLOSED",
            message: "Entrega finalizada y verificada.",
            alert: false,
            description: "Entrega finalizada y verificada en destino."
        };
        const timestamp = Date.now();
        const hash = generateHash({ deviceId, payload, timestamp });
        const signature = await updateTruckOnChain(truckPubkey, "DELIVERED", hash);

        const finalEvent = new Event({ deviceId, payload, timestamp, hash, solanaSignature: signature, status: 'verified' });
        await finalEvent.save();
        res.status(201).json(finalEvent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Auditoría Cruzada: Compara MongoDB vs Solana (La más importante)
app.get('/api/verify/:id', async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ message: "Evento no encontrado" });

        let truckPubkey = event.payload.blockchainAddress;
        if (!truckPubkey || truckPubkey.length < 32) {
            const firstReg = await Event.findOne({ deviceId: event.deviceId, "payload.blockchainAddress": { $exists: true } });
            truckPubkey = firstReg ? firstReg.payload.blockchainAddress : null;
        }

        const solanaState = await getTruckStateFromSolana(truckPubkey);
        if (!solanaState) return res.status(404).json({ message: "No hay datos en Solana", checkedPubkey: truckPubkey });

        const recalculatedHash = generateHash({ deviceId: event.deviceId, payload: event.payload, timestamp: event.timestamp });
        const isIntegrityOk = (recalculatedHash === solanaState.last_event_hash);

        res.json({
            status: isIntegrityOk ? "🟢 INTEGRIDAD TOTAL" : "🔴 DATOS ALTERADOS",
            match: isIntegrityOk,
            evidence: {
                mongoHash: recalculatedHash,
                solanaHash: solanaState.last_event_hash,
                solanaTx: `https://explorer.solana.com/tx/${event.solanaSignature}?cluster=devnet`
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reconstrucción del historial completo desde la Blockchain
app.get('/api/fleet/:truckPubkey/reconstruct', async (req, res) => {
    try {
        const history = await getTruckHistory(req.params.truckPubkey);
        res.json({ truckPubkey: req.params.truckPubkey, timeline: history });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Listado de todos los eventos en DB
app.get('/api/fleet/all', async (req, res) => {
    try {
        const fleet = await Event.find().sort({ timestamp: -1 });
        res.json(fleet);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Simular manipulación de DB (Cover-up)
app.put('/api/event/:id/simulate-coverup', async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ message: "No encontrado" });

        event.payload.doorStatus = "CLOSED";
        event.payload.alert = false;
        event.markModified('payload');
        await event.save();

        res.json({ message: "⚠️ ENCUBRIMIENTO SIMULADO en MongoDB." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log(`🚀 Servidor listo en Puerto 3000`));