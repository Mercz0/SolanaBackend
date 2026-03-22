const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { generateHash } = require('./utils/security');
const Event = require('./models/Event');

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
        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log(`🚀 Server listo en http://localhost:3000`));