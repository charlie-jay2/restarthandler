const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

let db;
const serverData = {};

MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
    .then(client => {
        db = client.db('adminPanel');
        console.log('✅ Connected to MongoDB');
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/maintenance-status', async (req, res) => {
    const control = await db.collection('adminControls').findOne({ type: 'maintenance' });
    res.json({ status: control?.status || false });
});

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

app.get('/restart-status', async (req, res) => {
    const control = await db.collection('adminControls').findOne({ type: 'restart' });
    res.json({ status: control?.status || false });
});

app.post('/restart', async (req, res) => {
    await db.collection('adminControls').updateOne(
        { type: 'restart' },
        { $set: { status: true } },
        { upsert: true }
    );
    res.sendStatus(200);
});

app.post('/reset-restart', async (req, res) => {
    await db.collection('adminControls').updateOne(
        { type: 'restart' },
        { $set: { status: false } }
    );
    res.sendStatus(200);
});

app.get('/live-servers', (req, res) => {
    res.json(serverData);
});

// Called by Roblox game server to register/update itself
app.post('/update-server', (req, res) => {
    const { serverId, players } = req.body;
    serverData[serverId] = {
        players,
        lastUpdated: new Date().toISOString()
    };
    io.emit('serverUpdate', { serverId, players });
    res.sendStatus(200);
});

// Kick/Ban
app.post('/command', async (req, res) => {
    const { serverId, action, targetUserId, reason, duration } = req.body;
    io.emit('adminCommand', {
        serverId,
        action,
        targetUserId,
        reason,
        duration: duration || 0
    });
    console.log(`🔧 Admin ${action} requested:`, { serverId, targetUserId, reason, duration });
    res.sendStatus(200);
});

server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
