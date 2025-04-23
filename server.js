const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

let db;

MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
    .then(client => {
        db = client.db('adminPanel');
        console.log('Connected to MongoDB');
    })
    .catch(err => console.error(err));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get restart status
app.get('/restart-status', async (req, res) => {
    const control = await db.collection('adminControls').findOne({ type: 'restart' });
    res.json({ status: control?.status || false });
});

// Set restart = true
app.post('/restart', async (req, res) => {
    await db.collection('adminControls').updateOne(
        { type: 'restart' },
        { $set: { status: true } },
        { upsert: true }
    );
    res.sendStatus(200);
});

// Reset restart = false
app.post('/reset-restart', async (req, res) => {
    await db.collection('adminControls').updateOne(
        { type: 'restart' },
        { $set: { status: false } }
    );
    res.sendStatus(200);
});

// Get maintenance status
app.get('/maintenance-status', async (req, res) => {
    const control = await db.collection('adminControls').findOne({ type: 'maintenance' });
    res.json({ status: control?.status || false });
});

// Toggle maintenance mode
app.post('/toggle-maintenance', async (req, res) => {
    const control = await db.collection('adminControls').findOne({ type: 'maintenance' });
    const newStatus = !(control?.status || false);
    await db.collection('adminControls').updateOne(
        { type: 'maintenance' },
        { $set: { status: newStatus } },
        { upsert: true }
    );
    res.json({ status: newStatus });
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
