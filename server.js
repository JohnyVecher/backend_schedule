require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

app.get("/", (req, res) => {
    res.send("Сервер работает!");
});

app.get('/api/lessons', async (req, res) => {
    try {
        const { week, day } = req.query;
        const result = await pool.query(
            'SELECT * FROM lessons WHERE week_number = $1 AND day_of_week = $2',
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
            'SELECT * FROM lessonste31 WHERE week_number = $1 AND day_of_week = $2',
            [week, day]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

const keepAwake = () => {
    setInterval(() => {
        fetch('https://backend-schedule-b6vy.onrender.com')
            .then(() => console.log("Сервер пробужден"))
            .catch(err => console.error("Ошибка пробуждения сервера:", err));
    }, 20000);
};

keepAwake();