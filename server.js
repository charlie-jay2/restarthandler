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

// Store current server/player data
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

// Maintenance Controls
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

// Restart Controls
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

// Receive in-game server data
app.post('/update-server', (req, res) => {
    const { serverId, players } = req.body;
    if (!serverId || !players) {
        return res.status(400).json({ error: "Missing serverId or players data" });
    }

    // Store or process the server data
    serverData[serverId] = players;

    // Emit the update to clients connected via Socket.io
    io.emit('serverUpdate', { serverId, players });

    console.log(`Server data updated for ${serverId}:`, players);

    res.sendStatus(200);
});

// Admin actions: Kick & Ban
app.post('/command', async (req, res) => {
    const { serverId, action, targetUserId, reason, duration } = req.body;

    // Insert ban data into MongoDB for tracking
    if (action === 'ban') {
        const banData = {
            userId: targetUserId,
            reason: reason || "No reason provided",
            duration: duration || 0,
            time: new Date().toISOString() // Store the time the ban occurred
        };

        // Save ban data to MongoDB (collection "bans")
        await db.collection('bans').updateOne(
            { userId: targetUserId },
            { $set: banData },
            { upsert: true } // If the player doesn't exist, it will insert a new document
        );
    }

    // Broadcast the action to Roblox game
    io.emit('adminCommand', {
        serverId,
        action,
        targetUserId,
        reason,
        duration: duration || 0
    });

    // Optional: Log to DB or Discord here
    console.log(`🔧 Admin ${action} requested:`, { serverId, targetUserId, reason, duration });
    res.sendStatus(200);
});

// Moderation Notifications
app.post('/send-moderation-notification', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if the player has already seen the notification
    let notificationStatus = await db.collection('notifications').findOne({ userId });

    // If no notification entry exists, create it with shown = false
    if (!notificationStatus) {
        notificationStatus = { shown: false };
        await db.collection('notifications').insertOne({ userId, shown: false });
    }

    // If the player hasn't seen the notification yet
    if (notificationStatus.shown === false) {
        // Emit a notification signal to the specific client via Socket.io
        io.to(userId).emit('moderationNotification', { userId });

        // Update the status in the database to mark it as shown (true) after the notification is sent
        await db.collection('notifications').updateOne(
            { userId },
            { $set: { shown: true } }
        );

        console.log(`🔔 Sent moderation notification to user ID: ${userId}`);
    } else {
        console.log(`🔔 User ID ${userId} has already seen the moderation notification.`);
    }

    res.sendStatus(200);
});

// Endpoint to check if player is banned
app.get('/check-ban', async (req, res) => {
    const { userId } = req.query;
    const ban = await db.collection('bans').findOne({ userId });
    if (ban) {
        res.json({
            banned: true,
            reason: ban.reason,
            duration: ban.duration,
            time: ban.time
        });
    } else {
        res.json({ banned: false });
    }
});

// Start the server
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
