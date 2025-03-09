require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const admin = require('firebase-admin');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Подключение к базе данных
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

// Подключение Firebase Admin SDK
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!fs.existsSync(serviceAccountPath)) {
    console.error("Файл Firebase Admin SDK не найден. Убедитесь, что он есть локально и указан в переменной GOOGLE_APPLICATION_CREDENTIALS");
    process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(process.env.GOOGLE_APPLICATION_CREDENTIALS))
});

// Проверка работы сервера
app.get("/", (req, res) => {
    res.send("Сервер работает!");
});

// API для получения занятий
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

// Подписка на уведомления (привязка токена пользователя к группе)
app.post('/api/subscribe', async (req, res) => {
    try {
        console.log("Запрос на подписку получен:", req.body); // <== ЛОГ В КОНСОЛИ
        const { token, group } = req.body;

        if (!token || !group) {
            return res.status(400).send("Необходимо передать токен и группу");
        }

        await pool.query(
            'INSERT INTO subscriptions (token, group_name) VALUES ($1, $2) ON CONFLICT (token) DO UPDATE SET group_name = $2',
            [token, group]
        );

        res.status(200).send("Подписка успешно оформлена");
    } catch (err) {
        console.error("Ошибка при подписке:", err);
        res.status(500).send('Ошибка при подписке');
    }
});

// Отправка уведомлений
app.post('/sendNotification', async (req, res) => {
    try {
        const { group, message } = req.body;

        if (!group || !message) {
            return res.status(400).send("Необходимо передать группу и сообщение");
        }

        const result = await pool.query(
            'SELECT token FROM subscriptions WHERE group_name = $1',
            [group]
        );

        const tokens = result.rows.map(row => row.token);

        if (tokens.length === 0) {
            return res.status(404).send("Нет подписчиков для этой группы");
        }

        const payload = {
            notification: {
                title: "Расписание изменено",
                body: message
            },
            tokens
        };

        await admin.messaging().sendEachForMulticast(payload);
        res.status(200).send("Уведомления отправлены");
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка при отправке уведомлений");
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

// Автоматический пинг для Render
const keepAwake = () => {
    setInterval(() => {
        fetch('https://backend-schedule-b6vy.onrender.com')
            .then(() => console.log("Сервер пробужден"))
            .catch(err => console.error("Ошибка пробуждения сервера:", err));
    }, 20000);
};

keepAwake();
