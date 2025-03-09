require('dotenv').config();
const { createClient } = require("@supabase/supabase-js");
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const admin = require('firebase-admin');
const fs = require('fs');

const supabaseUrl = "https://xyfvnuseelbsfmgroqrn.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5ZnZudXNlZWxic2ZtZ3JvcXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzMTA3NjgsImV4cCI6MjA1NTg4Njc2OH0.E5NW1w88SfMq_VKHrV84SNeomcG3uZFrsJ-CQgmVnYk";
const supabase = createClient(supabaseUrl, supabaseKey);

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

supabase
  .channel("custom-insert-channel")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "te_21b" },
    async (payload) => {
      console.log("Изменение в расписании:", payload);

      const changedDay = payload.new?.day_of_week;
      if (!changedDay) return;

      // Отправляем уведомление подписчикам
      const result = await pool.query(
        "SELECT token FROM subscriptions WHERE group_name = $1",
        ["TE_21B"]
      );

      const tokens = result.rows.map((row) => row.token);
      if (tokens.length === 0) return;

      const message = `Расписание изменилось (${changedDay})`;
      await admin.messaging().sendEachForMulticast({
        notification: { title: "Изменение в расписании", body: message },
        tokens,
      });

      console.log("Уведомления отправлены подписчикам TE_21B");
    }
  )
  .subscribe();