const messaging = require("./firebase");

async function sendNotification(tokens, message) {
  try {
    if (!tokens || tokens.length === 0) {
      console.log("Нет подписчиков для отправки уведомления.");
      return;
    }

    const payload = {
      notification: {
        title: "Изменение в расписании",
        body: message,
      },
      tokens: tokens,
    };

    const response = await messaging.sendEachForMulticast(payload);
    console.log("✅ Уведомления отправлены:", response);
  } catch (error) {
    console.error("❌ Ошибка отправки уведомления:", error);
  }
}

module.exports = sendNotification;
