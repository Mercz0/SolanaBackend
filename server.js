const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { generateHash } = require('./utils/security');
const Event = require('./models/Event');
const { sendHashToSolana } = require('./utils/solana');
const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect('mongodb://127.0.0.1:27017/iot-guard')
    .then(() => console.log("✅ MongoDB Local Conectado (Mac M3 Power)"))
    .catch(err => console.error("❌ Error al conectar Mongo Local:", err));

app.post('/api/event', async (req, res) => {
    try {
        const { deviceId, payload } = req.body;
        const timestamp = Date.now();

        const hash = generateHash({ deviceId, payload, timestamp });

        const newEvent = new Event({
            deviceId,
            payload,
            timestamp,
            hash,
            status: 'pending'
        });
        await newEvent.save();

        try {
            const signature = await sendHashToSolana(hash);

            newEvent.solanaSignature = signature;
            newEvent.status = 'verified';
            await newEvent.save();

            console.log(`✅ Evento verificado en Solana: ${signature.substring(0, 10)}...`);
        } catch (solErr) {
            console.error("⚠️ Solana falló, el log queda como 'pending' en DB");
        }

        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/verify/:id', async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).send("Evento no encontrado");

        const dataNow = { deviceId: event.deviceId, payload: event.payload, timestamp: event.timestamp };
        const currentHash = generateHash(dataNow);

        const isDbIntact = (currentHash === event.hash);

        res.json({
            status: isDbIntact ? "🟢 INTEGRIDAD OK" : "🔴 DATOS ALTERADOS",
            evidence: {
                dbHash: event.hash,
                actualHash: currentHash,
                solanaTx: `https://explorer.solana.com/tx/${event.solanaSignature}?cluster=devnet`
            },
            message: isDbIntact
                ? "El registro coincide con la firma digital en Blockchain."
                : "¡Alerta de seguridad! Los datos en MongoDB han sido manipulados."
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.listen(3000, () => console.log(`Server listo en http://localhost:3000`));