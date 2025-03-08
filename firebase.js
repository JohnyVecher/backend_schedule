const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Загрузи НОВЫЙ JSON

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const messaging = admin.messaging();

module.exports = messaging;
