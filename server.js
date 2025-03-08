require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const admin = require('firebase-admin');
const fetch = require('node-fetch'); // Для keepAwake()

// Инициализация Express
const app = express();
app.use(cors());
app.use(express.json());

// Подключение к PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

// Инициализация Firebase Admin SDK
const serviceAccount = require("./firebase-adminsdk.json"); // Убедись, что этот файл есть в проекте
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Список подписчиков на уведомления
let subscribers = {};

// Корневой маршрут
app.get("/", (req, res) => {
    res.send("Сервер работает!");
});

// Получение расписания TE_21B
app.get('/api/lessons', async (req, res) => {
    try {
        const { week, day } = req.query;
        const result = await pool.query(
            'SELECT * FROM TE_21B WHERE week_number = $1 AND day_of_week = $2',
            [week, day]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// Получение расписания TE_31B
app.get('/api/lessonste31', async (req, res) => {
    try {
        const { week, day } = req.query;
        const result = await pool.query(
            'SELECT * FROM TE_31B WHERE week_number = $1 AND day_of_week = $2',
            [week, day]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// Подписка на push-уведомления
app.post('/api/subscribe', (req, res) => {
    const { group, token } = req.body;
    if (!group || !token) {
        return res.status(400).json({ error: "Отсутствует группа или токен" });
    }
    
    if (!subscribers[group]) {
        subscribers[group] = new Set();
    }
    subscribers[group].add(token);
    res.json({ message: "Подписка оформлена" });
});

// Проверка изменений в расписании
const previousData = {};

async function checkForChanges() {
    try {
        const groups = ["TE_21B", "TE_31B"];
        for (let group of groups) {
            const result = await pool.query(`SELECT * FROM ${group}`);
            const newData = JSON.stringify(result.rows);

            if (previousData[group] && previousData[group] !== newData) {
                console.log(`Изменение в расписании группы ${group}`);
                sendPushNotification(group);
            }
            previousData[group] = newData;
        }
    } catch (err) {
        console.error("Ошибка при проверке изменений:", err);
    }
}

// Отправка push-уведомления
async function sendPushNotification(group) {
    if (!subscribers[group] || subscribers[group].size === 0) {
        return;
    }

    const tokens = Array.from(subscribers[group]);
    const message = {
        notification: {
            title: "Расписание изменено",
            body: `Изменения в расписании группы ${group}`
        },
        tokens: tokens
    };

    try {
        const response = await admin.messaging().sendMulticast(message);
        console.log("Отправлены уведомления:", response.successCount);
    } catch (err) {
        console.error("Ошибка отправки push-уведомлений:", err);
    }
}

// Проверка изменений каждые 60 секунд
setInterval(checkForChanges, 60000);

// KeepAwake для Render
const keepAwake = () => {
    setInterval(() => {
        fetch('https://backend-schedule-b6vy.onrender.com')
            .then(() => console.log("Сервер пробужден"))
            .catch(err => console.error("Ошибка пробуждения сервера:", err));
    }, 20000);
};

keepAwake();

// Запуск сервера
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
