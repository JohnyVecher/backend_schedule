const messaging = require("./firebase");

// Функция для отправки пуш-уведомлений
async function sendNotification(token, message) {
  try {
    const payload = {
      notification: {
        title: "Расписание изменено",
        body: message,
      },
      token: token,
    };

    const response = await messaging.send(payload);
    console.log("Уведомление отправлено:", response);
  } catch (error) {
    console.error("Ошибка отправки уведомления:", error);
  }
}

module.exports = sendNotification;
