const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    payload: { type: Object, required: true },
    timestamp: { type: Number, required: true },
    hash: { type: String, required: true },
    solanaSignature: { type: String, default: null },
    status: { type: String, default: 'pending' }
});

module.exports = mongoose.model('Event', EventSchema);