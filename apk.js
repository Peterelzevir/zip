const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');

const token = '7354445605:AAFHVY8RnYIVEoFs4SNXjPcHbRJptIDO43M'; // Ganti dengan token asli
const bot = new TelegramBot(token, { polling: true });

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileName = msg.document.file_name;

  if (!fileName.endsWith('.dex')) {
    return bot.sendMessage(chatId, 'Kirim file .dex ya!');
  }

  const fileId = msg.document.file_id;
  const filePath = path.join(__dirname, `temp_${Date.now()}`);
  await fs.mkdir(filePath);

  const dexPath = path.join(filePath, fileName);
  const zipPath = path.join(filePath, 'decompiled.zip');

  try {
    // Unduh file
    const file = await bot.getFileLink(fileId);
    const res = await fetch(file);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(dexPath, Buffer.from(buffer));

    // Jalankan jadx
    const jadxOutput = path.join(filePath, 'output');
    await fs.mkdir(jadxOutput);

    bot.sendMessage(chatId, 'Mendekompilasi file...');

    await new Promise((resolve, reject) => {
      exec(`jadx -d "${jadxOutput}" "${dexPath}"`, (err, stdout, stderr) => {
        if (err) return reject(stderr);
        resolve(stdout);
      });
    });

    // Kompres hasil ke ZIP
    const zip = new AdmZip();
    zip.addLocalFolder(jadxOutput);
    zip.writeZip(zipPath);

    // Kirim hasil
    await bot.sendDocument(chatId, zipPath, {
      caption: 'Berikut hasil dekompilasi .dex kamu (kode sumber).'
    });

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, 'Gagal memproses file.');
  } finally {
    await fs.remove(filePath);
  }
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Kirim file .dex dan saya akan mengembalikan file source-nya!');
});
