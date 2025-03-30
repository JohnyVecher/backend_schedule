require('dotenv').config();
const { createClient } = require("@supabase/supabase-js");
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const admin = require('firebase-admin');
const fs = require('fs');

const supabaseUrl = "https://xyfvnuseelbsfmgroqrn.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5ZnZudXNlZWxic2ZtZ3JvcXJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDMxMDc2OCwiZXhwIjoyMDU1ODg2NzY4fQ.qbGUpC2cZIPpcjXypHx_eDppVO_WnVawWVG5qp6Bso4";
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)

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

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!fs.existsSync(serviceAccountPath)) {
    console.error("Файл Firebase Admin SDK не найден. Убедитесь, что он есть локально и указан в переменной GOOGLE_APPLICATION_CREDENTIALS");
    process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(process.env.GOOGLE_APPLICATION_CREDENTIALS))
});

app.get("/", (req, res) => {
    res.send("Сервер работает!");
});

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

app.post('/api/subscribe', async (req, res) => {
    try {
        console.log("Запрос на подписку получен:", req.body);
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

function getDayOfWeekName(dayOfWeek) {
  const days = [
    "Воскресенье",
    "Понедельник",
    "Вторник",
    "Среда",  
    "Четверг", 
    "Пятница", 
    "Суббота",    
  ];

  return days[dayOfWeek] || "Неизвестный день";
}

if (!global.isSubscribed) {
  global.isSubscribed = true;
  console.log("Подписка на изменения в расписании TE_21B");

  supabase
    .channel("custom-insert-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "te_21b" },
      async (payload) => {
        console.log("Изменение в расписании:", payload);

        const changedDay = payload.new?.day_of_week;
        if (changedDay === undefined || changedDay === null) {
          console.log("День недели не найден в payload");
          return;
        }

        try {
          const result = await pool.query(
            "SELECT DISTINCT token FROM subscriptions WHERE group_name = $1",
            ["TE21B"]
          );

          const tokens = result.rows.map((row) => row.token);
          console.log("Токены для группы TE21B:", tokens);

          if (tokens.length === 0) {
            console.log("Нет подписчиков для группы TE21B");
            return;
          }

          const dayName = getDayOfWeekName(changedDay);
          const message = `Расписание изменено: ${dayName}`;

          const response = await admin.messaging().sendEachForMulticast({
            notification: { title: "Изменение в расписании", body: message },
            tokens,
          });

          console.log("Уведомления отправлены:", response);
          if (response.failureCount > 0) {
            console.error("Ошибки при отправке уведомлений:", response.responses);
          }
        } catch (err) {
          console.error("Ошибка при отправке уведомлений:", err);
        }
      }
    )
    .subscribe();
}

